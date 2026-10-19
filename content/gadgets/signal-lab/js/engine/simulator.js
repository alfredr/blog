// Runs a circuit as a stream, forward in time from 0 for as long as it is asked to.
//
// Time model: the stream advances in chunks of a few tens of milliseconds. In each chunk every
// wire carries the samples of that stretch of time at its own sample rate, and blocks are causal
// processors that keep their state from one chunk to the next. The stream splits the block graph
// into strongly connected components and runs them upstream first. A lone block takes a whole
// chunk in one call. A feedback loop (a component with a cycle) must contain a delay, and its
// blocks are stepped together in spans no longer than the shortest delay, so every value a block
// reads already exists. Loops run at a single sample rate.
//
// Loading a changed circuit keeps the stream where it is. A block whose kind and rates are
// unchanged keeps its processor and takes new settings in place where it can, so turning a knob
// changes what happens from then on and leaves the past alone.
import { isDelayProcessor, RateError, sharedRate, } from './block.js';
import { portKey, } from './circuit.js';
import { errorMessage, errorName } from './errors.js';
import { resolveParams } from './params.js';
import { hash } from './random.js';
import { sampleCount } from './signal.js';
/** The longest chunk, in seconds and in samples on the fastest wire. */
const CHUNK_SECONDS = 1 / 32;
const CHUNK_SAMPLES = 32768;
/**
 * Errors whose message is written for the user; anything else is reported as a
 * crash.
 */
const EXPLAINED = new Set(['RateError', 'BlockError']);
const same = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= 1e-9 * v);
export class Stream {
    #lookup;
    #circuit;
    #steps = [];
    /** The fastest rate anywhere, which sets how long a chunk can be. */
    #fastest = 1;
    #running = new Map();
    /** Blocks that threw as they ran, with why; they stay out until reset. */
    #faults = new Map();
    #buffers = new Map();
    #silence = new Float32Array(0);
    #time = 0;
    constructor(lookup) {
        this.#lookup = lookup;
    }
    /** Seconds simulated so far. */
    get time() {
        return this.#time;
    }
    /** Runs `circuit` from where the stream is. */
    load(circuit) {
        this.#faults.clear();
        return this.#plan(circuit);
    }
    /** Pushes a block, as a button on the face does. */
    press(id) {
        this.#running.get(id)?.processor.press?.();
    }
    /** Back to time 0, with every block built afresh. */
    reset() {
        this.#time = 0;
        this.#running.clear();
        this.#faults.clear();
        return this.#circuit && this.#plan(this.#circuit);
    }
    /** Simulates up to `until` seconds, handing over each chunk as it is done. */
    advance(until, onChunk) {
        const longest = Math.min(CHUNK_SECONDS, CHUNK_SAMPLES / this.#fastest);
        while (until - this.#time > 1e-9) {
            const from = this.#time;
            const to = Math.min(until, from + longest);
            const chunk = this.#step(from, to);
            this.#time = to;
            onChunk?.(chunk);
        }
    }
    #plan(circuit) {
        this.#circuit = circuit;
        const { nodes, unknown } = this.#nodes(circuit);
        const status = new Map();
        const rates = new Map();
        const running = new Map();
        const steps = [];
        let rebuilt = 0;
        for (const block of unknown) {
            status.set(block.id, {
                state: 'error',
                message: `Unknown block type "${block.kind}".`,
            });
        }
        // Carries a block on if it was built for the same rates, retuned if need be.
        const start = (node, inputRates, outputRates) => {
            const old = this.#running.get(node.id);
            const params = JSON.stringify(node.params);
            if (old &&
                old.kind === node.type.kind &&
                same(old.inputRates, inputRates) &&
                same(old.outputRates, outputRates) &&
                (old.params === params || old.processor.update?.(node.params))) {
                old.params = params;
                return old;
            }
            rebuilt++;
            return {
                kind: node.type.kind,
                processor: node.type.create(node.params, {
                    inputRates,
                    outputRates,
                    time: this.#time,
                    seed: seedOf(node),
                }),
                inputRates,
                outputRates,
                params,
                reported: '[]',
            };
        };
        const block = (node) => {
            const { type, params } = node;
            const inputRates = node.sources.map((source) => source ? rates.get(portKey(source)) : undefined);
            for (let i = 0; i < inputRates.length; i++) {
                if (node.sources[i] && inputRates[i] === undefined) {
                    return idle(`No signal reaches input "${type.inputs[i].name}".`);
                }
            }
            // Idle with nothing wired in, unless it can do without all its inputs.
            const needed = type.inputs.filter((port) => !port.optional);
            if (needed.length > 0 &&
                type.inputs.every((port, i) => port.optional || !node.sources[i])) {
                return idle('Not connected.');
            }
            try {
                const outputRates = type.rates
                    ? type.rates(inputRates, params)
                    : defaultRates(type, inputRates);
                // An unconnected input reads silence at the rate of the connected ones.
                const fill = inputRates.find((rate) => rate !== undefined) ?? outputRates[0] ?? 0;
                const r = start(node, inputRates.map((rate) => rate ?? fill), outputRates);
                running.set(node.id, r);
                steps.push({ loop: false, node, running: r });
                outputRates.forEach((rate, port) => rates.set(portKey({ block: node.id, port }), rate));
                return { state: 'ok', rates: outputRates };
            }
            catch (error) {
                return failed(error);
            }
        };
        const loop = (component) => {
            const members = new Map(component.map((node, k) => [node.id, k]));
            // Signals entering the loop from outside set its one sample rate.
            const entering = [];
            for (const node of component) {
                for (const source of node.sources) {
                    if (source && !members.has(source.block)) {
                        const rate = rates.get(portKey(source));
                        if (rate === undefined) {
                            return idle('No signal enters the loop.');
                        }
                        entering.push(rate);
                    }
                }
            }
            let rate;
            try {
                rate = sharedRate(entering);
            }
            catch (error) {
                return failed(error);
            }
            if (rate === undefined) {
                return failure('A feedback loop needs an input from outside it to set its sample rate.');
            }
            const loopRate = rate;
            for (const node of component) {
                try {
                    const inputRates = node.sources.map((source) => source ? loopRate : undefined);
                    const outputRates = node.type.rates
                        ? node.type.rates(inputRates, node.params)
                        : node.type.outputs.map(() => loopRate);
                    if (outputRates.some((r) => Math.abs(r - loopRate) > 1e-9 * loopRate)) {
                        return failure(`${node.label} changes the sample rate, which a feedback loop can't do. Move it outside the loop.`);
                    }
                }
                catch (error) {
                    return failed(error);
                }
            }
            let built;
            try {
                built = component.map((node) => start(node, node.sources.map(() => loopRate), node.type.outputs.map(() => loopRate)));
            }
            catch (error) {
                return failed(error);
            }
            const isDelay = built.map((r) => isDelayProcessor(r.processor));
            const delays = isDelay.flatMap((delay, k) => (delay ? [k] : []));
            if (delays.length === 0) {
                return failure('This feedback loop has no Delay block. Every loop needs one.');
            }
            const order = orderWithinLoop(component, isDelay, members);
            if (!order) {
                return failure('One of the loops here has no Delay block. Every loop needs one.');
            }
            const span = Math.max(1, Math.min(...delays.map((k) => {
                const processor = built[k].processor;
                return isDelayProcessor(processor) ? processor.latency : 1;
            })));
            component.forEach((node, k) => {
                running.set(node.id, built[k]);
                node.type.outputs.forEach((_, port) => rates.set(portKey({ block: node.id, port }), loopRate));
            });
            steps.push({
                loop: true,
                nodes: component,
                running: built,
                rate: loopRate,
                delays,
                order,
                span,
            });
            return { state: 'ok', rates: [loopRate] };
        };
        for (const component of components(nodes)) {
            const fault = component
                .map((node) => this.#faults.get(node.id))
                .find(Boolean);
            const outcome = fault
                ? failure(fault)
                : isLoop(component)
                    ? loop(component)
                    : block(component[0]);
            for (const node of component) {
                status.set(node.id, outcome.state === 'ok'
                    ? {
                        state: 'ok',
                        rates: node.type.outputs.map((_, port) => rates.get(portKey({ block: node.id, port }))),
                    }
                    : outcome);
            }
        }
        this.#running = running;
        this.#steps = steps;
        this.#fastest = Math.max(1, ...[...running.values()].flatMap((r) => [
            ...r.inputRates,
            ...r.outputRates,
        ]));
        return { status, rebuilt };
    }
    #step(from, to) {
        const signals = new Map();
        const count = (rate) => sampleCount(to, rate) - sampleCount(from, rate);
        const output = (block, port, rate) => {
            const key = portKey({ block, port });
            const n = count(rate);
            let buffer = this.#buffers.get(key);
            if (!buffer || buffer.length < n) {
                buffer = new Float32Array(Math.max(n, 1024));
                this.#buffers.set(key, buffer);
            }
            const data = buffer.subarray(0, n);
            signals.set(key, { rate, start: sampleCount(from, rate), data });
            return data;
        };
        // Never written to: processors only read their inputs.
        const silence = (rate) => {
            const n = count(rate);
            if (this.#silence.length < n) {
                this.#silence = new Float32Array(n);
            }
            return this.#silence.subarray(0, n);
        };
        const input = (source, rate) => (source && signals.get(portKey(source))?.data) ?? silence(rate);
        let faulted = false;
        for (const step of this.#steps) {
            try {
                if (!step.loop) {
                    const { node, running } = step;
                    const outputs = running.outputRates.map((rate, port) => output(node.id, port, rate));
                    const inputs = node.sources.map((source, i) => input(source, running.inputRates[i]));
                    const end = outputs[0]?.length ?? count(running.inputRates[0] ?? 0);
                    running.processor.process(inputs, outputs, 0, end);
                    if (isDelayProcessor(running.processor)) {
                        running.processor.keep(inputs, end);
                    }
                    continue;
                }
                const { nodes, running, rate } = step;
                const outputs = nodes.map((node) => node.type.outputs.map((_, port) => output(node.id, port, rate)));
                const members = new Map(nodes.map((node, k) => [node.id, k]));
                const inputs = nodes.map((node) => node.sources.map((source) => {
                    const member = source ? members.get(source.block) : undefined;
                    return source && member !== undefined
                        ? outputs[member][source.port]
                        : input(source, rate);
                }));
                const n = count(rate);
                const order = [...step.delays, ...step.order];
                // Delays first: their output for this span only needs input from earlier spans.
                for (let start = 0; start < n; start += step.span) {
                    const end = Math.min(n, start + step.span);
                    for (const k of order) {
                        running[k].processor.process(inputs[k], outputs[k], start, end);
                    }
                }
                for (const k of step.delays) {
                    const processor = running[k].processor;
                    if (isDelayProcessor(processor)) {
                        processor.keep(inputs[k], n);
                    }
                }
            }
            catch (error) {
                const message = failed(error);
                for (const node of step.loop ? step.nodes : [step.node]) {
                    this.#faults.set(node.id, message.state === 'error' ? message.message : 'Failed.');
                }
                faulted = true;
            }
        }
        const readings = new Map();
        for (const [id, running] of this.#running) {
            const now = running.processor.readings?.();
            if (!now) {
                continue;
            }
            const json = JSON.stringify(now);
            if (json !== running.reported) {
                running.reported = json;
                readings.set(id, now);
            }
        }
        return {
            from,
            to,
            signals,
            readings,
            ...(faulted && this.#circuit
                ? { status: this.#plan(this.#circuit).status }
                : {}),
        };
    }
    #nodes(circuit) {
        const types = new Map();
        const unknown = [];
        for (const block of circuit.blocks) {
            const type = this.#lookup(block.kind);
            if (type) {
                types.set(block.id, type);
            }
            else {
                unknown.push(block);
            }
        }
        const sources = new Map();
        for (const [id, type] of types) {
            sources.set(id, type.inputs.map(() => undefined));
        }
        for (const wire of circuit.wires) {
            const inputs = sources.get(wire.to.block);
            const from = types.get(wire.from.block);
            if (!inputs ||
                !from ||
                wire.to.port < 0 ||
                wire.to.port >= inputs.length) {
                continue;
            }
            if (wire.from.port < 0 || wire.from.port >= from.outputs.length) {
                continue;
            }
            inputs[wire.to.port] = wire.from;
        }
        const nodes = [];
        for (const block of circuit.blocks) {
            const type = types.get(block.id);
            if (!type) {
                continue;
            }
            nodes.push({
                id: block.id,
                label: block.name || type.label,
                type,
                params: resolveParams(type.params, block.params),
                sources: sources.get(block.id) ?? [],
            });
        }
        return { nodes, unknown };
    }
}
/**
 * Streams a circuit for its first `seconds` and keeps every signal, for when
 * the whole run is wanted at once.
 */
export function simulate(lookup, circuit, seconds) {
    const stream = new Stream(lookup);
    let { status } = stream.load(circuit);
    const pieces = new Map();
    const readings = new Map();
    stream.advance(seconds, (chunk) => {
        for (const [key, signal] of chunk.signals) {
            let entry = pieces.get(key);
            if (!entry) {
                pieces.set(key, (entry = { rate: signal.rate, parts: [] }));
            }
            entry.parts.push(signal.data.slice());
        }
        for (const [id, now] of chunk.readings) {
            readings.set(id, now);
        }
        status = chunk.status ?? status;
    });
    const signals = new Map();
    for (const [key, { rate, parts }] of pieces) {
        const data = new Float32Array(parts.reduce((sum, part) => sum + part.length, 0));
        let at = 0;
        for (const part of parts) {
            data.set(part, at);
            at += part.length;
        }
        signals.set(key, { rate, data });
    }
    return { signals, status, readings };
}
/**
 * Strongly connected components of the block graph, upstream first (Tarjan's
 * algorithm).
 */
function components(nodes) {
    const position = new Map(nodes.map((node, i) => [node.id, i]));
    const consumers = new Map(nodes.map((node) => [node.id, []]));
    for (const node of nodes) {
        for (const source of node.sources) {
            if (source) {
                consumers.get(source.block)?.push(node);
            }
        }
    }
    let counter = 0;
    const index = new Map();
    const low = new Map();
    const stack = [];
    const onStack = new Set();
    const found = [];
    const visit = (node) => {
        index.set(node.id, counter);
        low.set(node.id, counter);
        counter++;
        stack.push(node);
        onStack.add(node.id);
        for (const next of consumers.get(node.id)) {
            if (!index.has(next.id)) {
                visit(next);
                low.set(node.id, Math.min(low.get(node.id), low.get(next.id)));
            }
            else if (onStack.has(next.id)) {
                low.set(node.id, Math.min(low.get(node.id), index.get(next.id)));
            }
        }
        if (low.get(node.id) === index.get(node.id)) {
            const component = [];
            let member;
            do {
                member = stack.pop();
                onStack.delete(member.id);
                component.push(member);
            } while (member !== node);
            found.push(component.sort((a, b) => position.get(a.id) - position.get(b.id)));
        }
    };
    for (const node of nodes) {
        if (!index.has(node.id)) {
            visit(node);
        }
    }
    // Tarjan finds downstream components first.
    return found.reverse();
}
function isLoop(component) {
    const only = component[0];
    return (component.length > 1 ||
        only.sources.some((source) => source?.block === only.id));
}
/**
 * Order for the loop's non-delay blocks so each runs after the members feeding
 * it. Delay outputs are ready at the start of every span, so edges out of
 * delays impose no order. Returns undefined when a cycle remains, meaning some
 * loop has no delay in it.
 */
function orderWithinLoop(component, isDelay, members) {
    const pending = new Map();
    const feeds = new Map();
    component.forEach((node, k) => {
        if (isDelay[k]) {
            return;
        }
        let count = 0;
        for (const source of node.sources) {
            const from = source ? members.get(source.block) : undefined;
            if (from === undefined || isDelay[from]) {
                continue;
            }
            count++;
            feeds.set(from, [...(feeds.get(from) ?? []), k]);
        }
        pending.set(k, count);
    });
    const ready = [...pending]
        .filter(([, count]) => count === 0)
        .map(([k]) => k);
    const order = [];
    while (ready.length) {
        const k = ready.shift();
        order.push(k);
        for (const next of feeds.get(k) ?? []) {
            const count = pending.get(next) - 1;
            pending.set(next, count);
            if (count === 0) {
                ready.push(next);
            }
        }
    }
    return order.length === pending.size ? order : undefined;
}
function defaultRates(type, inputRates) {
    const rate = sharedRate(inputRates);
    if (rate === undefined) {
        throw new RateError(`${type.label} has no sample rate.`);
    }
    return type.outputs.map(() => rate);
}
function seedOf(node) {
    return hash(node.id) % 4294967296;
}
function idle(reason) {
    return { state: 'idle', reason };
}
function failure(message) {
    return { state: 'error', message };
}
function failed(error) {
    const message = errorMessage(error);
    return failure(EXPLAINED.has(errorName(error) ?? '')
        ? message
        : `Simulation error: ${message}`);
}

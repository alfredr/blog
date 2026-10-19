// Turning a document into the flat circuit the simulator runs. Subsystems dissolve: their blocks
// join the circuit under path ids ("rx/diode"), and each terminal's hidden port is wired to
// whatever connects to the subsystem outside. Each antenna becomes the halves of it that are
// wired, one radiating and one hearing, and hidden Air blocks carry what the others radiate to
// each one that hears.
// The engine never sees hierarchy, so caching and loops work across subsystem boundaries.
// Instruments only watch or set things, so they and the wires into them are left out, except
// a Button, which is a source the face can push.
import { blockType } from '../blocks/index.js';
import { isInstrument, isSimulated } from '../blocks/instruments.js';
import { airType, ANTENNA, HEAR, RADIATE } from '../blocks/radio.js';
import { portKey, } from '../engine/circuit.js';
import { isSubsystem, pathId, terminals, } from './document.js';
import { evaluate } from './expressions.js';
import { displayName } from './subsystems.js';
/** Ids of the hidden blocks that carry what antennas radiate. */
const AIR = '@air';
/**
 * The id of the half of an antenna that radiates. The half that hears keeps
 * the antenna's own id, so its output is the antenna's.
 */
const radiating = (id) => `${id}@radiate`;
/**
 * Resolves bindings scope by scope. A block sees the parameters of its own
 * diagram, then of each diagram around it. A subsystem's bindings set the
 * parameters inside it, and are worked out where the subsystem sits.
 */
export function resolveBindings(doc) {
    const values = new Map();
    const errors = new Map();
    const visit = (diagram, path, outer, overrides) => {
        const own = new Map((diagram.parameters ?? []).map((p) => [
            p.name,
            overrides.get(p.name) ?? p.value,
        ]));
        const lookup = (name) => own.get(name) ?? outer(name);
        for (const block of diagram.blocks) {
            const id = pathId(path, block.id);
            const settings = isSubsystem(block)
                ? new Set((block.inner.parameters ?? []).map((p) => p.name))
                : new Set(Object.entries(blockType(block.kind)?.params ?? {})
                    .filter(([, spec]) => spec.type === 'number')
                    .map(([name]) => name));
            const resolved = {};
            const problems = [];
            for (const [setting, expression] of Object.entries(block.bindings ?? {})) {
                if (!settings.has(setting)) {
                    problems.push(`there is no number setting "${setting}" to bind`);
                    continue;
                }
                const result = evaluate(expression, lookup);
                if (result.ok) {
                    resolved[setting] = result.value;
                }
                else {
                    problems.push(`${setting} = ${expression}: ${result.error}`);
                }
            }
            if (Object.keys(resolved).length) {
                values.set(id, resolved);
            }
            if (problems.length) {
                errors.set(id, problems.join('; '));
            }
            if (isSubsystem(block)) {
                visit(block.inner, [...path, block.id], lookup, new Map(Object.entries(resolved)));
            }
        }
    };
    visit(doc, [], () => undefined, new Map());
    return { values, errors };
}
export function flatten(doc) {
    const bindings = resolveBindings(doc);
    const blocks = [];
    const wires = [];
    const aliases = new Map();
    const radiates = [];
    const hears = [];
    const walk = (diagram, path) => {
        const byId = new Map(diagram.blocks.map((block) => [block.id, block]));
        // A subsystem's ports resolve to its terminals, whose hidden port 0 faces outward.
        const source = (ref) => {
            const block = byId.get(ref.block);
            if (!block) {
                return undefined;
            }
            if (!isSubsystem(block)) {
                return { block: pathId(path, ref.block), port: ref.port };
            }
            const terminal = terminals(block.inner).outputs[ref.port];
            return (terminal && {
                block: pathId([...path, block.id], terminal.id),
                port: 0,
            });
        };
        const target = (ref) => {
            const block = byId.get(ref.block);
            if (!block || isInstrument(block.kind)) {
                return undefined;
            }
            if (block.kind === ANTENNA) {
                return { block: radiating(pathId(path, ref.block)), port: 0 };
            }
            if (!isSubsystem(block)) {
                return { block: pathId(path, ref.block), port: ref.port };
            }
            const terminal = terminals(block.inner).inputs[ref.port];
            return (terminal && {
                block: pathId([...path, block.id], terminal.id),
                port: 0,
            });
        };
        for (const block of diagram.blocks) {
            const id = pathId(path, block.id);
            if (isSubsystem(block)) {
                walk(block.inner, [...path, block.id]);
                terminals(block.inner).outputs.forEach((terminal, port) => aliases.set(portKey({ block: id, port }), portKey({
                    block: pathId([...path, block.id], terminal.id),
                    port: 0,
                })));
                continue;
            }
            if (isInstrument(block.kind) && !isSimulated(block.kind)) {
                continue;
            }
            // Bound settings take their worked-out values; the engine sees plain numbers.
            const bound = bindings.values.get(id);
            const params = bound ? { ...block.params, ...bound } : block.params;
            if (block.kind !== ANTENNA) {
                blocks.push({ id, kind: block.kind, x: 0, y: 0, params });
                continue;
            }
            // An antenna radiates if something is wired in, and hears if its output goes anywhere.
            if (diagram.wires.some((w) => w.to.block === block.id)) {
                radiates.push(id);
                blocks.push({ id: radiating(id), kind: RADIATE, x: 0, y: 0, params });
            }
            if (diagram.wires.some((w) => w.from.block === block.id)) {
                hears.push(id);
                blocks.push({ id, kind: HEAR, x: 0, y: 0, params });
            }
        }
        for (const wire of diagram.wires) {
            const from = source(wire.from);
            const to = target(wire.to);
            if (from && to) {
                wires.push({ id: `${pathId(path, wire.id)}`, from, to });
            }
        }
    };
    walk(doc, []);
    // Each antenna that hears gets the sum of what the others radiate. Antennas
    // that hear the same others share one Air block.
    const airs = new Map();
    const byOthers = new Map();
    for (const id of hears) {
        const others = radiates.filter((other) => other !== id);
        if (!others.length) {
            airs.set(id, undefined);
            continue;
        }
        const key = others.join('\n');
        let air = byOthers.get(key);
        if (!air) {
            const made = byOthers.size ? `${AIR}${byOthers.size + 1}` : AIR;
            byOthers.set(key, made);
            blocks.push({
                id: made,
                kind: airType(others.length).kind,
                x: 0,
                y: 0,
                params: {},
            });
            others.forEach((other, k) => wires.push({
                id: `${made}:in${k}`,
                from: { block: radiating(other), port: 0 },
                to: { block: made, port: k },
            }));
            air = made;
        }
        airs.set(id, air);
        wires.push({
            id: `${air}:to:${id}`,
            from: { block: air, port: 0 },
            to: { block: id, port: 0 },
        });
    }
    return {
        circuit: { blocks, wires },
        bindings,
        aliases,
        airs,
    };
}
/**
 * Signals by port key for every block at every level, subsystem outputs
 * included.
 */
export function signalsWithAliases(signals, aliases) {
    const all = new Map(signals);
    for (const [key, engineKey] of aliases) {
        const signal = signals.get(engineKey);
        if (signal) {
            all.set(key, signal);
        }
    }
    return all;
}
/**
 * Status for every block in the document by full id. A subsystem reports the
 * first error inside it, or the rates of its outputs; an antenna speaks for
 * its two halves, and says when there is nothing else on the air to hear.
 */
export function blockStatuses(doc, flat, engine) {
    const statuses = new Map();
    const visit = (diagram, path) => diagram.blocks.map((block) => {
        const id = pathId(path, block.id);
        let status;
        const binding = flat.bindings.errors.get(id);
        if (binding) {
            status = { state: 'error', message: `Binding: ${binding}.` };
        }
        else if (isInstrument(block.kind) && !isSimulated(block.kind)) {
            // Instruments aren't simulated; they work whenever the page does.
            status = { state: 'ok', rates: [] };
        }
        else if (isSubsystem(block)) {
            const inner = visit(block.inner, [...path, block.id]);
            const failing = inner.findIndex((s) => s.state === 'error');
            if (failing >= 0) {
                const culprit = block.inner.blocks[failing];
                const problem = inner[failing];
                status = {
                    state: 'error',
                    message: `Inside, ${displayName(culprit)}: ${problem.message}`,
                };
            }
            else {
                const rates = terminals(block.inner).outputs.map((t) => {
                    const s = engine.get(pathId([...path, block.id], t.id));
                    return s?.state === 'ok' ? (s.rates[0] ?? NaN) : NaN;
                });
                const running = inner.some((s) => s.state === 'ok');
                status = running
                    ? { state: 'ok', rates }
                    : { state: 'idle', reason: 'Nothing inside is running.' };
            }
        }
        else if (block.kind === ANTENNA) {
            status = antennaStatus(id, flat, engine);
        }
        else {
            status = engine.get(id) ?? { state: 'idle', reason: 'Not simulated.' };
        }
        statuses.set(id, status);
        return status;
    });
    visit(doc, []);
    return statuses;
}
/**
 * An antenna's status from its halves: an error in either, or else what it
 * hears, or else what it radiates.
 */
function antennaStatus(id, flat, engine) {
    const radiate = engine.get(radiating(id));
    const hear = engine.get(id);
    const air = flat.airs.has(id) ? flat.airs.get(id) : null;
    const carried = air ? engine.get(air) : undefined;
    if (radiate?.state === 'error') {
        return radiate;
    }
    if (carried?.state === 'error') {
        return { state: 'error', message: `On the air: ${carried.message}` };
    }
    if (air === undefined) {
        return {
            state: 'idle',
            reason: 'Nothing else is on the air. Wire a signal into another antenna for this one to hear.',
        };
    }
    return (hear ??
        (radiate?.state === 'ok'
            ? { state: 'ok', rates: [] }
            : (radiate ?? { state: 'idle', reason: 'Not connected.' })));
}

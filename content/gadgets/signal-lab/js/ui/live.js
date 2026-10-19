// What the page holds of the running stream: the latest stretch of every port
// on screen, and every block's readings stamped with the time they were made,
// so the page can show things as they stood at the playhead while the stream
// runs a little ahead of it.
/** The longest stretch a trace holds, in samples, whatever its rate. */
const LONGEST = 1 << 22;
/** How long a trace tries to hold, in seconds. */
const HOLD = 20;
/** The latest stretch of one port's samples. */
export class Trace {
    rate;
    #data;
    /** The number in the stream of the sample after the newest. */
    #end = 0;
    /** How many samples it holds, up to its capacity. */
    #held = 0;
    /** Bumped whenever new samples arrive, for anything kept from them. */
    version = 0;
    constructor(rate) {
        this.rate = rate;
        const wanted = Math.min(LONGEST, Math.max(1 << 16, rate * HOLD));
        this.#data = new Float32Array(2 ** Math.ceil(Math.log2(wanted)));
    }
    /** The number of the oldest sample it holds and of the one after the newest. */
    get start() {
        return this.#end - this.#held;
    }
    get end() {
        return this.#end;
    }
    /** Takes samples numbered from `start`; a gap before them reads as silence. */
    add(start, data) {
        const size = this.#data.length;
        const mask = size - 1;
        if (start > this.#end) {
            const gap = Math.min(size, start - this.#end);
            for (let i = 0; i < gap; i++) {
                this.#data[(start - gap + i) & mask] = 0;
            }
            this.#held = Math.min(size, this.#held + gap);
            this.#end = start;
        }
        // Anything from before the newest sample held is already here.
        const skip = Math.max(0, this.#end - start);
        for (let i = skip; i < data.length; i++) {
            this.#data[(start + i) & mask] = data[i];
        }
        if (start + data.length > this.#end) {
            this.#held = Math.min(size, this.#held + start + data.length - this.#end);
            this.#end = start + data.length;
        }
        this.version++;
    }
    /** Samples [from, to) in stream numbering; 0 for any it doesn't hold. */
    read(from, to) {
        const out = new Float32Array(Math.max(0, to - from));
        const mask = this.#data.length - 1;
        const first = Math.max(from, this.start);
        const last = Math.min(to, this.#end);
        for (let n = first; n < last; n++) {
            out[n - from] = this.#data[n & mask];
        }
        return out;
    }
}
/** The stream as the page has it. */
export class Live {
    traces = new Map();
    /** Each block's readings, oldest first, as stamped by the stream. */
    #readings = new Map();
    /** How far the stream has got, in seconds. */
    time = 0;
    /** Takes a run of a port's samples. */
    add(samples) {
        let trace = this.traces.get(samples.key);
        if (trace?.rate !== samples.rate) {
            this.traces.set(samples.key, (trace = new Trace(samples.rate)));
        }
        trace.add(samples.start, samples.data);
    }
    stamp(stamped) {
        let list = this.#readings.get(stamped.block);
        if (!list) {
            this.#readings.set(stamped.block, (list = []));
        }
        list.push(stamped);
    }
    /**
     * Every block's readings as they stood at `t`. Older ones than that are let
     * go: the playhead only moves on, except on a reset.
     */
    readingsAt(t) {
        const now = new Map();
        for (const [block, list] of this.#readings) {
            let k = -1;
            while (k + 1 < list.length && list[k + 1].at <= t + 1e-9) {
                k++;
            }
            if (k > 0) {
                list.splice(0, k);
                k = 0;
            }
            if (k === 0 && list[0].readings.length) {
                now.set(block, list[0].readings);
            }
        }
        return now;
    }
    /** Forgets the traces nobody watches any more. */
    keep(keys) {
        for (const key of this.traces.keys()) {
            if (!keys.has(key)) {
                this.traces.delete(key);
            }
        }
    }
    clear() {
        this.traces.clear();
        this.#readings.clear();
        this.time = 0;
    }
}

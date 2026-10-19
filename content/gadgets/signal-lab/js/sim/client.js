// Browser client for the simulation worker. Sends document and watch-list
// changes immediately, with at most one advance request in flight so loads and
// resets are not blocked by queued simulation work.
export class StreamClient {
    #worker;
    #events;
    #epoch = 0;
    /** Advances sent and not yet answered. */
    #pending = 0;
    #doc;
    #watched = '';
    /** Recordings already handed to the worker. */
    #clips = new Set();
    constructor(events) {
        this.#events = events;
        this.#worker = new Worker(new URL('./worker.js', import.meta.url), {
            type: 'module',
        });
        this.#worker.addEventListener('message', (event) => this.#receive(event.data));
        this.#worker.addEventListener('error', (event) => events.error(event.message || 'The simulation worker failed to start.'));
    }
    /** Whether an advance is under way. */
    get advancing() {
        return this.#pending > 0;
    }
    /** Runs `doc` from where the stream is, if it isn't already running it. */
    load(doc) {
        if (doc !== this.#doc) {
            this.#doc = doc;
            this.#send({ type: 'load', doc });
        }
    }
    /** Watches these port keys, if they aren't the ones watched already. */
    watch(keys) {
        const signature = [...keys].sort().join('\n');
        if (signature !== this.#watched) {
            this.#watched = signature;
            this.#send({ type: 'watch', keys });
        }
    }
    /** Asks the stream to reach `until` seconds, unless an advance is under way. */
    advance(until) {
        if (this.#pending === 0) {
            this.#pending++;
            this.#send({ type: 'advance', until });
        }
    }
    /** Pushes a block, by full id, as a Button does. */
    press(block) {
        this.#send({ type: 'press', block });
    }
    /** Hands the worker recordings, once each. */
    clips(clips) {
        const fresh = clips.filter((clip) => !this.#clips.has(clip.id));
        for (const clip of fresh) {
            this.#clips.add(clip.id);
        }
        if (fresh.length) {
            this.#send({ type: 'clips', clips: fresh });
        }
    }
    /** Whether the worker has a recording. */
    hasClip(id) {
        return this.#clips.has(id);
    }
    /** Back to time 0; anything already on its way from before is dropped. */
    reset() {
        this.#epoch++;
        this.#send({ type: 'reset' });
    }
    #send(message) {
        this.#worker.postMessage(message);
    }
    #receive(message) {
        if (message.type === 'failed') {
            // Whatever was under way has stopped.
            this.#pending = 0;
            this.#events.error(message.error);
            return;
        }
        if (message.type === 'chunk') {
            this.#pending = Math.max(0, this.#pending - 1);
        }
        if (message.epoch !== this.#epoch) {
            return;
        }
        switch (message.type) {
            case 'status':
                this.#events.status(new Map(message.statuses));
                break;
            case 'chunk':
                this.#events.chunk(message);
                break;
            case 'history':
                this.#events.history(message.samples);
        }
    }
}

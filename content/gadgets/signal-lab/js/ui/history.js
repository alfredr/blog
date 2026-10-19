/**
 * Undo and redo history. Continuous edits call preview() during the gesture
 * and commit() at completion, producing one undo step.
 */
export class History {
    static LIMIT = 200;
    #present;
    #past = [];
    #future = [];
    /** Snapshot before the active preview gesture. */
    #anchor;
    #listeners = new Set();
    constructor(initial) {
        this.#present = initial;
    }
    get present() {
        return this.#present;
    }
    get canUndo() {
        return this.#past.length > 0 || this.#anchor !== undefined;
    }
    get canRedo() {
        return this.#future.length > 0;
    }
    preview(next) {
        this.#anchor ??= { value: this.#present };
        this.#present = next;
        this.#notify();
    }
    commit(next) {
        const before = this.#anchor ? this.#anchor.value : this.#present;
        this.#anchor = undefined;
        if (next !== before) {
            this.#past.push(before);
            if (this.#past.length > History.LIMIT) {
                this.#past.shift();
            }
            this.#future = [];
        }
        this.#present = next;
        this.#notify();
    }
    undo() {
        if (this.#anchor) {
            this.#present = this.#anchor.value;
            this.#anchor = undefined;
        }
        else {
            const previous = this.#past.pop();
            if (previous === undefined) {
                return;
            }
            this.#future.push(this.#present);
            this.#present = previous;
        }
        this.#notify();
    }
    redo() {
        const next = this.#future.pop();
        if (next === undefined) {
            return;
        }
        this.#past.push(this.#present);
        this.#present = next;
        this.#notify();
    }
    subscribe(listener) {
        this.#listeners.add(listener);
        return () => this.#listeners.delete(listener);
    }
    #notify() {
        for (const listener of this.#listeners) {
            listener();
        }
    }
}

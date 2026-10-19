import { si } from './format.js';
export function isDelayProcessor(processor) {
    return ('latency' in processor &&
        typeof processor.latency === 'number' &&
        processor.latency >= 1);
}
/** A block's ports that the user wires (not hidden), with their indices. */
export function visiblePorts(ports) {
    return ports.flatMap((port, index) => port.hidden ? [] : [{ port, index }]);
}
/** Lets a block literal infer its parameter types from its specs. */
export function defineBlock(type) {
    return type;
}
/**
 * Thrown by a block that can't run as set up, such as an FT8 message that
 * can't be encoded. Its message is shown as is.
 */
export class BlockError extends Error {
    name = 'BlockError';
}
/**
 * Thrown by `rates` when a block's inputs don't fit together. Its message is
 * shown as is.
 */
export class RateError extends Error {
    name = 'RateError';
}
/**
 * The one rate shared by all connected inputs, or undefined when none are
 * connected.
 */
export function sharedRate(inputRates) {
    let rate;
    for (const r of inputRates) {
        if (r === undefined) {
            continue;
        }
        if (rate !== undefined && Math.abs(r - rate) > 1e-9 * rate) {
            throw new RateError(`Inputs arrive at ${si(rate, 'Hz')} and ${si(r, 'Hz')}. Add a Resample block so they match.`);
        }
        rate = r;
    }
    return rate;
}

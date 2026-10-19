/**
 * How many samples of a stream at `rate` cover its first `time` seconds. Every
 * wire uses this rule, so streams at the same rate always line up sample for
 * sample, and a chunk ends at the same instant on every wire.
 */
export function sampleCount(time, rate) {
    return Math.max(0, Math.floor(time * rate + 1e-6));
}
/** Mean power (mean square) of a signal. */
export function power(data) {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
        sum += data[i] * data[i];
    }
    return data.length ? sum / data.length : 0;
}
export function peak(data) {
    let max = 0;
    for (let i = 0; i < data.length; i++) {
        max = Math.max(max, Math.abs(data[i]));
    }
    return max;
}

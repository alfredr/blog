// Reading thrown values without trusting their type: anything can be thrown, so these check
// shapes rather than classes.
const field = (error, key) => typeof error === 'object' && error !== null && key in error
    ? String(error[key])
    : undefined;
/** The error's name, such as "RateError", if it has one. */
export function errorName(error) {
    return field(error, 'name');
}
export function errorMessage(error) {
    return field(error, 'message') ?? String(error);
}

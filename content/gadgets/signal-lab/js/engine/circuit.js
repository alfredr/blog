/** Key for an output port, used to look up its signal. */
export function portKey(ref) {
    return `${ref.block}:${ref.port}`;
}

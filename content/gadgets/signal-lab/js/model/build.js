// Helpers for defining library diagrams and examples. Coordinates use an
// 8-unit grid. Block dimensions are defined by the layout code and instrument
// shapes; these helpers preserve the supplied positions.
import { BUTTON, CONTROL, NOTE, PLOT, READOUT, SYMBOLS, SPEAKER, } from '../blocks/instruments.js';
import { SUBSYSTEM, } from './document.js';
export function ref(text) {
    const [block, port] = text.split(':');
    return { block: block, port: Number(port ?? 0) };
}
export function diagram(parts, links, notes, parameters) {
    const blocks = Object.entries(parts).map(([id, { name, params = {}, inner, ...part }]) => ({
        id,
        ...part,
        ...(inner ? { kind: SUBSYSTEM, inner } : {}),
        params,
        ...(name ? { name } : {}),
    }));
    return {
        blocks,
        wires: links.map(([from, to], i) => ({
            id: `w${i + 1}`,
            from: ref(from),
            to: ref(to),
        })),
        ...(notes ? { notes } : {}),
        ...(parameters?.length ? { parameters } : {}),
    };
}
/**
 * A parameter's name as inline code, for notes written with String.raw, where
 * a backtick can't be escaped.
 */
export const code = (name) => `\`${name}\``;
export const plot = (x, y, view, { name, span, low, high, stack } = {}) => ({
    kind: PLOT,
    x,
    y,
    ...(name ? { name } : {}),
    params: {
        view,
        ...(span ? { span } : {}),
        ...(low ? { low } : {}),
        ...(high ? { high } : {}),
        ...(stack ? { stack } : {}),
    },
});
/** A Bits to tones view of the FT8 symbol mapper `mapper`. */
export const symbolView = (x, y, mapper, name) => ({
    kind: SYMBOLS,
    x,
    y,
    ...(name ? { name } : {}),
    params: { block: mapper },
});
export const speaker = (x, y) => ({
    kind: SPEAKER,
    x,
    y,
});
/** A control for a parameter, or for `block.setting`. */
export const control = (x, y, target, name, style) => ({
    kind: CONTROL,
    x,
    y,
    ...(name ? { name } : {}),
    params: { target, ...(style ? { style } : {}) },
});
export const readout = (x, y, block, reading, style) => ({
    kind: READOUT,
    x,
    y,
    params: { block, reading, ...(style ? { style } : {}) },
});
export const button = (x, y, name) => ({
    kind: BUTTON,
    x,
    y,
    name,
    params: {},
});
export const note = (x, y, text, face = false) => ({ kind: NOTE, x, y, params: { text, face } });

// A compact way to write diagrams in code, for the library and the examples. Layouts are by
// hand on the 8-unit grid: boxes are 144 x 56, circles 48 x 48, triangles 64 x 56, antennas
// 48 x 64 (port 56 down) and terminals 80 x 32 (port 16 down). Of the instruments, plots are
// 240 x 144, controls 176 x 72, readouts 176 x 64, speakers 64 x 64 and notes 240 x 96.
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

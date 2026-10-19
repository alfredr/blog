import { capacitor } from './detectors.js';
import { bandpass, gaussian, highpass, lowpass } from './filters.js';
import { crcBlock, ft8Decoder, ft8Mapper, ft8Message, ft8Transmitter, ldpcBlock, } from './ft8.js';
import { button, control, note, plot, readout, speaker, symbols, } from './instruments.js';
import { adder, gain, mixer, offset } from './math.js';
import { meter, snrMeter } from './meters.js';
import { clipper, diode, rectifier, square } from './nonlinear.js';
import { airType, antenna, hear, radiate } from './radio.js';
import { constant, noise, oscillator, recording, sweep, vco, voice, } from './sources.js';
import { speech } from './speech.js';
import { inputTerminal, outputTerminal } from './terminals.js';
import { delay, hilbert, resample } from './time.js';
/** Every block type a diagram can contain, in palette order. */
export const blockTypes = [
    oscillator,
    voice,
    recording,
    speech,
    noise,
    constant,
    sweep,
    vco,
    gain,
    offset,
    adder,
    mixer,
    rectifier,
    diode,
    square,
    clipper,
    lowpass,
    highpass,
    bandpass,
    gaussian,
    capacitor,
    meter,
    snrMeter,
    ft8Message,
    crcBlock,
    ldpcBlock,
    ft8Mapper,
    ft8Decoder,
    antenna,
    delay,
    hilbert,
    resample,
    inputTerminal,
    outputTerminal,
    plot,
    speaker,
    control,
    readout,
    symbols,
    button,
    note,
];
export const categories = [
    'Sources',
    'Radio',
    'Math',
    'Nonlinear',
    'Filters',
    'Detectors',
    'Meters',
    'Digital modes',
    'Time and rate',
    'Subsystems',
    'Instruments',
];
const byKind = new Map([...blockTypes, radiate, hear, ft8Transmitter].map((type) => [
    type.kind,
    type,
]));
/**
 * A block type by kind, including the halves antennas run as and the Air
 * blocks the model adds between them, and the one-block FT8 transmitter of
 * documents saved before the subsystem replaced it.
 */
export function blockType(kind) {
    if (kind.startsWith('air:')) {
        return airType(Number(kind.slice(4)));
    }
    return byKind.get(kind);
}

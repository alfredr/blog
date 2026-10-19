import { visiblePorts } from '../engine/block.js';
import { si } from '../engine/format.js';
import { blockAt } from '../model/document.js';
import { displayName, typeOf } from '../model/subsystems.js';
/**
 * Formats a port label from its block path, adding the port name when needed
 * to distinguish multiple ports. Examples: "Station A › Modulator" and "Phase
 * splitter Q".
 */
export function portLabel(doc, ref, direction = 'out') {
    const block = blockAt(doc, ref.block);
    const type = block && typeOf(block);
    const ports = (direction === 'out' ? type?.outputs : type?.inputs) ?? [];
    const port = visiblePorts(ports).length > 1
        ? ` ${ports[ref.port]?.name ?? ref.port}`
        : '';
    return `${blockLabel(doc, ref.block)}${port}`;
}
/** The names of the blocks along a full id: "Station A › Modulator". */
export function blockLabel(doc, fullId) {
    const parts = fullId.split('/');
    return parts
        .map((_, i) => {
        const block = blockAt(doc, parts.slice(0, i + 1).join('/'));
        return block ? displayName(block) : '?';
    })
        .join(' › ');
}
/** An output's sample rate for display, if it has a signal. */
export function rateLabel(status, port) {
    const rate = status?.state === 'ok' ? status.rates[port] : undefined;
    return rate !== undefined && Number.isFinite(rate)
        ? si(rate, 'Hz')
        : undefined;
}

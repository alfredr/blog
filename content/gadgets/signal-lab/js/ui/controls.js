// Inspector controls generated from parameter specs. Each control reports edits through
// `onChange` (as a preview while a slider moves, a commit when it is released) and can be
// updated in place when the value changes elsewhere, such as on undo.
import { si, significant } from '../engine/format.js';
import { coerceParam, } from '../engine/params.js';
import { html } from './dom.js';
import { renderInline } from './markdown.js';
const PREFIXES = {
    G: 1e9,
    M: 1e6,
    k: 1e3,
    K: 1e3,
    m: 1e-3,
    u: 1e-6,
    µ: 1e-6,
    μ: 1e-6,
    n: 1e-9,
};
/** Reads "4.5k", "100 kHz", "20 us", "-3 dB" or "1e5" as a number. */
export function parseQuantity(text) {
    // Case matters for the prefix: m is milli, M is mega.
    const match = /^\s*[xX×]?\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*([GMkKmuµμn]?)/.exec(text.replace(/−/g, '-'));
    if (!match) {
        return undefined;
    }
    const value = Number(match[1]) * (PREFIXES[match[2] ?? ''] ?? 1);
    return Number.isFinite(value) ? value : undefined;
}
export function formatParam(value, spec) {
    switch (spec.unit) {
        case 'Hz':
        case 's':
        case 'V':
            return si(value, spec.unit, 4);
        case 'dB':
            return `${significant(value, 4)} dB`;
        case 'deg':
            return `${significant(value, 4)}°`;
        case 'x':
            return `×${significant(value, 4)}`;
        default:
            return significant(value, 4);
    }
}
const SLIDER_STEPS = 1000;
function toPosition(spec, value) {
    const t = spec.scale === 'log'
        ? Math.log(value / spec.min) / Math.log(spec.max / spec.min)
        : (value - spec.min) / (spec.max - spec.min);
    return Math.round(Math.min(1, Math.max(0, t)) * SLIDER_STEPS);
}
function fromPosition(spec, position) {
    const t = position / SLIDER_STEPS;
    const value = spec.scale === 'log'
        ? spec.min * (spec.max / spec.min) ** t
        : spec.min + t * (spec.max - spec.min);
    // Round log-scale values to three significant digits so they read cleanly.
    return coerceParam(spec, spec.scale === 'log' ? Number(value.toPrecision(3)) : value);
}
/** Where `value` sits along the control's travel, from 0 to 1. */
export const toFraction = (spec, value) => toPosition(spec, value) / SLIDER_STEPS;
/** The value at a point along the control's travel, from 0 to 1. */
export const fromFraction = (spec, fraction) => fromPosition(spec, Math.round(Math.min(1, Math.max(0, fraction)) * SLIDER_STEPS));
let nextControlId = 0;
function blurOnEnter(input) {
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            input.blur();
        }
    });
}
function field(label, help, ...content) {
    const id = `control-${++nextControlId}`;
    const element = html('div', { class: 'control' }, html('label', { class: 'control-label', for: id }, label), ...content);
    if (help) {
        element.append(html('p', { class: 'control-help' }, renderInline(help)));
    }
    return { element, id };
}
function numberControl(spec, value, onChange) {
    if (spec.presets) {
        const select = html('select', {});
        const { element, id } = field(spec.label, spec.help, select);
        select.id = id;
        const fill = (current) => {
            const values = spec.presets.includes(current)
                ? spec.presets
                : [...spec.presets, current].sort((a, b) => a - b);
            select.replaceChildren(...values.map((v) => html('option', { value: v, selected: v === current }, formatParam(v, spec))));
        };
        fill(value);
        select.addEventListener('change', () => onChange(Number(select.value), 'commit'));
        return {
            element,
            update: (v) => document.activeElement === select ? undefined : fill(v),
        };
    }
    const text = html('input', {
        class: 'control-value',
        type: 'text',
        inputmode: 'decimal',
        spellcheck: 'false',
        autocomplete: 'off',
    });
    const slider = html('input', {
        type: 'range',
        min: 0,
        max: SLIDER_STEPS,
        step: 1,
        'aria-label': spec.label,
    });
    const { element, id } = field(spec.label, spec.help, html('div', { class: 'control-row' }, slider, text));
    text.id = id;
    let current = value;
    const show = (v) => {
        current = v;
        if (document.activeElement !== text) {
            text.value = formatParam(v, spec);
        }
        if (document.activeElement !== slider) {
            slider.value = String(toPosition(spec, v));
        }
    };
    show(value);
    slider.addEventListener('input', () => {
        current = fromPosition(spec, Number(slider.value));
        text.value = formatParam(current, spec);
        onChange(current, 'preview');
    });
    slider.addEventListener('change', () => onChange(current, 'commit'));
    const accept = () => {
        const parsed = parseQuantity(text.value);
        if (parsed === undefined) {
            text.value = formatParam(current, spec);
            return;
        }
        const v = coerceParam(spec, parsed);
        text.value = formatParam(v, spec);
        slider.value = String(toPosition(spec, v));
        if (v !== current) {
            current = v;
            onChange(v, 'commit');
        }
    };
    text.addEventListener('change', accept);
    text.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            text.blur();
        }
        if (event.key === 'Escape') {
            text.value = formatParam(current, spec);
            text.blur();
        }
    });
    text.addEventListener('blur', () => (text.value = formatParam(current, spec)));
    return { element, update: (v) => show(v) };
}
function choiceControl(spec, value, onChange) {
    const name = `choice-${++nextControlId}`;
    const buttons = spec.options.map((option) => {
        const input = html('input', {
            type: 'radio',
            name,
            value: option.value,
            checked: option.value === value,
        });
        input.addEventListener('change', () => input.checked && onChange(option.value, 'commit'));
        return {
            input,
            label: html('label', { class: 'segment' }, input, html('span', {}, option.label)),
        };
    });
    const group = html('div', { class: 'segmented', role: 'radiogroup', 'aria-label': spec.label }, ...buttons.map((b) => b.label));
    const element = html('div', { class: 'control' }, html('span', { class: 'control-label' }, spec.label), group);
    if (spec.help) {
        element.append(html('p', { class: 'control-help' }, renderInline(spec.help)));
    }
    return {
        element,
        update: (v) => {
            for (const { input } of buttons) {
                input.checked = input.value === v;
            }
        },
    };
}
export function paramControl(spec, value, onChange) {
    switch (spec.type) {
        case 'number':
            return numberControl(spec, value, onChange);
        case 'choice':
            return choiceControl(spec, value, onChange);
        case 'boolean': {
            const input = html('input', {
                type: 'checkbox',
                checked: value,
            });
            input.addEventListener('change', () => onChange(input.checked, 'commit'));
            const element = html('label', { class: 'control check' }, input, html('span', {}, spec.label));
            return { element, update: (v) => (input.checked = v) };
        }
        case 'text': {
            const input = spec.multiline
                ? html('textarea', { rows: 5, maxlength: spec.maxLength })
                : html('input', {
                    type: 'text',
                    spellcheck: 'false',
                    autocomplete: 'off',
                    maxlength: spec.maxLength,
                });
            input.value = value;
            input.addEventListener('change', () => onChange(input.value, 'commit'));
            if (!spec.multiline) {
                blurOnEnter(input);
            }
            const { element, id } = field(spec.label, spec.help, input);
            input.id = id;
            return {
                element,
                update: (v) => {
                    if (document.activeElement !== input) {
                        input.value = v;
                    }
                },
            };
        }
    }
}

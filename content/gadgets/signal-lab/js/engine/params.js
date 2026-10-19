// Block parameters: the knobs each block type exposes, with ranges and defaults. The specs
// drive both the simulation (resolved values) and the inspector (generated controls).
export function number(spec) {
    return { type: 'number', ...spec };
}
export function choice(spec) {
    return { type: 'choice', ...spec };
}
/**
 * Brings a stored value into range, falling back to the default when it
 * doesn't fit the spec.
 */
export function coerceParam(spec, value) {
    switch (spec.type) {
        case 'number': {
            if (typeof value !== 'number' || !Number.isFinite(value)) {
                return spec.default;
            }
            const clamped = Math.min(spec.max, Math.max(spec.min, value));
            return spec.step
                ? Number((Math.round(clamped / spec.step) * spec.step).toFixed(12))
                : clamped;
        }
        case 'choice':
            return spec.options.some((option) => option.value === value)
                ? value
                : spec.default;
        case 'boolean':
            return typeof value === 'boolean' ? value : spec.default;
        case 'text':
            return typeof value === 'string'
                ? value.slice(0, spec.maxLength ?? 200)
                : spec.default;
    }
}
export function boolean(spec) {
    return { type: 'boolean', ...spec };
}
export function text(spec) {
    return { type: 'text', ...spec };
}
/**
 * A block's parameters with defaults filled in and every value valid for its
 * spec.
 */
export function resolveParams(specs, stored) {
    const values = {};
    for (const [name, spec] of Object.entries(specs)) {
        values[name] = coerceParam(spec, stored[name]);
    }
    return values;
}

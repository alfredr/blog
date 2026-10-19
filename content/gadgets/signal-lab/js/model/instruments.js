// Resolves instrument targets, available controls and readings, diagram
// reference lines, and panel widgets. Panel organization and layout are
// handled in panels.ts.
import { FT8_MAPPER } from '../blocks/ft8.js';
import { BUTTON, CONTROL, isInstrument, NOTE, PLOT, READOUT, SPEAKER, SYMBOLS, } from '../blocks/instruments.js';
import { number, resolveParams, } from '../engine/params.js';
import { blockAt, diagramAt, everyBlock, isSubsystem, pathId, referenceOf, resolveRef, setParam, updateDiagramAt, updateParameter, } from './document.js';
import { namesIn, parseExpression } from './expressions.js';
import { displayName, typeOf } from './subsystems.js';
/** A parameter as a setting spec, for its control. */
export function parameterSpec(parameter) {
    return number({
        label: parameter.name,
        default: parameter.value,
        min: parameter.min,
        max: parameter.max,
        ...(parameter.unit ? { unit: parameter.unit } : {}),
        ...(parameter.scale ? { scale: parameter.scale } : {}),
    });
}
function parseTarget(target) {
    const dot = target.lastIndexOf('.');
    if (dot > 0) {
        return {
            kind: 'setting',
            block: target.slice(0, dot),
            setting: target.slice(dot + 1),
        };
    }
    return target ? { kind: 'parameter', name: target } : undefined;
}
/** Finds the nearest enclosing diagram that declares `name`. */
function parameterScope(doc, path, name) {
    for (let depth = path.length; depth >= 0; depth--) {
        const scope = path.slice(0, depth);
        const parameter = diagramAt(doc, scope)?.parameters?.find((p) => p.name === name);
        if (parameter) {
            return { path: scope, parameter };
        }
    }
    return undefined;
}
/**
 * Resolves a parameter and any binding applied by its containing subsystem
 * block.
 */
function parameterState(doc, bindings, path, parameter, label) {
    const holder = path.length ? blockAt(doc, path.join('/')) : undefined;
    return {
        label,
        spec: parameterSpec(parameter),
        value: parameter.value,
        binding: holder?.bindings?.[parameter.name],
        bound: bindings.values.get(path.join('/'))?.[parameter.name],
        set: (d, value) => updateDiagramAt(d, path, (inner) => updateParameter(inner, parameter.name, { value: value })),
    };
}
/** Resolves a control target or returns a diagnostic. */
export function controlState(doc, bindings, path, control) {
    const target = parseTarget(String(control.params.target ?? ''));
    if (!target) {
        return { problem: 'Choose what this sets.' };
    }
    if (target.kind === 'parameter') {
        const scope = parameterScope(doc, path, target.name);
        return scope
            ? parameterState(doc, bindings, scope.path, scope.parameter, target.name)
            : { problem: `No parameter is called "${target.name}".` };
    }
    const id = resolveRef(path, target.block);
    const block = id === undefined ? undefined : blockAt(doc, id);
    if (id === undefined || !block) {
        return { problem: 'The block it set is gone.' };
    }
    // Use the enclosing subsystem name when labeling a nested setting.
    const steps = target.block.split('/');
    const up = steps.findIndex((step) => step !== '..');
    const outer = steps.length > up + 1
        ? blockAt(doc, resolveRef(path, steps.slice(0, up + 1).join('/')))
        : undefined;
    const label = `${displayName(outer ?? block)} › `;
    if (isSubsystem(block)) {
        const parameter = block.inner.parameters?.find((p) => p.name === target.setting);
        return parameter
            ? parameterState(doc, bindings, id.split('/'), parameter, label + parameter.name)
            : { problem: `${displayName(block)} has no "${target.setting}".` };
    }
    const spec = typeOf(block)?.params[target.setting];
    if (!spec) {
        return { problem: `${displayName(block)} has no "${target.setting}".` };
    }
    const parts = id.split('/');
    return {
        label: label + spec.label,
        spec,
        value: resolveParams({ [target.setting]: spec }, block.params)[target.setting],
        binding: block.bindings?.[target.setting],
        bound: bindings.values.get(id)?.[target.setting],
        set: (d, value) => updateDiagramAt(d, parts.slice(0, -1), (inner) => setParam(inner, parts[parts.length - 1], target.setting, value)),
    };
}
/**
 * Everything a control at `path` can set: the parameters in scope, then each
 * block's settings.
 */
export function settables(doc, path) {
    const diagram = diagramAt(doc, path);
    if (!diagram) {
        return [];
    }
    const parameters = path
        .map((_, i) => path.slice(0, path.length - i))
        .concat([[]])
        .flatMap((scope) => diagramAt(doc, scope)?.parameters ?? [])
        .map((p) => ({ target: p.name, label: p.name }));
    const settings = diagram.blocks.flatMap((block) => {
        if (isInstrument(block.kind)) {
            return [];
        }
        const name = displayName(block);
        if (isSubsystem(block)) {
            // Include subsystem parameters and nested text settings, which cannot be
            // numeric parameters.
            return [
                ...(block.inner.parameters ?? []).map((p) => ({
                    target: `${block.id}.${p.name}`,
                    label: `${name} › ${p.name}`,
                })),
                ...everyBlock(block.inner).flatMap(({ id, block: inner }) => Object.entries(typeOf(inner)?.params ?? {})
                    .filter(([, spec]) => spec.type === 'text')
                    .filter(() => !isInstrument(inner.kind))
                    .map(([setting, spec]) => ({
                    target: `${block.id}/${id}.${setting}`,
                    label: `${name} › ${spec.label}`,
                }))),
            ];
        }
        return Object.entries(typeOf(block)?.params ?? {}).map(([setting, spec]) => ({
            target: `${block.id}.${setting}`,
            label: `${name} › ${spec.label}`,
        }));
    });
    return [
        ...new Map([...parameters, ...settings].map((s) => [s.target, s])).values(),
    ];
}
/** Whether any binding in the block, or inside it, uses parameter `name`. */
function usesParameter(block, name) {
    const inBindings = Object.values(block.bindings ?? {}).some((expression) => {
        const parsed = parseExpression(expression);
        return parsed.ok && namesIn(parsed.value).includes(name);
    });
    return (inBindings ||
        // A parameter of the same name inside hides this one.
        (block.inner !== undefined &&
            !block.inner.parameters?.some((p) => p.name === name) &&
            block.inner.blocks.some((inner) => usesParameter(inner, name))));
}
/** Finds same-diagram targets for an instrument's dashed reference lines. */
export function instrumentLeads(diagram, block) {
    const local = (ref) => {
        const [first] = ref.split('/');
        return diagram.blocks.some((b) => b.id === first) ? [first] : [];
    };
    if (block.kind === READOUT || block.kind === SYMBOLS) {
        return local(String(block.params.block ?? ''));
    }
    if (block.kind !== CONTROL) {
        return [];
    }
    const target = parseTarget(String(block.params.target ?? ''));
    if (target?.kind === 'setting') {
        return local(target.block);
    }
    return target
        ? diagram.blocks
            .filter((b) => b.id !== block.id && usesParameter(b, target.name))
            .map((b) => b.id)
        : [];
}
/**
 * Finds external instruments targeting this subsystem instance. Each result
 * identifies the immediate child block containing the target, including blocks
 * driven by externally controlled parameters.
 */
export function reachingIn(doc, path) {
    const inner = diagramAt(doc, path);
    if (!inner || !path.length) {
        return [];
    }
    const here = `${path.join('/')}/`;
    const declares = (scope, name) => diagramAt(doc, scope)?.parameters?.some((p) => p.name === name) ?? false;
    const reaches = [];
    for (const { id, path: at, block } of everyBlock(doc)) {
        const reference = id.startsWith(here)
            ? undefined
            : referenceOf(doc, at, block);
        if (!reference) {
            continue;
        }
        const sets = block.kind === CONTROL;
        const label = block.name ||
            (!sets
                ? block.kind === SYMBOLS
                    ? 'Bits to tones'
                    : String(block.params.reading ?? '') || 'Readout'
                : 'block' in reference
                    ? (reference.setting ?? '')
                    : reference.parameter);
        if ('block' in reference) {
            if (reference.block.startsWith(here)) {
                const landing = reference.block.slice(here.length).split('/')[0];
                reaches.push({ id, label, sets, block: landing });
            }
            continue;
        }
        // Include parameter users unless a nested declaration shadows the target.
        const { scope, parameter } = reference;
        const around = scope.length <= path.length && scope.every((s, i) => path[i] === s);
        const hidden = path
            .slice(scope.length)
            .some((_, i) => declares(path.slice(0, scope.length + i + 1), parameter));
        if (around && !hidden) {
            for (const user of inner.blocks) {
                if (usesParameter(user, parameter)) {
                    reaches.push({ id, label, sets, block: user.id });
                }
            }
        }
    }
    return reaches;
}
/**
 * Lists face instruments depth first, excluding notes configured for the
 * diagram only.
 */
export function faceItems(doc) {
    return everyBlock(doc).filter(({ block }) => isInstrument(block.kind) &&
        (block.kind !== NOTE || block.params.face === true));
}
/** The plots stacked under each Bits to tones view, by the view's full id. */
function stacks(doc) {
    const items = faceItems(doc);
    const views = new Set(items.filter((item) => item.block.kind === SYMBOLS).map((item) => item.id));
    const found = new Map();
    for (const item of items) {
        const host = item.block.kind === PLOT ? String(item.block.params.stack ?? '') : '';
        if (views.has(host)) {
            found.set(host, [...(found.get(host) ?? []), item]);
        }
    }
    return found;
}
/**
 * Lists standalone face widgets, excluding plots embedded as rows in a Bits to
 * tones view.
 */
export function faceCards(doc) {
    const stacked = new Set([...stacks(doc).values()].flat().map((item) => item.id));
    return faceItems(doc).filter((item) => !stacked.has(item.id));
}
/**
 * Resolves the signals for a Bits to tones view or returns a diagnostic.
 * Accumulated processing delays, such as the Gaussian filter's 42.4 ms, align
 * derived traces with the mapper's symbols.
 */
export function symbolSources(doc, item, context) {
    const ref = String(item.block.params.block ?? '');
    if (!ref) {
        return { problem: 'Choose the FT8 symbol mapper it shows.' };
    }
    const mapper = resolveRef(item.path, ref) ?? '';
    const parts = mapper.split('/');
    const path = parts.slice(0, -1);
    const local = parts[parts.length - 1];
    const diagram = diagramAt(doc, path);
    const block = diagram?.blocks.find((b) => b.id === local);
    if (!diagram || !block) {
        return { problem: 'The mapper it showed is gone.' };
    }
    if (block.kind !== FT8_MAPPER) {
        return { problem: `${displayName(block)} is not an FT8 symbol mapper.` };
    }
    const full = (at) => ({
        block: pathId(path, at.block),
        port: at.port,
    });
    const lagOf = (b) => {
        const id = pathId(path, b.id);
        const type = typeOf(b);
        const status = context.status.get(id);
        const rate = status?.state === 'ok' ? status.rates[0] : undefined;
        return type?.lag && rate
            ? type.lag(resolveParams(type.params, {
                ...b.params,
                ...context.bindings.values.get(id),
            }), rate)
            : 0;
    };
    // Traces inputs back to the mapper's tone and sums processing delays.
    // Returns undefined for unrelated signals.
    const lagFrom = (id) => {
        if (id === local) {
            return 0;
        }
        const queue = [{ id, lag: 0 }];
        const seen = new Set();
        while (queue.length) {
            const next = queue.shift();
            const b = diagram.blocks.find((x) => x.id === next.id);
            if (!b || seen.has(next.id)) {
                continue;
            }
            seen.add(next.id);
            const lag = next.lag + lagOf(b);
            for (const wire of diagram.wires) {
                if (wire.to.block !== next.id) {
                    continue;
                }
                if (wire.from.block === local && wire.from.port === 0) {
                    return lag;
                }
                queue.push({ id: wire.from.block, lag });
            }
        }
        return undefined;
    };
    const into = diagram.wires.find((w) => w.to.block === local && w.to.port === 0);
    const filter = diagram.wires.find((w) => w.from.block === local &&
        w.from.port === 0 &&
        diagram.blocks.find((b) => b.id === w.to.block)?.kind === 'gaussian')?.to.block;
    const stacked = (stacks(doc).get(item.id) ?? []).map((plot) => {
        const plotIn = diagramAt(doc, plot.path)?.wires.find((w) => w.to.block === plot.block.id && w.to.port === 0);
        const at = plotIn && {
            block: pathId(plot.path, plotIn.from.block),
            port: plotIn.from.port,
        };
        const sameDiagram = plotIn !== undefined && plot.path.join('/') === path.join('/');
        return {
            item: plot,
            at,
            lag: (sameDiagram ? lagFrom(plotIn.from.block) : undefined) ?? 0,
        };
    });
    return {
        mapper,
        start: Number(resolveParams(typeOf(block).params, block.params).start ?? 0.5),
        tone: { block: mapper, port: 0 },
        bits: into && full(into.from),
        glide: filter
            ? { at: full({ block: filter, port: 0 }), lag: lagFrom(filter) ?? 0 }
            : undefined,
        stacked,
    };
}
/** The FT8 symbol mappers a view in the diagram at `path` can show. */
export function mappers(doc, path) {
    const diagram = diagramAt(doc, path);
    return diagram
        ? everyBlock(diagram)
            .filter(({ block }) => block.kind === FT8_MAPPER)
            .map(({ id, block }) => ({
            block: id,
            reading: '',
            label: id.includes('/')
                ? `${displayName(diagram.blocks.find((b) => b.id === id.split('/')[0]))} › ${displayName(block)}`
                : displayName(block),
        }))
        : [];
}
/** The Bits to tones views a plot can be stacked under, by full id. */
export function stackHosts(doc) {
    return faceItems(doc)
        .filter((item) => item.block.kind === SYMBOLS)
        .map((item) => ({
        id: item.id,
        label: item.block.name || 'Bits to tones',
    }));
}
/** Default widget dimensions in grid cells. */
export function defaultSize(block, wide) {
    switch (block.kind) {
        case PLOT:
            return { w: 8, h: 5 };
        case SPEAKER:
            return { w: 3, h: 3 };
        case BUTTON:
            return { w: 3, h: 2 };
        case READOUT:
            return { w: 5, h: 2 };
        case SYMBOLS:
            return { w: 12, h: 7 };
        case CONTROL:
            return wide ? { w: 6, h: 2 } : { w: 3, h: 3 };
        default:
            return { w: 6, h: 2 };
    }
}
/** A Plot block in the diagram already showing the output `from`, if any. */
export function plotFrom(diagram, from) {
    return diagram.wires.find((wire) => wire.from.block === from.block &&
        wire.from.port === from.port &&
        diagram.blocks.find((b) => b.id === wire.to.block)?.kind === PLOT)?.to.block;
}
/** Whether the diagram already has a control for `target`. */
export function hasControl(diagram, target) {
    return diagram.blocks.some((block) => block.kind === CONTROL && block.params.target === target);
}
/**
 * Lists readings available in this diagram and its subsystems for a readout
 * picker.
 */
export function readables(doc, path) {
    const diagram = diagramAt(doc, path);
    if (!diagram) {
        return [];
    }
    return everyBlock(diagram).flatMap(({ id, block }) => (typeOf(block)?.reports ?? []).map((reading) => ({
        block: id,
        reading,
        label: `${displayName(block)} › ${reading}`,
    })));
}

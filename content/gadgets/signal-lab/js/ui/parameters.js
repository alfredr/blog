// Inspector controls for expression bindings and editable diagram parameters.
import { isParameterName } from '../model/expressions.js';
import { parameterSpec } from '../model/instruments.js';
import { formatParam, paramControl, parseQuantity, } from './controls.js';
import { html } from './dom.js';
import { showMenu } from './menu.js';
/** An add action disabled when the corresponding item already exists. */
export function addOnce(label, added, add) {
    return {
        label,
        ...(added ? { hint: 'there already', disabled: true } : {}),
        run: add,
    };
}
/**
 * Numeric setting with an expression-binding menu. Bound settings show the
 * expression and evaluated value instead of a slider.
 */
export function bindableControl(bindable) {
    const initial = bindable.read();
    const control = paramControl(bindable.spec, initial.value, (value, mode) => bindable.setValue(value, mode));
    const expression = html('input', {
        type: 'text',
        class: 'expression',
        spellcheck: 'false',
        autocomplete: 'off',
        placeholder: 'an expression, such as fc / 2',
        'aria-label': `${bindable.spec.label} expression`,
    });
    const result = html('span', { class: 'expression-result' });
    const row = html('div', { class: 'expression-row', hidden: true }, html('span', { class: 'expression-sign' }, '='), expression, result);
    const button = html('button', {
        type: 'button',
        class: 'bind-button',
        title: 'Bind to parameters',
        'aria-label': `Bind ${bindable.spec.label}`,
    }, 'ƒ');
    const element = html('div', { class: 'bindable' }, control.element, row, button);
    /** Whether an unbound expression field is currently being edited. */
    let editing = false;
    const sync = () => {
        const { value, binding, resolved, error } = bindable.read();
        const bound = binding !== undefined || editing;
        element.classList.toggle('bound', bound);
        row.hidden = !bound;
        if (document.activeElement !== expression) {
            expression.value = binding ?? '';
        }
        result.textContent =
            error ??
                (resolved === undefined ? '' : formatParam(resolved, bindable.spec));
        result.classList.toggle('error', error !== undefined);
        control.update(resolved ?? value);
    };
    button.addEventListener('click', () => {
        const { binding } = bindable.read();
        const items = [
            {
                label: binding ? 'Edit the expression' : 'Bind to an expression',
                run: () => {
                    editing = true;
                    sync();
                    expression.focus();
                },
            },
        ];
        if (bindable.expose && !binding) {
            items.push({
                label: 'Make a parameter of this',
                run: () => bindable.expose(),
            });
        }
        if (binding) {
            items.push({
                label: 'Unbind',
                run: () => bindable.setBinding(undefined),
            });
        }
        const { panel } = bindable;
        if (panel) {
            items.push('separator', addOnce('Add a control', panel.added(), panel.add));
        }
        const at = button.getBoundingClientRect();
        showMenu(items, { x: at.left, y: at.bottom + 4 });
    });
    expression.addEventListener('change', () => {
        editing = false;
        bindable.setBinding(expression.value);
    });
    expression.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            expression.blur();
        }
        else if (event.key === 'Escape') {
            editing = false;
            expression.value = bindable.read().binding ?? '';
            expression.blur();
            sync();
        }
    });
    expression.addEventListener('blur', () => {
        if (editing && !expression.value.trim()) {
            editing = false;
            sync();
        }
    });
    sync();
    return { element, sync };
}
const UNITS = ['', 'Hz', 's', 'dB', 'deg', 'V', 'x'];
/** The form for a parameter's name, range, unit and scale. */
function editForm(parameter, apply, close) {
    const field = (label, input) => html('label', { class: 'mini-field' }, html('span', {}, label), input);
    const name = html('input', {
        type: 'text',
        value: parameter.name,
        spellcheck: 'false',
    });
    const min = html('input', {
        type: 'text',
        value: String(parameter.min),
        inputmode: 'decimal',
    });
    const max = html('input', {
        type: 'text',
        value: String(parameter.max),
        inputmode: 'decimal',
    });
    const unit = html('select', {}, ...UNITS.map((u) => html('option', { value: u, selected: u === (parameter.unit ?? '') }, u || 'none')));
    const log = html('input', {
        type: 'checkbox',
        checked: parameter.scale === 'log',
    });
    const problem = html('p', { class: 'control-help error' });
    const ok = html('button', { type: 'button', class: 'small' }, 'Apply');
    const cancel = html('button', { type: 'button', class: 'small' }, 'Cancel');
    ok.addEventListener('click', () => {
        const low = parseQuantity(min.value);
        const high = parseQuantity(max.value);
        if (!isParameterName(name.value)) {
            problem.textContent =
                'A name is letters, digits and _, starting with a letter, and not a function such as sqrt.';
            return;
        }
        if (low === undefined || high === undefined || !(low < high)) {
            problem.textContent =
                'The range needs a lowest value below the highest.';
            return;
        }
        if (log.checked && low <= 0) {
            problem.textContent = 'A log scale needs a range above zero.';
            return;
        }
        const next = {
            name: name.value,
            value: Math.min(high, Math.max(low, parameter.value)),
            min: low,
            max: high,
            ...(unit.value ? { unit: unit.value } : {}),
            ...(log.checked ? { scale: 'log' } : {}),
        };
        const error = apply(next);
        if (error) {
            problem.textContent = error;
        }
        else {
            close();
        }
    });
    cancel.addEventListener('click', close);
    return html('div', { class: 'parameter-form' }, field('Name', name), html('div', { class: 'mini-row' }, field('From', min), field('To', max)), html('div', { class: 'mini-row' }, field('Unit', unit), html('label', { class: 'control check' }, log, html('span', {}, 'log scale'))), problem, html('div', { class: 'actions' }, ok, cancel));
}
/** Editable controls for a diagram's parameters, with an action to add more. */
export function parameterList(events) {
    const rows = html('div', { class: 'parameter-list' });
    const add = html('button', { type: 'button', class: 'small' }, 'Add parameter');
    add.addEventListener('click', () => events.add());
    const element = html('div', { class: 'parameters' }, html('div', { class: 'notes-head' }, html('span', { class: 'control-label' }, 'Parameters'), add), html('p', { class: 'control-help' }, 'Names to use in bindings: press ƒ beside any number setting. In a subsystem, they are its settings.'), rows);
    let shape = '';
    let controls = [];
    let editing;
    const build = (parameters) => {
        controls = [];
        rows.replaceChildren(...parameters.map((parameter) => {
            const control = paramControl(parameterSpec(parameter), parameter.value, (value, mode) => events.setValue(parameter.name, value, mode));
            const expression = html('code', { class: 'expression' });
            const result = html('span', { class: 'expression-result' });
            const bound = html('div', { class: 'outside-binding', hidden: true }, html('div', { class: 'expression-row' }, html('span', { class: 'expression-sign' }, '='), expression, result), html('p', { class: 'control-help' }, 'Bound outside, on this subsystem, so its own value here is not used.'));
            const more = html('button', {
                type: 'button',
                class: 'bind-button',
                'aria-label': `Edit ${parameter.name}`,
                title: 'Edit',
            }, '⋯');
            const row = html('div', { class: 'bindable parameter' }, control.element, bound, more);
            controls.push({
                name: parameter.name,
                update: (value, outside) => {
                    row.classList.toggle('bound', outside !== undefined);
                    bound.hidden = outside === undefined;
                    expression.textContent = outside?.expression ?? '';
                    result.textContent =
                        outside?.error ??
                            (outside?.value === undefined
                                ? ''
                                : formatParam(outside.value, parameterSpec(parameter)));
                    result.classList.toggle('error', outside?.error !== undefined);
                    control.update(outside?.value ?? value);
                },
            });
            if (editing === parameter.name) {
                row.append(editForm(parameter, (next) => {
                    const error = events.edit(parameter.name, next);
                    if (!error) {
                        editing = undefined;
                    }
                    return error;
                }, () => {
                    editing = undefined;
                    shape = '';
                    sync();
                }));
            }
            more.addEventListener('click', () => {
                const at = more.getBoundingClientRect();
                const panel = events.panel(parameter.name);
                showMenu([
                    {
                        label: 'Name, range and unit…',
                        run: () => {
                            editing = parameter.name;
                            shape = '';
                            sync();
                        },
                    },
                    addOnce('Add a control', panel.added(), panel.add),
                    ...(events.outside?.(parameter.name) && events.showOutside
                        ? [
                            {
                                label: 'Show the binding outside',
                                run: events.showOutside,
                            },
                        ]
                        : []),
                    'separator',
                    {
                        label: 'Delete',
                        danger: true,
                        run: () => events.remove(parameter.name),
                    },
                ], { x: at.left, y: at.bottom + 4 });
            });
            return row;
        }));
    };
    function sync() {
        const parameters = events.read();
        const next = JSON.stringify([
            parameters.map(({ value: _, ...rest }) => rest),
            editing,
        ]);
        if (next !== shape) {
            shape = next;
            build(parameters);
        }
        for (const control of controls) {
            const parameter = parameters.find((p) => p.name === control.name);
            if (parameter) {
                control.update(parameter.value, events.outside?.(control.name));
            }
        }
    }
    sync();
    return { element, sync };
}

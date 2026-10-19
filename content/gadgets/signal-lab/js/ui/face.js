// The panel face: the front of the instrument, built from the instruments on
// the diagram. Every plot is a screen, every control a knob, switch or field,
// every readout a display and every speaker a grille with Play; notes marked
// for the face become labels. They sit in panes, and the panes in panels, as
// the document has them organized; where everything goes is worked out to
// fit, so the face rearranges itself when the dock changes shape. Panels show
// stacked, tiled side by side as they fit, or as tabs. Arrange lets the
// instruments, panes and panels be dragged about, renamed, added and taken
// away. The transport runs the stream, and the selection's signal gets a
// screen at the end, to look at before adding a plot for it.
import { CONTROL, NOTE, PLOT, SPEAKER, SYMBOLS, } from '../blocks/instruments.js';
import { controlState, defaultSize, } from '../model/instruments.js';
import { addPane, addPanel, facePanels, moveInstrument, movePane, movePanel, layoutPane, paneWidth, removePane, removePanel, resizeInstrument, retitle, } from '../model/panels.js';
import { html } from './dom.js';
import { defaultSettings, SignalPanel } from './signal-panel.js';
/** Grid cell size and the gap between cells, in CSS pixels. */
const CELL = 32;
const GAP = 8;
const PITCH = CELL + GAP;
/**
 * A knob's own size, the most it grows to, and the room around it for its
 * label, rim and range, in pixels.
 */
const KNOB_SIZE = 60;
const KNOB_LARGEST = 96;
const KNOB_MARGIN = { w: 28, h: 52 };
/** How readily a pane takes spare width, by the most stretchable it holds. */
const STRETCH = { screen: 100, display: 20, knob: 1 };
/** A pane's padding and border across, around its instruments. */
const PANE_EDGES = 22;
/**
 * The gap between panes, and a panel's padding and border across: wider than
 * the gaps inside a pane, so what belongs together looks it.
 */
const PANE_GAP = 10;
const PANEL_EDGES = 14;
/** The widest a pane would like to be, in cells. */
const WIDEST = 24;
/**
 * How fast the stream can run against the clock; speakers play at that speed,
 * like a tape.
 */
const SPEEDS = [
    [8, '8×'],
    [4, '4×'],
    [2, '2×'],
    [1, '1×'],
    [0.5, '½×'],
    [0.25, '¼×'],
    [0.125, '⅛×'],
];
/** A speed as the transport shows it: ⅛×, 1×, 4×. */
export function speedLabel(speed) {
    return (SPEEDS.find(([s]) => s === speed)?.[1] ?? `${Number(speed.toFixed(2))}×`);
}
/** A time on the stream's clock: seconds, then minutes and seconds. */
export function clockTime(t) {
    if (t < 60) {
        return `${t.toFixed(1)} s`;
    }
    const minutes = Math.floor(t / 60);
    return `${minutes}:${(t - 60 * minutes).toFixed(1).padStart(4, '0')}`;
}
const MODES = [
    ['stack', 'Stack', 'Panels one under another'],
    ['tile', 'Tile', 'Panels side by side, as they fit'],
    ['tabs', 'Tabs', 'One panel at a time'],
];
const VIEW_KEY = 'signal-lab:panels';
function loadView() {
    try {
        const saved = JSON.parse(localStorage.getItem(VIEW_KEY) ?? 'null');
        return {
            mode: MODES.some(([mode]) => mode === saved?.mode)
                ? saved.mode
                : 'tile',
            tab: typeof saved?.tab === 'string' ? saved.tab : undefined,
        };
    }
    catch {
        return { mode: 'tile', tab: undefined };
    }
}
const SCOPE = '@scope';
const scopeSettings = {
    time: defaultSettings('time'),
    spectrum: defaultSettings('spectrum'),
    waterfall: defaultSettings('waterfall'),
};
/** A button for the panes and panels while arranging. */
const tool = (label, title) => html('button', { type: 'button', class: 'small', title }, label);
/**
 * Of `elements`, the one nearest the point, and whether the point is past it:
 * below it, or beside it and past its middle, across where they flow in
 * `rows`, otherwise down. `beside` says whether the point is level with it.
 */
function nearest(elements, x, y, rows) {
    let best = {
        index: 0,
        after: false,
        beside: false,
        box: new DOMRect(),
        distance: Infinity,
    };
    elements.forEach((element, index) => {
        const box = element.getBoundingClientRect();
        const dx = Math.max(box.left - x, 0, x - box.right);
        const dy = Math.max(box.top - y, 0, y - box.bottom);
        const distance = Math.hypot(dx, dy);
        if (distance < best.distance) {
            const beside = rows && y >= box.top && y <= box.bottom;
            best = {
                index,
                after: beside
                    ? x > box.left + box.width / 2
                    : y > box.top + box.height / 2,
                beside,
                box,
                distance,
            };
        }
    });
    return best;
}
/** Puts `children` in `parent`, in order, moving nothing already in place. */
function setChildren(parent, children) {
    const now = parent.children;
    if (now.length !== children.length ||
        children.some((child, i) => now[i] !== child)) {
        parent.replaceChildren(...children);
    }
}
export class Face {
    #events;
    #panelsBox = html('div', { class: 'face-panels' });
    #tabs = html('div', {
        class: 'face-tabs',
        role: 'tablist',
        'aria-label': 'Panels',
    });
    #frames = new Map();
    #paneViews = new Map();
    #panelViews = new Map();
    #scopeGrid = html('div', { class: 'pane-grid' });
    #scopePane = html('section', { class: 'pane scope-pane' }, html('header', { class: 'pane-head' }, html('h3', { class: 'pane-title' }, 'Selection')), this.#scopeGrid);
    #addPanel = tool('+ Panel', 'Add a panel');
    #dropBar = html('div', { class: 'drop-bar', hidden: true });
    #empty = html('div', { class: 'face-empty' }, html('p', {}, 'The panel face is empty.'), html('p', {}, 'Instruments on the diagram appear here. Right-click an output or a wire and choose Add plot, or add a Plot, Speaker, Control or Readout from the Instruments in the palette.'));
    #modes;
    #arrange = html('button', { type: 'button', class: 'small', 'aria-pressed': 'false' }, 'Arrange');
    #run = html('button', { type: 'button', class: 'small run' });
    #time = html('span', {
        class: 'transport-time',
        role: 'timer',
        'aria-label': 'Stream time',
    });
    #speed = html('select', { 'aria-label': 'Speed' }, ...SPEEDS.map(([speed, label]) => html('option', { value: speed }, label)));
    #reset = html('button', {
        type: 'button',
        class: 'small',
        title: 'Back to time 0, with everything afresh',
    }, 'Reset');
    /** Each pane's instruments, to lay out again when its size changes. */
    #laid = new WeakMap();
    /** Lays out each pane's instruments whenever its size changes. */
    #fitter = new ResizeObserver((entries) => {
        for (const entry of entries) {
            this.#fit(entry.target);
        }
    });
    #scope;
    #view = loadView();
    #arranging = false;
    #drag;
    #model;
    constructor(host, events, 
    /** Buttons for the header, after Arrange: where the panel goes. */
    actions = []) {
        this.#events = events;
        this.#arrange.addEventListener('click', () => {
            this.#arranging = !this.#arranging;
            this.#rerender();
        });
        this.#run.addEventListener('click', () => events.run());
        this.#speed.addEventListener('change', () => events.speed(Number(this.#speed.value)));
        this.#reset.addEventListener('click', () => events.reset());
        this.#addPanel.addEventListener('click', () => {
            const doc = this.#model?.doc;
            if (doc) {
                const [next, id] = addPanel(doc);
                this.#show(id);
                events.change(next, 'commit');
            }
        });
        const mode = (value, label, title) => {
            const button = html('button', { type: 'button', class: 'small', title }, label);
            button.addEventListener('click', () => {
                this.#view = { ...this.#view, mode: value };
                this.#saveView();
                this.#rerender();
            });
            return button;
        };
        this.#modes = Object.fromEntries(MODES.map(([value, label, title]) => [value, mode(value, label, title)]));
        host.append(html('header', { class: 'face-head' }, html('h2', { class: 'face-title' }, 'Panel'), html('div', { class: 'transport', role: 'group', 'aria-label': 'Stream' }, this.#run, this.#time, this.#speed, this.#reset), html('div', {
            class: 'face-modes',
            role: 'group',
            'aria-label': 'How the panels show',
        }, ...Object.values(this.#modes)), this.#arrange, ...actions), this.#tabs, this.#panelsBox);
        this.#panelsBox.append(this.#dropBar);
        this.#fitter.observe(this.#scopeGrid);
        addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && this.#drag) {
                this.#endDrag(false);
            }
        });
    }
    render(model) {
        this.#model = model;
        const { doc, widgets } = model;
        const panels = facePanels(doc);
        const tabs = this.#view.mode === 'tabs' && !this.#arranging;
        const tab = panels.find((p) => p.id === this.#view.tab)?.id ?? panels[0]?.id;
        const shown = tabs ? panels.filter((p) => p.id === tab) : panels;
        const mode = tabs ? 'tabs' : this.#arranging ? 'tile' : this.#view.mode;
        this.#panelsBox.dataset.mode = mode;
        this.#panelsBox.classList.toggle('arranging', this.#arranging);
        // The tabs, with more than one panel to choose from.
        this.#tabs.hidden = !tabs || panels.length < 2;
        this.#tabs.replaceChildren(...panels.map((panel) => {
            const button = html('button', {
                type: 'button',
                class: 'face-tab',
                role: 'tab',
                'aria-selected': String(panel.id === tab),
            }, panel.title || 'Panel');
            button.addEventListener('click', () => this.#show(panel.id));
            return button;
        }));
        const live = new Set();
        const order = [];
        for (const panel of shown) {
            const view = this.#panelView(panel.id);
            live.add(`panel:${panel.id}`);
            view.title.textContent = panel.title || 'Panel';
            if (document.activeElement !== view.name) {
                view.name.value = panel.title;
            }
            view.head.hidden = !this.#arranging && (tabs || panels.length < 2);
            view.remove.disabled = panels.length < 2;
            const panes = panel.panes.map((pane) => this.#renderPane(pane, model, widgets, live));
            setChildren(view.panes, panes.map((p) => p.element));
            // Tiled, a panel asks for room for its panes side by side.
            view.element.style.flexBasis =
                mode === 'tile'
                    ? `${panes.reduce((sum, p) => sum + p.basis + PANE_GAP, -PANE_GAP) + PANEL_EDGES}px`
                    : '';
            view.element.style.flexGrow = String(Math.max(STRETCH.knob, ...panes.map((p) => p.give)));
            order.push(view.element);
        }
        if (model.scope) {
            live.add(SCOPE);
            const frame = this.#frame(SCOPE);
            const scope = this.#scopePanel();
            scope.at = model.scope.at;
            if (frame.body.firstChild !== scope.panel.element) {
                frame.body.replaceChildren(scope.panel.element);
            }
            this.#updateScope(model.scope, model.transport.time);
            frame.element.dataset.w = '8';
            frame.element.dataset.h = '5';
            frame.element.classList.add('scope');
            if (frame.element.parentElement !== this.#scopeGrid) {
                this.#scopeGrid.append(frame.element);
            }
            this.#scopePane.style.flexBasis = `${8 * PITCH - GAP + PANE_EDGES}px`;
            this.#laid.set(this.#scopeGrid, {
                pieces: [{ kind: 'screen', w: 8 * PITCH - GAP, h: 5 * PITCH - GAP }],
                frames: [frame.element],
            });
            order.push(this.#scopePane);
        }
        if (this.#arranging) {
            order.push(this.#addPanel);
        }
        const count = panels.reduce((sum, p) => sum + p.panes.reduce((n, q) => n + q.entries.length, 0), 0);
        this.#empty.hidden = count > 0 || Boolean(model.scope);
        setChildren(this.#panelsBox, [...order, this.#empty, this.#dropBar]);
        for (const grid of this.#panelsBox.querySelectorAll('.pane-grid')) {
            this.#fit(grid);
        }
        // What is no longer shown goes.
        for (const [id, frame] of this.#frames) {
            if (!live.has(id)) {
                frame.element.remove();
                this.#frames.delete(id);
            }
        }
        for (const [id, view] of this.#paneViews) {
            if (!live.has(`pane:${id}`)) {
                this.#fitter.unobserve(view.grid);
                this.#paneViews.delete(id);
            }
        }
        for (const id of this.#panelViews.keys()) {
            if (!live.has(`panel:${id}`)) {
                this.#panelViews.delete(id);
            }
        }
        this.#arrange.setAttribute('aria-pressed', String(this.#arranging));
        this.#arrange.textContent = this.#arranging ? 'Done' : 'Arrange';
        for (const [value, button] of Object.entries(this.#modes)) {
            button.setAttribute('aria-pressed', String(value === this.#view.mode));
        }
        this.setTransport(model.transport);
    }
    /** Updates the transport and the selection's screen, as time passes. */
    tick(transport, scope) {
        this.setTransport(transport);
        if (scope && this.#scope) {
            this.#updateScope(scope, transport.time);
        }
    }
    setTransport(transport) {
        const { time, running, speed, behind } = transport;
        this.#run.textContent = running ? 'Pause' : 'Run';
        this.#run.setAttribute('aria-pressed', String(running));
        this.#time.textContent = clockTime(time);
        this.#time.classList.toggle('behind', running && behind);
        this.#time.title =
            running && behind
                ? 'The simulation is slower than this speed, so time runs slower.'
                : '';
        this.#speed.value = String(speed);
        this.#reset.disabled = time === 0 && !running;
    }
    /** Lays out a pane and its instruments; returns the width it would like. */
    #renderPane(pane, model, widgets, live) {
        const view = this.#paneView(pane.id);
        live.add(`pane:${pane.id}`);
        view.title.textContent = pane.title || 'Pane';
        if (document.activeElement !== view.name) {
            view.name.value = pane.title;
        }
        // A title that only repeats one of its instruments' names says nothing.
        const said = (name) => name?.trim().toLowerCase() === pane.title.trim().toLowerCase();
        view.title.hidden = pane.entries.some((entry) => said(entry.item.block.name));
        const pieces = [];
        const frames = pane.entries.map((entry) => {
            live.add(entry.id);
            const frame = this.#frame(entry.id);
            const element = widgets.get('face', entry.item);
            if (frame.body.firstChild !== element) {
                frame.body.replaceChildren(element);
            }
            const own = this.#sizeOf(model, entry.item);
            pieces.push({
                kind: own.kind,
                w: (entry.w ?? own.w) * PITCH - GAP,
                h: (entry.h ?? own.h) * PITCH - GAP,
            });
            frame.element.dataset.w = String(entry.w ?? own.w);
            frame.element.dataset.h = String(entry.h ?? own.h);
            frame.element.dataset.kind = entry.item.block.kind;
            frame.element.classList.toggle('selected', model.selected.has(entry.id));
            return frame.element;
        });
        setChildren(view.grid, frames);
        this.#laid.set(view.grid, { pieces, frames });
        view.element.classList.toggle('empty', !frames.length);
        const basis = pieces.length
            ? paneWidth(pieces, WIDEST * PITCH - GAP, PITCH) + PANE_EDGES
            : 8 * PITCH;
        view.element.style.flexBasis = `${basis}px`;
        // Spare width goes to what stretches well: screens most, displays some,
        // and a pane of knobs stays thin unless nothing beside it stretches.
        const give = pieces.some((p) => p.kind === 'screen')
            ? STRETCH.screen
            : pieces.some((p) => p.kind === 'display')
                ? STRETCH.display
                : STRETCH.knob;
        view.element.style.flexGrow = String(give);
        return { element: view.element, basis, give };
    }
    /** An instrument's own size in cells, and how it takes to a pane. */
    #sizeOf(model, item) {
        const state = item.block.kind === CONTROL
            ? controlState(model.doc, model.bindings, item.path, item.block)
            : undefined;
        const knob = state !== undefined &&
            !('problem' in state) &&
            state.binding === undefined &&
            state.spec.type === 'number' &&
            item.block.params.style !== 'slider';
        const size = defaultSize(item.block, state !== undefined && !knob);
        const kind = item.block.kind === PLOT ||
            item.block.kind === SYMBOLS ||
            item.block.kind === NOTE
            ? 'screen'
            : knob || item.block.kind === SPEAKER
                ? 'knob'
                : 'display';
        return { ...size, kind };
    }
    /**
     * Fits a pane's instruments to its width: as many columns as there is room
     * for, and then no more than they need to stay in as few rows, in the middle
     * of the pane; each instrument across as many as it asks, or as there are.
     */
    #fit(grid) {
        const laid = this.#laid.get(grid);
        if (!laid) {
            return;
        }
        const { boxes, height } = layoutPane(laid.pieces, grid.clientWidth, grid.clientHeight);
        grid.style.minHeight = `${Math.ceil(height)}px`;
        laid.frames.forEach((frame, i) => {
            const box = boxes[i];
            const style = frame.style;
            style.left = `${Math.round(box.x)}px`;
            style.top = `${Math.round(box.y)}px`;
            style.width = `${Math.round(box.w)}px`;
            style.height = `${Math.round(box.h)}px`;
            // A knob given more room than its own grows into it.
            if (laid.pieces[i].kind === 'knob') {
                const size = Math.min(box.w - KNOB_MARGIN.w, box.h - KNOB_MARGIN.h);
                style.setProperty('--knob-size', `${Math.round(Math.min(KNOB_LARGEST, Math.max(KNOB_SIZE, size)))}px`);
            }
        });
    }
    #show(panel) {
        this.#view = { ...this.#view, tab: panel };
        this.#saveView();
        this.#rerender();
    }
    #saveView() {
        try {
            localStorage.setItem(VIEW_KEY, JSON.stringify(this.#view));
        }
        catch {
            // Without storage the choice lasts as long as the page.
        }
    }
    #updateScope(scope, time) {
        const panel = this.#scopePanel();
        panel.at = scope.at;
        panel.panel.update({
            title: scope.title,
            trace: scope.trace,
            problem: scope.problem,
            settings: scopeSettings[panel.view],
            color: 'var(--muted)',
            time,
            listening: scope.listening,
        });
    }
    #rerender() {
        if (this.#model) {
            this.render(this.#model);
        }
    }
    /** Applies a change to the document, if there is one. */
    #change(edit, mode) {
        const doc = this.#model?.doc;
        if (doc) {
            this.#events.change(edit(doc), mode);
        }
    }
    #panelView(id) {
        let view = this.#panelViews.get(id);
        if (view) {
            return view;
        }
        const title = html('h3', { class: 'panel-title' });
        const name = html('input', {
            type: 'text',
            class: 'panel-name',
            'aria-label': 'Panel name',
            placeholder: 'Panel',
        });
        name.addEventListener('change', () => this.#change((doc) => retitle(doc, id, name.value), 'commit'));
        const grip = html('span', {
            class: 'grip',
            title: 'Drag to move the panel',
            'aria-hidden': 'true',
        });
        const add = tool('+ Pane', 'Add a pane to this panel');
        add.addEventListener('click', () => this.#change((doc) => addPane(doc, id)[0], 'commit'));
        const remove = tool('×', 'Take this panel away; its panes go to the next');
        remove.addEventListener('click', () => this.#change((doc) => removePanel(doc, id), 'commit'));
        const head = html('header', { class: 'panel-head' }, grip, title, name, html('span', { class: 'panel-tools' }, add, remove));
        const panes = html('div', { class: 'panel-panes' });
        const element = html('section', { class: 'face-panel', 'data-panel': id }, head, panes);
        this.#dragFrom(grip, () => ({ kind: 'panel', id, element }));
        view = { element, head, title, name, panes, remove };
        this.#panelViews.set(id, view);
        return view;
    }
    #paneView(id) {
        let view = this.#paneViews.get(id);
        if (view) {
            return view;
        }
        const title = html('h3', { class: 'pane-title' });
        const name = html('input', {
            type: 'text',
            class: 'pane-name',
            'aria-label': 'Pane name',
            placeholder: 'Pane',
        });
        name.addEventListener('change', () => this.#change((doc) => retitle(doc, id, name.value), 'commit'));
        const grip = html('span', {
            class: 'grip',
            title: 'Drag to move the pane',
            'aria-hidden': 'true',
        });
        const remove = tool('×', 'Take this pane away; its instruments go to the one beside it');
        remove.addEventListener('click', () => this.#change((doc) => removePane(doc, id), 'commit'));
        const grid = html('div', { class: 'pane-grid' });
        const element = html('section', { class: 'pane', 'data-pane': id }, html('header', { class: 'pane-head' }, grip, title, name, remove), grid);
        this.#dragFrom(grip, () => ({ kind: 'pane', id, element }));
        this.#fitter.observe(grid);
        view = { element, title, name, grid };
        this.#paneViews.set(id, view);
        return view;
    }
    #frame(id) {
        let frame = this.#frames.get(id);
        if (frame) {
            return frame;
        }
        const body = html('div', { class: 'face-body' });
        const grip = html('div', { class: 'face-grip', title: 'Drag to move' });
        const resize = html('div', {
            class: 'face-resize',
            title: 'Drag to resize; double-click for its own size',
        });
        const element = html('div', { class: 'face-item', 'data-id': id }, body, grip, resize);
        frame = { element, body };
        this.#frames.set(id, frame);
        if (id !== SCOPE) {
            this.#dragFrom(grip, () => ({ kind: 'instrument', id, element }));
            resize.addEventListener('pointerdown', (event) => {
                const before = this.#model?.doc;
                if (!before) {
                    return;
                }
                event.preventDefault();
                event.stopPropagation();
                resize.setPointerCapture(event.pointerId);
                this.#drag = {
                    kind: 'resize',
                    id,
                    x: event.clientX,
                    y: event.clientY,
                    w: Number(element.dataset.w),
                    h: Number(element.dataset.h),
                    before,
                };
            });
            resize.addEventListener('pointermove', (event) => {
                const drag = this.#drag;
                if (drag?.kind !== 'resize') {
                    return;
                }
                const w = Math.max(2, drag.w + Math.round((event.clientX - drag.x) / PITCH));
                const h = Math.max(2, drag.h + Math.round((event.clientY - drag.y) / PITCH));
                this.#change((doc) => resizeInstrument(doc, id, { w, h }), 'preview');
            });
            resize.addEventListener('pointerup', () => this.#endDrag(true));
            resize.addEventListener('pointercancel', () => this.#endDrag(false));
            resize.addEventListener('dblclick', () => this.#change((doc) => resizeInstrument(doc, id, undefined), 'commit'));
        }
        // Clicking an instrument away from its controls shows it on the diagram.
        element.addEventListener('click', (event) => {
            const target = event.target;
            if (id !== SCOPE &&
                !this.#arranging &&
                !target.closest('input, select, textarea, button, canvas, [data-live]')) {
                this.#events.reveal(id);
            }
        });
        return frame;
    }
    /**
     * Makes `handle` start a drag of what `start` says, while arranging: a bar
     * shows where it would land, and letting go puts it there.
     */
    #dragFrom(handle, start) {
        handle.addEventListener('pointerdown', (event) => {
            if (!this.#arranging || event.button !== 0) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            handle.setPointerCapture(event.pointerId);
            this.#drag = start();
            if (this.#drag.kind !== 'resize') {
                this.#drag.element.classList.add('dragging');
            }
        });
        handle.addEventListener('pointermove', (event) => this.#dragOver(event.clientX, event.clientY));
        handle.addEventListener('pointerup', () => this.#endDrag(true));
        handle.addEventListener('pointercancel', () => this.#endDrag(false));
    }
    /** Works out where what is dragged would land, and shows it. */
    #dragOver(x, y) {
        const drag = this.#drag;
        if (!drag || drag.kind === 'resize') {
            return;
        }
        const under = document.elementFromPoint(x, y);
        const others = (box, selector) => [...box.querySelectorAll(`:scope > ${selector}`)].filter((element) => element !== drag.element);
        let into;
        let box;
        let siblings = [];
        if (drag.kind === 'instrument') {
            const pane = under?.closest('.pane[data-pane]');
            box = pane?.querySelector('.pane-grid');
            into = pane?.dataset.pane;
            siblings = box ? others(box, '.face-item') : [];
        }
        else if (drag.kind === 'pane') {
            const panel = under?.closest('.face-panel');
            box = panel?.querySelector('.panel-panes');
            into = panel?.dataset.panel;
            siblings = box ? others(box, '.pane') : [];
        }
        else {
            box = this.#panelsBox;
            into = '';
            siblings = others(box, '.face-panel');
        }
        if (into === undefined || !box) {
            drag.target = undefined;
            this.#dropBar.hidden = true;
            return;
        }
        // Instruments and panes flow in rows; panels do when tiled.
        const rows = drag.kind !== 'panel' || this.#panelsBox.dataset.mode === 'tile';
        const area = box.getBoundingClientRect();
        const near = siblings.length ? nearest(siblings, x, y, rows) : undefined;
        drag.target = {
            into,
            index: near ? near.index + (near.after ? 1 : 0) : 0,
        };
        // A bar beside the one it would go next to, or along the empty box.
        const origin = this.#panelsBox.getBoundingClientRect();
        const across = near ? near.beside : rows;
        const edge = near
            ? across
                ? near.after
                    ? near.box.right + 2
                    : near.box.left - 5
                : near.after
                    ? near.box.bottom + 2
                    : near.box.top - 5
            : across
                ? area.left
                : area.top;
        const bar = this.#dropBar.style;
        if (across) {
            bar.left = `${edge - origin.left}px`;
            bar.top = `${(near?.box.top ?? area.top) - origin.top}px`;
            bar.width = '3px';
            bar.height = `${near?.box.height ?? Math.max(32, area.height)}px`;
        }
        else {
            bar.left = `${(near?.box.left ?? area.left) - origin.left}px`;
            bar.top = `${edge - origin.top}px`;
            bar.width = `${near?.box.width ?? area.width}px`;
            bar.height = '3px';
        }
        this.#dropBar.hidden = false;
    }
    #endDrag(drop) {
        const drag = this.#drag;
        this.#drag = undefined;
        this.#dropBar.hidden = true;
        if (!drag) {
            return;
        }
        // A resize shows as it goes; letting go keeps it as one step to undo,
        // and Escape puts back what was there, leaving nothing to undo.
        if (drag.kind === 'resize') {
            this.#change((doc) => (drop ? doc : drag.before), 'commit');
            return;
        }
        drag.element.classList.remove('dragging');
        const target = drag.target;
        if (!drop || !target) {
            return;
        }
        this.#change((doc) => drag.kind === 'instrument'
            ? moveInstrument(doc, drag.id, target.into, target.index)
            : drag.kind === 'pane'
                ? movePane(doc, drag.id, target.into, target.index)
                : movePanel(doc, drag.id, target.index), 'commit');
    }
    #scopePanel() {
        if (!this.#scope) {
            const add = html('button', { type: 'button', class: 'small' }, 'Add plot');
            const scope = {
                view: 'time',
                at: undefined,
                panel: new SignalPanel({
                    view: (view) => {
                        scope.view = view;
                        this.#rerender();
                    },
                    listen: () => scope.at && this.#events.listen(scope.at),
                    extra: [add],
                }),
            };
            add.addEventListener('click', () => scope.at && this.#events.addPlot(scope.at));
            this.#scope = scope;
        }
        return this.#scope;
    }
}

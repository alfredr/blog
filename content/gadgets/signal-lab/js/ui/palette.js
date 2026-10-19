import { blockTypes, categories } from '../blocks/index.js';
import { templates } from '../model/library.js';
import { markdownToPlain } from '../model/markdown.js';
import { html } from './dom.js';
import { BLOCK_DRAG_TYPE } from './editor.js';
import { blockIcon } from './icons.js';
/**
 * Prefix that marks a palette key as a library subsystem rather than a block
 * kind.
 */
export const TEMPLATE = 'template:';
/** Everything the palette offers: block types, then library subsystems. */
export const paletteEntries = [
    ...blockTypes.map((type) => ({
        key: type.kind,
        label: type.label,
        category: type.category,
        description: type.description,
    })),
    ...templates.map((t) => ({
        key: `${TEMPLATE}${t.key}`,
        label: t.label,
        category: t.category,
        description: t.description,
    })),
];
/** Categories collapsed in this browser. */
const FOLDED_KEY = 'signal-lab:palette';
function loadFolded() {
    try {
        const saved = JSON.parse(localStorage.getItem(FOLDED_KEY) ?? '[]');
        return new Set(Array.isArray(saved) ? saved.filter((c) => typeof c === 'string') : []);
    }
    catch {
        return new Set();
    }
}
/**
 * Renders draggable block tiles in collapsible categories. Filtering matches
 * names and categories; Enter adds the first match.
 */
export function renderPalette(host, add) {
    const folded = loadFolded();
    const tiles = [];
    const groups = categories.map((category) => {
        const grid = html('div', { class: 'palette-grid' });
        const toggle = html('button', {
            type: 'button',
            class: 'palette-heading',
            'aria-expanded': String(!folded.has(category)),
        }, category);
        const group = html('section', { class: 'palette-group' }, toggle, grid);
        group.classList.toggle('folded', folded.has(category));
        toggle.addEventListener('click', () => {
            const fold = !group.classList.contains('folded');
            group.classList.toggle('folded', fold);
            toggle.setAttribute('aria-expanded', String(!fold));
            if (fold) {
                folded.add(category);
            }
            else {
                folded.delete(category);
            }
            try {
                localStorage.setItem(FOLDED_KEY, JSON.stringify([...folded]));
            }
            catch {
                // Keep collapsed categories for this session if storage is
                // unavailable.
            }
        });
        for (const entry of paletteEntries.filter((e) => e.category === category)) {
            const description = markdownToPlain(entry.description);
            const button = html('button', {
                type: 'button',
                class: `palette-item${entry.key.startsWith(TEMPLATE) ? ' composite' : ''}`,
                draggable: 'true',
                title: `${entry.label}: ${description}`,
            }, blockIcon(entry.key), html('span', { class: 'palette-label' }, entry.label));
            button.addEventListener('click', () => add(entry.key));
            button.addEventListener('dragstart', (event) => {
                event.dataTransfer?.setData(BLOCK_DRAG_TYPE, entry.key);
                if (event.dataTransfer) {
                    event.dataTransfer.effectAllowed = 'copy';
                }
            });
            grid.append(button);
            tiles.push({
                element: button,
                text: `${entry.label} ${category}`.toLowerCase(),
                key: entry.key,
            });
        }
        return group;
    });
    const filter = html('input', {
        type: 'search',
        class: 'palette-filter',
        placeholder: 'Filter blocks',
        'aria-label': 'Filter blocks',
        spellcheck: 'false',
        autocomplete: 'off',
    });
    const narrow = () => {
        const words = filter.value.toLowerCase().split(/\s+/).filter(Boolean);
        host.classList.toggle('filtering', words.length > 0);
        for (const tile of tiles) {
            tile.element.hidden = !words.every((word) => tile.text.includes(word));
        }
        for (const group of groups) {
            group.hidden = ![...group.querySelectorAll('.palette-item')].some((item) => !item.hidden);
        }
    };
    filter.addEventListener('input', narrow);
    filter.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            const first = tiles.find((tile) => !tile.element.hidden);
            if (first && filter.value.trim()) {
                add(first.key);
            }
        }
        else if (event.key === 'Escape') {
            filter.value = '';
            narrow();
        }
    });
    host.replaceChildren(html('div', { class: 'palette-search' }, filter), ...groups);
}

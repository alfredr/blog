// Persists the system, light, or dark theme preference. CSS reads `data-theme`
// on the root element; theme changes also request canvas redraws.
import { html, svg } from './dom.js';
const KEY = 'signal-lab:theme';
const CHANGE = 'signal-lab:theme';
const NEXT = {
    system: 'light',
    light: 'dark',
    dark: 'system',
};
const NAMES = {
    system: 'as the system is',
    light: 'light',
    dark: 'dark',
};
function stored() {
    try {
        const theme = localStorage.getItem(KEY);
        return theme === 'light' || theme === 'dark' ? theme : 'system';
    }
    catch {
        return 'system';
    }
}
function apply(theme) {
    if (theme === 'system') {
        delete document.documentElement.dataset.theme;
    }
    else {
        document.documentElement.dataset.theme = theme;
    }
    dispatchEvent(new Event(CHANGE));
}
/** Theme icons: half-filled circle, sun, and moon. */
function icon(theme) {
    const parts = {
        system: [
            svg('circle', { cx: 8, cy: 8, r: 5.5 }),
            svg('path', { class: 'fill', d: 'M8 2.5a5.5 5.5 0 0 1 0 11z' }),
        ],
        light: [
            svg('circle', { cx: 8, cy: 8, r: 3 }),
            svg('path', {
                d: 'M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4',
            }),
        ],
        dark: [
            svg('path', {
                d: 'M12.5 10A5.5 5.5 0 0 1 6 3.5a5.5 5.5 0 1 0 6.5 6.5z',
            }),
        ],
    }[theme];
    return svg('svg', { class: 'theme-icon', viewBox: '0 0 16 16', 'aria-hidden': 'true' }, ...parts);
}
/**
 * Applies the saved theme and creates a button that cycles through the
 * choices.
 */
export function themeButton() {
    let theme = stored();
    const button = html('button', { type: 'button', class: 'layout-toggle' });
    const show = () => {
        button.replaceChildren(icon(theme));
        button.title = `Colors: ${NAMES[theme]}. Click for ${NAMES[NEXT[theme]]}.`;
        button.setAttribute('aria-label', `Colors: ${NAMES[theme]}`);
    };
    button.addEventListener('click', () => {
        theme = NEXT[theme];
        try {
            localStorage.setItem(KEY, theme);
        }
        catch {
            // Keep the choice for this session if storage is unavailable.
        }
        apply(theme);
        show();
    });
    // Redraw on system theme changes when no explicit theme is selected.
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (theme === 'system') {
            dispatchEvent(new Event(CHANGE));
        }
    });
    apply(theme);
    show();
    return button;
}
/**
 * Weak references let discarded canvases be collected while retaining
 * subscriptions for cached widgets temporarily detached from the DOM.
 */
const redraws = new Set();
addEventListener(CHANGE, () => {
    for (const ref of redraws) {
        const redraw = ref.deref();
        if (redraw) {
            redraw();
        }
        else {
            redraws.delete(ref);
        }
    }
});
/**
 * Registers a redraw callback. The caller must retain a strong reference to
 * it.
 */
export function onThemeChange(redraw) {
    redraws.add(new WeakRef(redraw));
}

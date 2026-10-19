// Small helpers for building DOM and SVG trees without a framework.
const SVG_NS = 'http://www.w3.org/2000/svg';
function apply(element, attributes, children) {
    for (const [name, value] of Object.entries(attributes)) {
        if (value === undefined || value === false) {
            continue;
        }
        element.setAttribute(name, value === true ? '' : String(value));
    }
    for (const child of children) {
        if (child === null || child === undefined || child === false) {
            continue;
        }
        element.append(typeof child === 'number' ? String(child) : child);
    }
}
export function html(tag, attributes = {}, ...children) {
    const element = document.createElement(tag);
    apply(element, attributes, children);
    return element;
}
export function svg(tag, attributes = {}, ...children) {
    const element = document.createElementNS(SVG_NS, tag);
    apply(element, attributes, children);
    return element;
}
/** True when keyboard input is going to a text field rather than the app. */
export function isTyping(target) {
    // A shape check: keyboard targets are elements, the window or the document.
    const element = target;
    return (Boolean(element?.isContentEditable) ||
        /^(INPUT|TEXTAREA|SELECT)$/.test(element?.tagName ?? ''));
}

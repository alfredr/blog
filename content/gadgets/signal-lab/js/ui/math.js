// TeX math rendered to MathML by Temml. Temml is loaded as a classic script
// (vendor/temml.min.js) that defines a global; without it, math shows as its TeX source.
export function renderMath(tex, display) {
    const temml = globalThis.temml;
    if (!temml) {
        return document.createTextNode(display ? `$$${tex}$$` : `$${tex}$`);
    }
    const holder = document.createElement('span');
    temml.render(tex, holder, { displayMode: display, throwOnError: false });
    return holder.firstChild ?? holder;
}

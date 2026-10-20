// Highlight a formula while a selection touches it. Formulas are SVG drawn
// from glyph outlines, so the browser has no text in them to highlight.
// Copying already works, through the source text kiln puts beside each one,
// and like it a formula is selected whole.
(() => {
  const formulas = document.querySelectorAll(".math");
  if (formulas.length === 0) return;

  document.addEventListener("selectionchange", () => {
    const selection = document.getSelection();
    const active = selection !== null && !selection.isCollapsed;
    for (const formula of formulas) {
      formula.classList.toggle("selected", active && selection.containsNode(formula, true));
    }
  });
})();

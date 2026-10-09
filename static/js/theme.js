// Light/dark toggle in the site nav. A choice is remembered in this browser
// (applied before first paint by the inline script in base.html); with no
// stored choice the page follows the system setting.
(() => {
  const button = document.querySelector(".theme-toggle");
  if (!button) return;

  const root = document.documentElement;
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  const current = () => root.dataset.theme || (system.matches ? "dark" : "light");
  const other = (theme) => (theme === "dark" ? "light" : "dark");

  function sync() {
    button.dataset.current = current();
    button.setAttribute("aria-label", `Switch to ${other(current())} mode`);
  }

  button.addEventListener("click", () => {
    const next = other(current());
    root.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Storage blocked (private mode, disabled site data): the choice just
      // won't persist across pages.
    }
    sync();
  });

  system.addEventListener("change", sync);
  sync();
  button.hidden = false;
})();

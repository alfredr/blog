// Contents panel for the CV page. Each entry's rail segment fills as you read
// through that section; on narrow screens the panel opens from a button.
(() => {
  const rail = document.getElementById("cv-rail");
  const toggle = document.querySelector(".cv-toc-toggle");
  const backdrop = document.querySelector(".cv-backdrop");
  if (!rail || !toggle || !backdrop) return;

  const links = [...rail.querySelectorAll(".cv-toc a")];
  const sections = links.map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1))));
  const current = toggle.querySelector(".cv-toc-toggle-current");
  let activeIndex = -1;

  function update() {
    const doc = document.documentElement;
    const atEnd = window.scrollY + window.innerHeight >= doc.scrollHeight - 2;
    // The "reading line": a section counts as current once its top passes it.
    const line = window.scrollY + Math.min(window.innerHeight * 0.25, 160);

    let active = -1;
    sections.forEach((section, i) => {
      const top = section.getBoundingClientRect().top + window.scrollY;
      const progress = atEnd ? 1 : Math.min(Math.max((line - top) / section.offsetHeight, 0), 1);
      links[i].style.setProperty("--p", progress.toFixed(3));
      if (top <= line) active = i;
    });
    if (atEnd) active = sections.length - 1;

    if (active !== activeIndex) {
      links.forEach((a, i) => {
        a.classList.toggle("is-active", i === active);
        if (i === active) a.setAttribute("aria-current", "location");
        else a.removeAttribute("aria-current");
      });
      current.textContent = active >= 0 ? links[active].querySelector(".cv-toc-label").textContent : "";
      activeIndex = active;
    }

    const scrollable = doc.scrollHeight - window.innerHeight;
    toggle.style.setProperty("--progress", scrollable > 0 ? (window.scrollY / scrollable).toFixed(3) : "1");
  }

  let queued = false;
  function queueUpdate() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      update();
    });
  }

  function isOpen() {
    return rail.classList.contains("is-open");
  }

  function setOpen(open, { returnFocus = false } = {}) {
    update();
    rail.classList.toggle("is-open", open);
    backdrop.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    if (open) (links[activeIndex] || links[0]).focus({ preventScroll: true });
    else if (returnFocus) toggle.focus();
  }

  toggle.addEventListener("click", () => setOpen(!isOpen()));
  backdrop.addEventListener("click", () => setOpen(false, { returnFocus: true }));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) setOpen(false, { returnFocus: true });
  });
  links.forEach((a) => a.addEventListener("click", () => isOpen() && setOpen(false)));
  window.matchMedia("(min-width: 75rem)").addEventListener("change", () => setOpen(false));

  window.addEventListener("scroll", queueUpdate, { passive: true });
  window.addEventListener("resize", queueUpdate);
  update();
})();

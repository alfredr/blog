// Footnotes as margin notes. kiln lists a post's footnotes after its content.
// This copies each note next to its first reference; main.css shows the copies
// in the right margin where the page has room beside the text, and then hides
// the list. The copies are hidden from screen readers, which keep the list.
(() => {
  const refs = document.querySelectorAll(".footnote-ref a[id]");

  for (const ref of refs) {
    const id = ref.getAttribute("href").slice(1);
    const note = document.getElementById(id);
    // Only a note's first reference, whose id the note links back to, gets it.
    if (!note || note.querySelector(".footnote-back")?.getAttribute("href") !== `#${ref.id}`) {
      continue;
    }

    const side = document.createElement("span");
    side.className = "sidenote";
    side.setAttribute("aria-hidden", "true");
    const number = document.createElement("span");
    number.className = "sidenote-number";
    number.textContent = ref.textContent;
    side.append(number, " ");
    for (const child of note.childNodes) {
      if (!child.classList?.contains("footnote-back")) side.append(child.cloneNode(true));
    }
    ref.parentElement.after(side);

    // With the note beside the text, the reference has nowhere to go.
    ref.addEventListener("click", (event) => {
      if (getComputedStyle(side).display === "none") return;
      event.preventDefault();
      side.classList.remove("flash");
      void side.offsetWidth;
      side.classList.add("flash");
    });
  }
})();

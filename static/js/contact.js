// "Email" buttons (templates/contact.html) carry the email address as two
// reversed halves. Clicking one swaps it for the real mailto link, so the
// address only exists in the page after someone asks for it.
document.querySelectorAll(".contact-email").forEach((button) => {
  button.hidden = false;
  button.addEventListener("click", () => {
    const flip = (s) => [...s].reverse().join("");
    const address = `${flip(button.dataset.u)}@${flip(button.dataset.d)}`;
    const link = document.createElement("a");
    link.href = `mailto:${address}`;
    link.textContent = address;
    button.replaceWith(link);
    link.focus();
  });
});

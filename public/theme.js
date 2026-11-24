const THEME_KEY = "shodi/theme/v1";
export function initTheme() {
  const root = document.documentElement;
  const button = document.getElementById("theme-toggle");
  if (!button) return;
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  let choice;
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") choice = saved;
  } catch {}
  function apply(theme) {
    root.dataset.theme = theme;
    const dark = theme === "dark";
    button.setAttribute("aria-pressed", String(dark));
    button.querySelector("span").textContent = dark ? "Светлая тема" : "Тёмная тема";
    button.querySelector("use").setAttribute("href", dark ? "#i-sun" : "#i-moon");
  }
  const preferred = () => choice ?? (system.matches ? "dark" : "light");
  apply(preferred());
  button.addEventListener("click", () => {
    choice = preferred() === "dark" ? "light" : "dark";
    apply(choice);
    try { localStorage.setItem(THEME_KEY, choice); } catch {}
  });
  system.addEventListener("change", () => { if (!choice) apply(preferred()); });
  window.addEventListener("storage", event => {
    if (event.key !== THEME_KEY && event.key !== null) return;
    choice = ["light", "dark"].includes(event.newValue) ? event.newValue : undefined;
    apply(preferred());
  });
}

const STORAGE_KEY = "inezaodon-theme";

function applyTheme(theme) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme === "dark" ? "dark" : "light";

  const btn = document.querySelector(".theme-toggle");
  if (btn) {
    btn.setAttribute(
      "aria-label",
      theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
    );
    btn.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
  }
}

export function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  const theme = saved === "light" || saved === "dark" ? saved : "dark";
  applyTheme(theme);

  const btn = document.querySelector(".theme-toggle");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
    const next = current === "dark" ? "light" : "dark";
    applyTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
  });
}

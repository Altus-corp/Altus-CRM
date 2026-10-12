export function setTheme(theme: "light" | "dark") {
  document.documentElement.dataset.theme = theme;
}

export function getTheme(): "light" | "dark" {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

const THEME_KEY = 'theme';
const LIGHT = 'light';
const DARK = 'dark';
const metaTheme = document.querySelector('meta[name="theme-color"]');

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  if (metaTheme) {
    metaTheme.content = theme === DARK ? '#0f172a' : '#FAFAF7';
  }
}

export function getCurrentTheme() {
  return document.documentElement.getAttribute('data-theme') || LIGHT;
}

export function initThemeToggle(toggleId) {
  const label = document.getElementById(toggleId);
  if (!label) return;
  const checkbox = label.querySelector('input[type="checkbox"]');
  if (!checkbox) return;

  checkbox.checked = getCurrentTheme() === DARK;

  checkbox.addEventListener('change', () => {
    setTheme(checkbox.checked ? DARK : LIGHT);
  });
}

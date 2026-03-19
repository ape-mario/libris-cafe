export type Theme = 'light' | 'dark' | 'system';

let theme = $state<Theme>(
  (typeof localStorage !== 'undefined' && localStorage.getItem('theme') as Theme) || 'system'
);

export function getTheme(): Theme {
  return theme;
}

export function setTheme(newTheme: Theme) {
  theme = newTheme;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('theme', newTheme);
  }
  applyTheme();
}

export function applyTheme() {
  if (typeof document === 'undefined') return;

  const isDark = theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  document.documentElement.classList.toggle('dark', isDark);

  // Update theme-color meta tag
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', isDark ? '#1a1510' : '#faf6f1');
  }
}

let themeMediaHandler: (() => void) | null = null;

export function initTheme() {
  applyTheme();
  // Listen for system theme changes
  if (typeof window !== 'undefined' && !themeMediaHandler) {
    themeMediaHandler = () => { if (theme === 'system') applyTheme(); };
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeMediaHandler);
  }
}

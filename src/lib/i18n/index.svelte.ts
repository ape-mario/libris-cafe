import en from './en';
import id from './id';

export type Locale = 'en' | 'id';
type TranslationKey = keyof typeof en;

const translations: Record<Locale, Record<string, string>> = { en, id };

let currentLocale = $state<Locale>(
  (typeof localStorage !== 'undefined' && localStorage.getItem('locale') as Locale) || 'id'
);

export const localeStore = { get current() { return currentLocale; } };

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale) {
  currentLocale = locale;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('locale', locale);
  }
}

export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  let text = translations[currentLocale]?.[key] || translations.en[key] || key;

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }

  return text;
}

export function bookCount(count: number): string {
  if (currentLocale === 'id') return `${count} buku`;
  return `${count} ${count === 1 ? 'book' : 'books'}`;
}

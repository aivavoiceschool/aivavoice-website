import { uk } from './uk';
import { en } from './en';
import type { Translations } from './uk';

const translations: Record<string, Translations> = { uk, en };

export const defaultLang = 'uk';
export const languages = { uk: 'UA', en: 'EN' } as const;

export function t(lang: string = defaultLang): Translations {
  return translations[lang] ?? translations[defaultLang];
}

export function getLangFromUrl(url: URL): string {
  const [, lang] = url.pathname.split('/');
  if (lang && lang in translations) return lang;
  return defaultLang;
}

export function localizedPath(path: string, lang: string): string {
  if (lang === defaultLang) return path;
  return `/${lang}${path}`;
}

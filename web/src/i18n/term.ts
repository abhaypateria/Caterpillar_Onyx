import type { TFunction } from 'i18next';

/**
 * Display a data value (task type, site, skill, weather, ground, light) in the current language.
 * Data stays in English internally so models, storage and voice logic are unaffected;
 * only what the operator sees or hears is translated. Unknown values fall back to the original.
 */
export type TermKind = 'task' | 'site' | 'skill' | 'weather' | 'ground' | 'light';
export const termKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
export const term = (t: TFunction, kind: TermKind, value: string) => t(`term.${kind}.${termKey(value)}`, { defaultValue: value });

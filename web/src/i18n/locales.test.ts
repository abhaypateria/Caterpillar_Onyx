import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import hi from './locales/hi.json';
import ta from './locales/ta.json';
import kn from './locales/kn.json';

type Tree = { [k: string]: string | Tree };
const flat = (o: Tree, p = ''): [string, string][] =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [[p + k, v] as [string, string]] : flat(v, `${p}${k}.`)));
const placeholders = (s: string) => [...s.matchAll(/{{(\w+)}}/g)].map((m) => m[1]).sort();

const EN = new Map(flat(en as Tree));

describe.each([['hi', hi], ['ta', ta], ['kn', kn]] as const)('%s locale', (_, locale) => {
  const L = new Map(flat(locale as Tree));

  it('has every English key and no extras', () => {
    expect([...L.keys()].sort()).toEqual([...EN.keys()].sort());
  });

  it('has no empty strings', () => {
    expect([...L].filter(([, v]) => !v.trim()).map(([k]) => k)).toEqual([]);
  });

  it('keeps the same {{placeholders}} as English', () => {
    const bad = [...EN].filter(([k, v]) => JSON.stringify(placeholders(v)) !== JSON.stringify(placeholders(L.get(k) ?? '')));
    expect(bad.map(([k]) => k)).toEqual([]);
  });
});

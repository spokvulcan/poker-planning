import { defaultFilter } from "cmdk";

const TYPO = 0.1;

const startsAWord = (text: string, query: string) => ` ${text}`.includes(` ${query}`);

/**
 * How well a row answers a search, from 0 (hidden) to 1: the command menu's
 * filter. A row whose name starts with the search comes first, then one with
 * a word that does, then one with it inside a word, then one found by its
 * keywords. A misspelling still finds a row by its name, below all of those,
 * but letters merely scattered through it do not: "pric" is no typo for
 * "Story points vs hours". Keywords never match loosely, or "pric" would find
 * "Start estimating" through "poker … points … scrum".
 */
export function rank(value: string, search: string, keywords: string[] = []): number {
  const query = search.trim().toLowerCase();
  if (!query) return 1;

  const name = value.toLowerCase();
  if (name.startsWith(query)) return 1;
  if (startsAWord(name, query)) return 0.9;
  if (name.includes(query)) return 0.8;

  const extra = keywords.join(" ").toLowerCase();
  if (startsAWord(extra, query)) return 0.7;
  if (extra.includes(query)) return 0.6;

  // cmdk's fuzzy score: a dropped letter scores about 0.15, scattered ones under 0.05.
  const fuzzy = defaultFilter(name, query);
  return fuzzy >= TYPO ? fuzzy * 0.5 : 0;
}

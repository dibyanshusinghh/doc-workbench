import { randomUUID } from 'node:crypto';
import type { ExtractedFact, FactKind } from '../shared/schemas.js';
import type { TextChunk } from './types.js';

/**
 * Deterministic (non-AI) fact extraction. Produces facts from:
 *  1. "Key: Value" lines  → kind is inferred from key and value
 *  2. dates and money amounts mentioned in free text
 * Every fact records its document, chunk, character offset and source line.
 */

const KEY_VALUE_LINE = /^([A-Za-z][A-Za-z0-9 .,'&()/-]{0,59}?)\s*:\s*(.+)$/;
const MAX_SNIPPET_LENGTH = 200;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_NAME = '(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)';

const DATE_PATTERNS = {
  iso: /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/,
  dayMonthYear: /\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/, // UK order: DD/MM/YYYY
  dayMonthName: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_NAME}\\s+(\\d{4})\\b`, 'i'),
  monthNameDay: new RegExp(`\\b${MONTH_NAME}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'i'),
};

const MONEY_PATTERN =
  /(?:[£$€]\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:k|m|bn|million|billion)\b)?|\b\d[\d,]*(?:\.\d+)?\s?(?:GBP|USD|EUR)\b)/i;
const MONEY_KEY = /revenue|turnover|income|profit|loss|amount|value|price|cost|salary|assets|liabilities|equity|balance|fee|capital/i;
const IDENTIFIER_KEY = /\b(number|no|id|licen[cs]e|registration|reg|reference|ref|account|vat|crn|code)\b/i;
const PLAIN_NUMBER = /^-?\d[\d,]*(\.\d+)?$/;

export function extractFacts(documentId: string, chunks: TextChunk[]): ExtractedFact[] {
  const facts: ExtractedFact[] = [];

  for (const chunk of chunks) {
    let lineOffset = chunk.startOffset;

    for (const line of chunk.text.split('\n')) {
      const fact = (key: string, value: string, kind: FactKind, offsetInLine: number): ExtractedFact => ({
        id: randomUUID(),
        documentId,
        key,
        value,
        normalizedValue: normalizeValue(value, kind),
        kind,
        location: { chunkIndex: chunk.index, startOffset: lineOffset + offsetInLine },
        snippet: line.slice(0, MAX_SNIPPET_LENGTH),
        origin: 'extracted',
      });

      const keyValue = KEY_VALUE_LINE.exec(line);
      if (keyValue) {
        const key = keyValue[1]!.trim();
        const value = keyValue[2]!.trim();
        facts.push(fact(key, value, classify(key, value), 0));
      } else {
        for (const match of findAll(line, MONEY_PATTERN)) {
          facts.push(fact('Amount mentioned', match.text, 'money', match.index));
        }
        for (const pattern of Object.values(DATE_PATTERNS)) {
          for (const match of findAll(line, pattern)) {
            facts.push(fact('Date mentioned', match.text, 'date', match.index));
          }
        }
      }

      lineOffset += line.length + 1; // +1 for the "\n" removed by split
    }
  }

  return facts;
}

function classify(key: string, value: string): FactKind {
  if (value.length <= 40 && toIsoDate(value) !== null) return 'date';
  if (MONEY_PATTERN.test(value) || (MONEY_KEY.test(key) && PLAIN_NUMBER.test(value))) return 'money';
  if (IDENTIFIER_KEY.test(key)) return 'identifier';
  return 'field';
}

/** Produces a comparable form of a value, so "£1,200,000" and "1.2m GBP" compare equal. */
export function normalizeValue(value: string, kind: FactKind): string {
  switch (kind) {
    case 'date':
      return toIsoDate(value) ?? value.toLowerCase();
    case 'money':
      return toAmount(value) ?? value.toLowerCase();
    case 'identifier':
      return value.toLowerCase().replace(/[^a-z0-9]/g, '');
    case 'field':
      return value.toLowerCase().replace(/\s+/g, ' ').replace(/[.,;]+$/, '').trim();
  }
}

/** Returns YYYY-MM-DD for the first date found in the text, or null. */
function toIsoDate(text: string): string | null {
  let match: RegExpExecArray | null;
  let year: number, month: number, day: number;

  if ((match = DATE_PATTERNS.iso.exec(text))) {
    [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = DATE_PATTERNS.dayMonthYear.exec(text))) {
    [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = DATE_PATTERNS.dayMonthName.exec(text))) {
    [day, month, year] = [Number(match[1]), monthNumber(match[2]!), Number(match[3])];
  } else if ((match = DATE_PATTERNS.monthNameDay.exec(text))) {
    [month, day, year] = [monthNumber(match[1]!), Number(match[2]), Number(match[3])];
  } else {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function monthNumber(name: string): number {
  return MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1;
}

const CURRENCY_CODES: Record<string, string> = { '£': 'GBP', gbp: 'GBP', $: 'USD', usd: 'USD', '€': 'EUR', eur: 'EUR' };

/**
 * Returns "<CURRENCY> <amount>" (e.g. "GBP 1200000"), or just "<amount>" when no currency
 * is stated, or null if no number is found.
 */
function toAmount(text: string): string | null {
  const match = /(-?\d[\d,]*(?:\.\d+)?)\s?(k|m|bn|million|billion)?\b/i.exec(text);
  if (!match) return null;

  const multipliers: Record<string, number> = { k: 1e3, m: 1e6, million: 1e6, bn: 1e9, billion: 1e9 };
  const suffix = match[2]?.toLowerCase();
  const amount = String(Math.round(Number(match[1]!.replace(/,/g, '')) * (suffix ? multipliers[suffix]! : 1) * 100) / 100);

  const currencyMatch = /[£$€]|\b(GBP|USD|EUR)\b/i.exec(text);
  const currency = currencyMatch ? CURRENCY_CODES[currencyMatch[0].toLowerCase()] : undefined;
  return currency ? `${currency} ${amount}` : amount;
}

export type MoneyComparison = 'match' | 'amount_mismatch' | 'currency_mismatch';

/**
 * Compares two normalised money values (output of normalizeValue with kind 'money').
 * Amounts must be equal. Currencies only conflict when both are stated and differ,
 * so "GBP 1000" vs "1000" is a match but "GBP 1000" vs "USD 1000" is not.
 */
export function compareMoney(a: string, b: string): MoneyComparison {
  const first = splitMoney(a);
  const second = splitMoney(b);

  if (first.amount !== second.amount) return 'amount_mismatch';
  if (first.currency && second.currency && first.currency !== second.currency) return 'currency_mismatch';
  return 'match';
}

function splitMoney(normalized: string): { currency: string | null; amount: string } {
  const [first = '', second] = normalized.split(' ');
  return second === undefined ? { currency: null, amount: first } : { currency: first, amount: second };
}

function findAll(line: string, pattern: RegExp): { text: string; index: number }[] {
  const globalPattern = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  return [...line.matchAll(globalPattern)].map((m) => ({ text: m[0], index: m.index }));
}

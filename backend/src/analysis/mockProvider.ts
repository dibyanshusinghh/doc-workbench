import { randomUUID } from 'node:crypto';
import { compareMoney } from '../pipeline/facts.js';
import type {
  ComparisonRow,
  CrossDocumentResult,
  ExtractedFact,
  FactKind,
  Finding,
  PerDocumentResult,
} from '../shared/schemas.js';
import type { DocumentAnalysisInput, LlmProvider, SynthesisInput } from './provider.js';

/**
 * A deterministic stand-in for an LLM. It "interprets" the extracted facts:
 * it aligns equivalent fields across documents, compares their values and
 * reports discrepancies and missing information, citing the source of each finding.
 */

/** Different labels for the same field, mapped to one canonical name. */
const FIELD_SYNONYMS: Record<string, string> = {
  'registered name': 'company name',
  'business name': 'company name',
  'applicant name': 'company name',
  'legal name': 'company name',
  'name of company': 'company name',
  company: 'company name',
  'licence no': 'licence number',
  'license number': 'licence number',
  'license no': 'licence number',
  licence: 'licence number',
  license: 'licence number',
  'annual revenue': 'revenue',
  'total revenue': 'revenue',
  turnover: 'revenue',
  'annual turnover': 'revenue',
  'registered address': 'address',
  'business address': 'address',
  'registered office': 'address',
  'registered office address': 'address',
  incorporated: 'date of incorporation',
  'incorporation date': 'date of incorporation',
  'company number': 'registration number',
  'company registration number': 'registration number',
  'reg no': 'registration number',
  crn: 'registration number',
};

/** Facts found in free text (not labelled) are too generic to align across documents. */
const UNLABELLED_FACT_KEYS = new Set(['Amount mentioned', 'Date mentioned']);

/** Keywords in the user's instruction narrow the analysis to certain kinds of facts. */
const FOCUS_RULES: { label: string; pattern: RegExp; kinds: FactKind[] }[] = [
  { label: 'dates', pattern: /date|deadline|obligation|expir|due|timeline/i, kinds: ['date'] },
  { label: 'financial values', pattern: /financ|revenue|turnover|money|amount|profit|value/i, kinds: ['money'] },
  { label: 'names, addresses and identifiers', pattern: /name|address|licen[cs]e|identit|registration/i, kinds: ['field', 'identifier'] },
];

type Mismatch = 'value' | 'amount' | 'currency';

export class MockLlmProvider implements LlmProvider {
  readonly name = 'mock';

  async analyzeDocument({ prompt, document }: DocumentAnalysisInput): Promise<PerDocumentResult> {
    const { kinds } = detectFocus(prompt);
    const labelledKeys = [...new Set(document.facts.filter((f) => !UNLABELLED_FACT_KEYS.has(f.key)).map((f) => f.key))];

    const summary = [
      `${document.format.toUpperCase()} document with ${document.chunks.length} section(s) and ${document.facts.length} extracted fact(s) (${describeKinds(document.facts)}).`,
      labelledKeys.length > 0 ? `Key fields: ${labelledKeys.slice(0, 6).join(', ')}.` : 'No labelled fields were found.',
      document.truncated ? 'Only the first part was analysed because the document exceeds the size limit.' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return {
      documentId: document.id,
      summary,
      factIds: document.facts.filter((f) => kinds.has(f.kind)).map((f) => f.id),
    };
  }

  async synthesize({ prompt, documents, facts }: SynthesisInput): Promise<CrossDocumentResult> {
    const focus = detectFocus(prompt);
    const nameOf = (documentId: string) => documents.find((d) => d.id === documentId)?.name ?? documentId;
    const fields = groupFactsByField(facts.filter((f) => focus.kinds.has(f.kind)));

    const comparison: ComparisonRow[] = [];
    const discrepancies: Finding[] = [];
    const missingInformation: Finding[] = [];

    for (const [field, factsByDocument] of fields) {
      if (factsByDocument.size < 2) continue; // a field needs 2+ documents to be compared

      const present = [...factsByDocument.values()];
      const missingFrom = documents.filter((d) => !factsByDocument.has(d.id));
      const mismatch = findMismatch(present);

      comparison.push({
        field: toLabel(field),
        status: mismatch ? 'mismatch' : missingFrom.length > 0 ? 'partial' : 'match',
        values: documents.map((d) => {
          const fact = factsByDocument.get(d.id);
          return fact ? { documentId: d.id, value: fact.value, factId: fact.id } : { documentId: d.id, value: null };
        }),
      });

      if (mismatch) {
        discrepancies.push(discrepancyFinding(field, present, mismatch, nameOf));
      }
      for (const doc of missingFrom) {
        missingInformation.push(missingFinding(field, doc, present, nameOf));
      }
    }

    discrepancies.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));

    return {
      summary: buildSummary(prompt, documents.length, focus.labels, comparison, discrepancies, missingInformation),
      comparison,
      discrepancies,
      missingInformation,
    };
  }
}

function detectFocus(prompt: string): { labels: string[]; kinds: Set<FactKind> } {
  const matched = FOCUS_RULES.filter((rule) => rule.pattern.test(prompt));
  const rules = matched.length > 0 ? matched : FOCUS_RULES; // no keywords → look at everything
  return { labels: matched.map((r) => r.label), kinds: new Set(rules.flatMap((r) => r.kinds)) };
}

function canonicalField(key: string): string {
  const cleaned = key.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return FIELD_SYNONYMS[cleaned] ?? cleaned;
}

/** field → (documentId → first fact for that field in that document) */
function groupFactsByField(facts: ExtractedFact[]): Map<string, Map<string, ExtractedFact>> {
  const fields = new Map<string, Map<string, ExtractedFact>>();

  for (const fact of facts) {
    if (UNLABELLED_FACT_KEYS.has(fact.key)) continue;
    const field = canonicalField(fact.key);
    const byDocument = fields.get(field) ?? new Map<string, ExtractedFact>();
    if (!byDocument.has(fact.documentId)) byDocument.set(fact.documentId, fact);
    fields.set(field, byDocument);
  }
  return fields;
}

/** Compares every value against the first one. Returns the kind of mismatch, or null if all agree. */
function findMismatch(facts: ExtractedFact[]): Mismatch | null {
  const [first, ...others] = facts;
  if (!first) return null;

  for (const other of others) {
    if (first.kind === 'money' && other.kind === 'money') {
      const result = compareMoney(first.normalizedValue, other.normalizedValue);
      if (result === 'amount_mismatch') return 'amount';
      if (result === 'currency_mismatch') return 'currency';
    } else if (comparableText(first) !== comparableText(other)) {
      return 'value';
    }
  }
  return null;
}

/** Treats common equivalent spellings as equal, e.g. "Acme Ltd" and "ACME Limited". */
function comparableText(fact: ExtractedFact): string {
  if (fact.kind !== 'field') return fact.normalizedValue;
  return fact.normalizedValue
    .replace(/\blimited\b/g, 'ltd')
    .replace(/\bincorporated\b/g, 'inc')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function discrepancyFinding(
  field: string,
  facts: ExtractedFact[],
  mismatch: Mismatch,
  nameOf: (id: string) => string,
): Finding {
  const label = toLabel(field);
  const values = facts.map((f) => `"${f.value}" (${nameOf(f.documentId)})`).join('; ');
  const kind = facts[0]?.kind ?? 'field';

  return {
    id: randomUUID(),
    type: 'discrepancy',
    title: mismatch === 'currency' ? `${label} is stated in different currencies` : `${label} differs across documents`,
    detail:
      mismatch === 'currency'
        ? `The amounts match but the currencies differ: ${values}.`
        : `The documents report different values: ${values}.`,
    severity: kind === 'money' || kind === 'identifier' ? 'high' : 'medium',
    confidence: kind === 'field' ? 0.75 : 0.9,
    sources: facts.map((f) => ({ documentId: f.documentId, factId: f.id, snippet: f.snippet })),
    origin: 'ai_interpretation',
  };
}

function missingFinding(
  field: string,
  missingFrom: { id: string; name: string },
  presentIn: ExtractedFact[],
  nameOf: (id: string) => string,
): Finding {
  const label = toLabel(field);
  const kind = presentIn[0]?.kind ?? 'field';

  return {
    id: randomUUID(),
    type: 'missing_information',
    title: `${label} not found in ${missingFrom.name}`,
    detail: `"${label}" appears in ${presentIn.map((f) => nameOf(f.documentId)).join(', ')} but was not found in ${missingFrom.name}.`,
    severity: kind === 'money' || kind === 'identifier' ? 'medium' : 'low',
    confidence: 0.8,
    sources: [
      { documentId: missingFrom.id },
      ...presentIn.map((f) => ({ documentId: f.documentId, factId: f.id, snippet: f.snippet })),
    ],
    origin: 'ai_interpretation',
  };
}

function buildSummary(
  prompt: string,
  documentCount: number,
  focusLabels: string[],
  comparison: ComparisonRow[],
  discrepancies: Finding[],
  missing: Finding[],
): string {
  const count = (status: ComparisonRow['status']) => comparison.filter((row) => row.status === status).length;
  const incomplete = comparison.filter((row) => row.values.some((v) => v.value === null)).length;
  const parts = [`Analysed ${documentCount} document(s) for the instruction: "${prompt}".`];

  if (focusLabels.length > 0) parts.push(`Focused on ${focusLabels.join(' and ')}.`);

  if (comparison.length === 0) {
    parts.push('No relevant fields were shared by two or more documents, so no direct comparison was possible.');
  } else {
    parts.push(
      `Compared ${comparison.length} shared field(s): ${count('match')} consistent, ${count('mismatch')} conflicting, ${incomplete} missing from some documents.`,
    );
  }

  parts.push(`Found ${discrepancies.length} discrepancy(ies) and ${missing.length} missing-information item(s).`);
  if (discrepancies[0]) parts.push(`Most significant: ${discrepancies[0].title}.`);

  return parts.join(' ');
}

function describeKinds(facts: ExtractedFact[]): string {
  const counts: Record<FactKind, number> = { field: 0, date: 0, money: 0, identifier: 0 };
  for (const fact of facts) counts[fact.kind]++;
  return `${counts.date} date(s), ${counts.money} money value(s), ${counts.identifier} identifier(s), ${counts.field} other field(s)`;
}

function toLabel(field: string): string {
  return field.charAt(0).toUpperCase() + field.slice(1);
}

function severityRank(severity: Finding['severity']): number {
  return { low: 0, medium: 1, high: 2 }[severity];
}

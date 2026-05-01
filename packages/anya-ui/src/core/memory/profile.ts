/**
 * ../../core — AdaptiveProfile (anya.md)
 *
 * Single responsibility: the agent's living interpretation of 
 * user behavior patterns. NOT a log — a distilled understanding.
 *
 * Injected into the prompt's "Current Context" section so the
 * agent can reason with durable user preferences each turn.
 */

import type { FileStorage } from '../storage/interface';

const OBSERVATIONS_HEADER = '## Behavioral Observations';
const OBSERVATIONS_HINT = "(Agent will add observations as it learns the user's patterns)";
export const OBSERVATION_MERGE_THRESHOLD = 0.72;

function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, '\n');
}

function trimEmptyStart(lines: string[]): string[] {
  let index = 0;
  while (index < lines.length && lines[index].trim() === '') {
    index += 1;
  }
  return lines.slice(index);
}

function trimEmptyEnd(lines: string[]): string[] {
  let index = lines.length - 1;
  while (index >= 0 && lines[index].trim() === '') {
    index -= 1;
  }
  return lines.slice(0, index + 1);
}

function cleanObservationText(raw: string): string {
  return raw
    .replace(/^\s*[-*]\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeObservationForCompare(raw: string): string {
  return cleanObservationText(raw)
    .toLowerCase()
    .replace(/[.!?;:,]+$/g, '');
}

export function toTokenSet(raw: string): Set<string> {
  const cleaned = normalizeObservationForCompare(raw)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3);
  return new Set(cleaned);
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

function chooseMoreSpecificObservation(existing: string, incoming: string): string {
  const normalizedExisting = normalizeObservationForCompare(existing);
  const normalizedIncoming = normalizeObservationForCompare(incoming);

  if (normalizedExisting === normalizedIncoming) {
    return existing.length >= incoming.length ? existing : incoming;
  }

  if (normalizedIncoming.includes(normalizedExisting)) return incoming;
  if (normalizedExisting.includes(normalizedIncoming)) return existing;

  const existingTokens = toTokenSet(existing);
  const incomingTokens = toTokenSet(incoming);
  const incomingContainsAllExisting = [...existingTokens].every((token) => incomingTokens.has(token));
  if (incomingContainsAllExisting && incoming.length > existing.length) return incoming;

  return existing.length >= incoming.length ? existing : incoming;
}

interface ParsedObservationSection {
  before: string[];
  after: string[];
  observations: string[];
  hasSection: boolean;
}

function parseObservationSection(content: string): ParsedObservationSection {
  const lines = normalizeLineEndings(content).split('\n');
  const headerIndex = lines.findIndex((line) => line.trim() === OBSERVATIONS_HEADER);

  if (headerIndex < 0) {
    return {
      before: trimEmptyEnd(lines),
      after: [],
      observations: [],
      hasSection: false,
    };
  }

  let sectionEnd = lines.length;
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i].trim())) {
      sectionEnd = i;
      break;
    }
  }

  const observationLines = lines.slice(headerIndex + 1, sectionEnd)
    .map((line) => cleanObservationText(line))
    .filter((line) => line.length > 0 && line !== OBSERVATIONS_HINT && !line.startsWith('('));

  return {
    before: trimEmptyEnd(lines.slice(0, headerIndex)),
    after: trimEmptyStart(lines.slice(sectionEnd)),
    observations: observationLines,
    hasSection: true,
  };
}

function dedupeObservations(observations: string[]): string[] {
  const deduped: string[] = [];

  for (const rawObservation of observations) {
    const observation = cleanObservationText(rawObservation);
    if (!observation) continue;

    const exactIndex = deduped.findIndex((existing) =>
      normalizeObservationForCompare(existing) === normalizeObservationForCompare(observation)
    );
    if (exactIndex >= 0) {
      deduped[exactIndex] = chooseMoreSpecificObservation(deduped[exactIndex], observation);
      continue;
    }

    let bestIndex = -1;
    let bestScore = 0;
    const normalizedIncoming = normalizeObservationForCompare(observation);
    const incomingTokens = toTokenSet(observation);
    for (let i = 0; i < deduped.length; i += 1) {
      const normalizedExisting = normalizeObservationForCompare(deduped[i]);
      if (
        normalizedIncoming.includes(normalizedExisting)
        || normalizedExisting.includes(normalizedIncoming)
      ) {
        bestIndex = i;
        bestScore = 1;
        break;
      }

      const score = jaccardSimilarity(toTokenSet(deduped[i]), incomingTokens);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    if (bestIndex >= 0 && bestScore >= OBSERVATION_MERGE_THRESHOLD) {
      deduped[bestIndex] = chooseMoreSpecificObservation(deduped[bestIndex], observation);
      continue;
    }

    deduped.push(observation);
  }

  return deduped;
}

function buildProfileWithObservations(
  before: string[],
  observations: string[],
  after: string[]
): string {
  const lines: string[] = [];
  const beforeSection = trimEmptyEnd(before);

  if (beforeSection.length > 0) {
    lines.push(...beforeSection);
  } else {
    lines.push(
      '# Anya Adaptive Profile',
      '',
      '## Interaction Preferences',
      '- Default: adaptive (no fixed interaction mode)',
      '- The UI should respond to natural gestures'
    );
  }

  lines.push('', OBSERVATIONS_HEADER, OBSERVATIONS_HINT);
  for (const observation of observations) {
    lines.push(`- ${observation}`);
  }

  const afterSection = trimEmptyStart(after);
  if (afterSection.length > 0) {
    lines.push('', ...afterSection);
  }

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

function normalizeProfileContent(content: string): string {
  const parsed = parseObservationSection(content);
  const observations = dedupeObservations(parsed.observations);
  return buildProfileWithObservations(parsed.before, observations, parsed.after);
}

function addOrMergeObservation(content: string, observation: string): string {
  const parsed = parseObservationSection(content);
  const observations = dedupeObservations([...parsed.observations, observation]);
  return buildProfileWithObservations(parsed.before, observations, parsed.after);
}

export class AdaptiveProfile {
  private storage: FileStorage;
  private content: string = '';

  constructor(storage: FileStorage) {
    this.storage = storage;
  }

  /** Load the profile from disk */
  async load(): Promise<void> {
    const data = await this.storage.read('anya.md');
    const base = data ?? this.getDefaultProfile();
    const normalized = normalizeProfileContent(base);
    this.content = normalized;
    if (data !== null && normalized !== base) {
      await this.storage.write('anya.md', normalized);
    }
  }

  /** Get the current profile content for prompt injection into the current-context block. */
  getContent(): string {
    return this.content;
  }

  /** Get parsed behavioral observations from the current profile */
  getObservations(): string[] {
    const parsed = parseObservationSection(this.content || this.getDefaultProfile());
    return parsed.observations;
  }

  /**
   * Update the profile. Called by the agent after interpreting
   * user behavior. The agent decides what's important to remember.
   */
  async update(newContent: string): Promise<void> {
    this.content = newContent;
    await this.storage.write('anya.md', this.content);
  }

  /**
   * Append a behavioral observation. The agent calls this
   * when it notices a pattern worth remembering.
   */
  async addObservation(observation: string): Promise<void> {
    const cleanedObservation = cleanObservationText(observation);
    if (!cleanedObservation) return;

    const current = this.content || this.getDefaultProfile();
    const next = addOrMergeObservation(current, cleanedObservation);
    if (next === this.content) return;

    this.content = next;
    await this.storage.write('anya.md', this.content);
  }

  private getDefaultProfile(): string {
    return `# Anya Adaptive Profile

## Interaction Preferences
- Default: adaptive (no fixed interaction mode)
- The UI should respond to natural gestures

## Behavioral Observations
(Agent will add observations as it learns the user's patterns)
`;
  }
}

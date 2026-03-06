/**
 * Process-wide ID generation for runtime artifacts.
 * Host apps can override the generator to enforce deterministic IDs.
 */
export type IdGenerator = (prefix: string) => string;

let sequence = 0;

function defaultIdGenerator(prefix: string): string {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}`;
}

let activeIdGenerator: IdGenerator = defaultIdGenerator;

export function nextGeneratedId(prefix: string): string {
  return activeIdGenerator(prefix);
}

export function setIdGenerator(generator: IdGenerator): void {
  activeIdGenerator = generator;
}

export function resetIdGenerator(): void {
  sequence = 0;
  activeIdGenerator = defaultIdGenerator;
}

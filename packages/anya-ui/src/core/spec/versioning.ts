import type { ViewSpec } from '../types';

export const CURRENT_UI_SPEC_VERSION = 1;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

export function normalizeUISpecEnvelope(input: unknown): UnknownRecord {
  if (!isRecord(input) || !('layout' in input) || !('nodes' in input)) {
    throw new Error('[Spec] Invalid UI spec payload: missing required shape.');
  }

  const version = input.spec_version;
  if (!Number.isInteger(version)) {
    throw new Error(
      `[Spec] Missing or invalid spec_version. Expected '${CURRENT_UI_SPEC_VERSION}'.`
    );
  }

  if (version !== CURRENT_UI_SPEC_VERSION) {
    throw new Error(
      `[Spec] Unsupported spec_version '${version}'. ` +
      `Current runtime supports '${CURRENT_UI_SPEC_VERSION}'.`
    );
  }

  return input;
}

export function withSpecVersion(spec: ViewSpec): ViewSpec {
  return {
    ...spec,
    spec_version: spec.spec_version ?? CURRENT_UI_SPEC_VERSION,
  };
}

/**
 * ../core/internal — Internal API
 *
 * Advanced utilities for framework contributors, QA tooling, and telemetry consumers.
 * These are NOT part of the stable public API surface and may change between minor releases.
 */

// ─── Quality Assurance & Validation ─────────────────────────────────────
export {
  DEFAULT_BENCHMARK_REGRESSION_POLICY,
  DEFAULT_QUALITY_GATE_POLICY,
  evaluateBenchmarkRegression,
  evaluateQualityGates,
  summarizeBindingExecutionHistory,
  summarizeRuntimeTelemetry,
} from './quality';
export type {
  BenchmarkRegressionCheck,
  BenchmarkRegressionEvaluation,
  BenchmarkRegressionPolicy,
  BenchmarkThroughputMetrics,
  ViewExecutionSummary,
  QualityCheckStatus,
  QualityGateCheck,
  QualityGateEvaluation,
  QualityGateInput,
  QualityGatePolicy,
  RuntimeTelemetrySummary,
} from './quality';

// ─── Interaction QA ─────────────────────────────────────────────────────
export { validateInteractionResolvability } from './views/interactionQA';
export type {
  InteractionQAFailureCode,
  InteractionQAFailure,
  InteractionQAResult,
  InteractionQAOptions,
} from './views/interactionQA';
export {
  enforceButtonOnClickContract,
  validateSpecForPublish,
} from './views/specQA';
export type {
  ButtonContractRepairResult,
  SpecQAFailure,
  SpecQAFailureCode,
  SpecQAOptions,
  SpecQAResult,
} from './views/specQA';

// ─── Spec Versioning ────────────────────────────────────────────────────
export {
  CURRENT_UI_SPEC_VERSION,
  normalizeUISpecEnvelope,
  withSpecVersion,
} from './spec';

// ─── Memory Snapshot Internals ──────────────────────────────────────────
export {
  CURRENT_MEMORY_SNAPSHOT_VERSION,
  MemorySnapshotSchema,
  normalizeMemorySnapshot,
  parseMemorySnapshot,
  serializeMemorySnapshot,
} from './memory/snapshot';
export type { MemorySnapshot } from './memory/snapshot';

// ─── Runtime Telemetry Effect Constructors ──────────────────────────────
export {
  createRuntimeFailureBudgetEffect,
  createRuntimeTelemetryEffect,
} from './runtime';
export type {
  RuntimeFailureBudgetExceeded,
  RuntimeFailureBudgetOptions,
  RuntimeFailureBudgetPolicy,
  RuntimeFailureBudgetRecovered,
  RuntimeFailureBudgetSignal,
  RuntimeFailureBudgetSnapshot,
  RuntimeFailureOutcome,
  RuntimeTelemetryEvent,
  RuntimeTelemetryOptions,
  RuntimeTelemetrySink,
} from './runtime';

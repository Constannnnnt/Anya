import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { applyOptimisticUpdate } = require('../dist-cjs/utils.js');

function createSpec(componentCount) {
  const components = [];
  for (let i = 0; i < componentCount; i += 1) {
    components.push({
      id: `cmp-${i}`,
      type: 'TextInput',
      props: { value: i },
      bindTo: i < componentCount - 1 ? [`cmp-${i + 1}`] : undefined,
    });
  }

  return {
    spec_version: 1,
    layout: 'stack',
    components,
  };
}

function runChangeBenchmark(componentCount, iterations) {
  const baseSpec = createSpec(componentCount);
  const interaction = {
    timestamp: Date.now(),
    elementId: 'cmp-0',
    componentName: 'TextInput',
    action: 'change',
    propName: 'value',
    newValue: 999,
  };

  const startedAt = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    applyOptimisticUpdate(baseSpec, interaction);
  }
  const elapsedMs = performance.now() - startedAt;
  return {
    elapsedMs,
    opsPerSecond: Number(((iterations * 1000) / elapsedMs).toFixed(2)),
  };
}

function runNoopBenchmark(componentCount, iterations) {
  const baseSpec = createSpec(componentCount);
  const interaction = {
    timestamp: Date.now(),
    elementId: 'cmp-0',
    componentName: 'TextInput',
    action: 'submit',
  };

  const startedAt = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    applyOptimisticUpdate(baseSpec, interaction);
  }
  const elapsedMs = performance.now() - startedAt;
  return {
    elapsedMs,
    opsPerSecond: Number(((iterations * 1000) / elapsedMs).toFixed(2)),
  };
}

function main() {
  const componentCount = 200;
  const iterations = 2000;

  const change = runChangeBenchmark(componentCount, iterations);
  const noop = runNoopBenchmark(componentCount, iterations);

  const report = {
    benchmark: 'applyOptimisticUpdate',
    componentCount,
    iterations,
    results: {
      change,
      noop,
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main();

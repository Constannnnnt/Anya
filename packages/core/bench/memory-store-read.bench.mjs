import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { InMemoryMemoryStore } = require('../dist-cjs/memory/ui/inMemoryAdapter.js');

function makeEvent(index) {
  const ts = 1_700_000_000_000 + index;
  return {
    id: `e-${index}`,
    ts,
    actorId: 'actor-bench',
    sessionId: 'session-bench',
    type: 'interaction.recorded',
    source: 'user',
    payloadJson: '{}',
    tokenEstimate: 8,
  };
}

async function seedStore(store, eventCount) {
  const batchSize = 5_000;
  for (let offset = 0; offset < eventCount; offset += batchSize) {
    const end = Math.min(offset + batchSize, eventCount);
    const batch = [];
    for (let i = offset; i < end; i += 1) {
      batch.push(makeEvent(i));
    }
    await store.appendEvents(batch);
  }
}

async function runReadBenchmark(store, options, iterations) {
  const startedAt = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    await store.readEvents(options);
  }
  const elapsedMs = performance.now() - startedAt;
  return {
    elapsedMs: Number(elapsedMs.toFixed(2)),
    opsPerSecond: Number(((iterations * 1000) / elapsedMs).toFixed(2)),
  };
}

async function main() {
  const eventCount = 100_000;
  const iterations = 2_000;
  const store = new InMemoryMemoryStore();

  await seedStore(store, eventCount);

  const report = {
    benchmark: 'InMemoryMemoryStore.readEvents',
    eventCount,
    iterations,
    cases: {
      tailWindow: await runReadBenchmark(
        store,
        { afterId: `e-${eventCount - 500}`, limit: 200 },
        iterations,
      ),
      middleWindow: await runReadBenchmark(
        store,
        { afterId: `e-${Math.floor(eventCount / 2)}`, limit: 200 },
        iterations,
      ),
      missingCursorRecovery: await runReadBenchmark(
        store,
        { afterId: 'missing-id', limit: 200 },
        iterations,
      ),
      boundedRange: await runReadBenchmark(
        store,
        { afterId: 'e-1000', beforeId: 'e-1800', limit: 200 },
        iterations,
      ),
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

void main();

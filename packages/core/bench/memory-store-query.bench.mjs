import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { InMemoryMemoryStore } = require('../dist-cjs/memory/ui/inMemoryAdapter.js');

function nowBase(index) {
  return 1_700_000_000_000 + index;
}

function makePreference(index) {
  const categories = ['layout', 'theme', 'tooling', 'content'];
  const category = categories[index % categories.length];
  const ts = nowBase(index);
  return {
    id: `pref-${index}`,
    actorId: 'actor-bench',
    category,
    key: `k-${index % 2000}`,
    value: `value-${index}`,
    statement: `statement-${index}`,
    signalType: index % 2 === 0 ? 'explicit' : 'implicit',
    confidence: (index % 100) / 100,
    support: 1 + (index % 5),
    firstSeenTs: ts,
    lastSeenTs: ts,
    status: index % 3 === 0 ? 'active' : index % 3 === 1 ? 'candidate' : 'stale',
  };
}

function makePattern(index) {
  const taskClasses = ['dashboard', 'profile', 'search', 'admin'];
  const taskClass = taskClasses[index % taskClasses.length];
  return {
    id: `pat-${index}`,
    actorId: 'actor-bench',
    taskClass,
    sequenceKey: `seq-${index % 5000}`,
    sequenceJson: `["step-${index % 7}"]`,
    outcome: index % 4 === 0 ? 'failure' : 'success',
    confidence: ((index % 90) + 10) / 100,
    support: 1 + (index % 3),
    lastSeenTs: nowBase(index),
  };
}

function makeEpisode(index) {
  const intents = ['Create dashboard', 'Edit profile', 'Search records', 'Export report'];
  const sessions = ['s-1', 's-2', 's-3', 's-4', 's-5'];
  return {
    id: `ep-${index}`,
    actorId: 'actor-bench',
    sessionId: sessions[index % sessions.length],
    caseId: `case-${index % 2500}`,
    intent: intents[index % intents.length],
    assessment: index % 2 === 0 ? 'Yes' : 'No',
    summary: `summary-${index}`,
    justification: `justification-${index}`,
    createdTs: nowBase(index),
  };
}

function makeReflection(index) {
  return {
    id: `ref-${index}`,
    actorId: 'actor-bench',
    title: `title-${index}`,
    useCases: `use-case-${index}`,
    hints: `hint-${index}`,
    confidence: ((index % 80) + 20) / 100,
    updatedTs: nowBase(index),
  };
}

async function seedStore(store) {
  const prefCount = 20_000;
  const patternCount = 20_000;
  const episodeCount = 12_000;
  const reflectionCount = 8_000;

  for (let i = 0; i < prefCount; i += 1) {
    await store.upsertPreference(makePreference(i));
  }
  for (let i = 0; i < patternCount; i += 1) {
    await store.upsertPattern(makePattern(i));
  }
  for (let i = 0; i < episodeCount; i += 1) {
    await store.upsertEpisode(makeEpisode(i));
  }
  for (let i = 0; i < reflectionCount; i += 1) {
    await store.upsertReflection(makeReflection(i));
  }

  return { prefCount, patternCount, episodeCount, reflectionCount };
}

async function benchmark(iterations, fn) {
  const startedAt = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    await fn();
  }
  const elapsedMs = performance.now() - startedAt;
  return {
    elapsedMs: Number(elapsedMs.toFixed(2)),
    opsPerSecond: Number(((iterations * 1000) / elapsedMs).toFixed(2)),
  };
}

async function main() {
  const store = new InMemoryMemoryStore();
  const seedCounts = await seedStore(store);
  const iterations = 2_000;

  const report = {
    benchmark: 'InMemoryMemoryStore.query',
    iterations,
    seedCounts,
    cases: {
      preferencesByCategoryAndStatus: await benchmark(iterations, async () => {
        await store.findPreferences('actor-bench', {
          category: 'layout',
          status: 'active',
          limit: 50,
        });
      }),
      patternsByTaskClassAndOutcome: await benchmark(iterations, async () => {
        await store.findPatterns('actor-bench', {
          taskClass: 'dashboard',
          outcome: 'success',
          limit: 50,
        });
      }),
      episodesByIntentAndSession: await benchmark(iterations, async () => {
        await store.findEpisodes('actor-bench', {
          intent: 'Create dashboard',
          sessionId: 's-3',
          limit: 50,
        });
      }),
      reflectionsByActor: await benchmark(iterations, async () => {
        await store.findReflections('actor-bench', { limit: 50 });
      }),
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

void main();

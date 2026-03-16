import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { SQLiteMemoryStore } from '../src/memory/ui/sqliteAdapter';
import { createMemoryStoreByPolicySync } from '../src/memory/ui/storeFactory';

describe('SQLiteMemoryStore', () => {
  it('persists and reloads snapshot data across instances', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'anya-sqlite-'));
    const filename = join(dir, 'memory.sqlite');

    const storeA = await SQLiteMemoryStore.create({ filename });
    await storeA.appendEvents([
      {
        id: 'evt-1',
        ts: 1,
        actorId: 'actor-1',
        sessionId: 'session-1',
        type: 'session.intent_updated',
        source: 'user',
        payloadJson: '{"userIntent":"Compare"}',
        tokenEstimate: 4,
      },
    ]);
    await storeA.upsertPreference({
      id: 'pref-1',
      actorId: 'actor-1',
      category: 'layout',
      key: 'root_layout',
      value: 'split_pane',
      statement: 'Use split pane',
      signalType: 'explicit',
      confidence: 0.9,
      support: 2,
      firstSeenTs: 1,
      lastSeenTs: 2,
      status: 'active',
    });
    await storeA.setCursor({
      namespace: 'ui_memory',
      lastProcessedEventId: 'evt-1',
      lastProcessedTs: 1,
      updatedTs: 2,
    });
    storeA.close();

    const storeB = await SQLiteMemoryStore.create({ filename });
    const events = await storeB.readEvents();
    const prefs = await storeB.findPreferences('actor-1');
    const cursor = await storeB.getCursor('ui_memory');
    expect(events).toHaveLength(1);
    expect(prefs).toHaveLength(1);
    expect(cursor?.lastProcessedEventId).toBe('evt-1');
    storeB.close();

    rmSync(dir, { recursive: true, force: true });
  });
});

describe('createMemoryStoreByPolicySync', () => {
  it('returns in-memory adapter for memory policy', async () => {
    const store = createMemoryStoreByPolicySync({
      policy: 'memory',
    });
    await store.appendEvents([
      {
        id: 'evt-2',
        ts: 2,
        actorId: 'actor-1',
        sessionId: 'session-1',
        type: 'session.status_set',
        source: 'system',
        payloadJson: '{"status":"idle"}',
      },
    ]);
    const latest = await store.getLatestEventId();
    expect(latest).toBe('evt-2');
  });

  it('throws by default when the requested adapter is unavailable', () => {
    expect(() => createMemoryStoreByPolicySync({
      policy: 'indexeddb',
      runtime: 'node',
    })).toThrow("[MemoryStoreFactory] Failed to initialize 'indexeddb' adapter.");
  });

  it('downgrades to in-memory when selected adapter is unavailable and downgrade is enabled', async () => {
    const store = createMemoryStoreByPolicySync({
      policy: 'indexeddb',
      runtime: 'node',
      allowMemoryDowngrade: true,
    });
    await store.appendEvents([
      {
        id: 'evt-3',
        ts: 3,
        actorId: 'actor-1',
        sessionId: 'session-1',
        type: 'session.status_set',
        source: 'system',
        payloadJson: '{"status":"idle"}',
      },
    ]);
    expect(await store.getLatestEventId()).toBe('evt-3');
  });
});

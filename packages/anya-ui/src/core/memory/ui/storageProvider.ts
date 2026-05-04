import type { MemoryStoreSnapshot } from './store';

/**
 * Interface for environment-specific persistence mechanisms.
 */
export interface StorageProvider {
  /** Load the full snapshot from storage. Returns null if empty. */
  load(): Promise<MemoryStoreSnapshot | null>;
  /** Save the full snapshot to storage. */
  save(snapshot: MemoryStoreSnapshot): Promise<void>;
  /** Optional cleanup. */
  close?(): void;
}

// ─── Browser Provider (IndexedDB) ────────────────────────────────────────

const SNAPSHOT_STORE = 'snapshots';
const SNAPSHOT_ID = 'root';

export class BrowserStorageProvider implements StorageProvider {
  private db: IDBDatabase | null = null;
  private readonly dbName: string;
  private readonly dbVersion: number;

  constructor(options?: { dbName?: string; dbVersion?: number }) {
    this.dbName = options?.dbName ?? 'anya-ui-memory';
    this.dbVersion = options?.dbVersion ?? 1;
  }

  async load(): Promise<MemoryStoreSnapshot | null> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SNAPSHOT_STORE, 'readonly');
      const store = tx.objectStore(SNAPSHOT_STORE);
      const request = store.get(SNAPSHOT_ID);
      request.onsuccess = () => {
        const row = request.result as { data: MemoryStoreSnapshot } | undefined;
        resolve(row?.data ?? null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async save(snapshot: MemoryStoreSnapshot): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SNAPSHOT_STORE, 'readwrite');
      const store = tx.objectStore(SNAPSHOT_STORE);
      store.put({ id: SNAPSHOT_ID, data: snapshot, updatedTs: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  close() {
    this.db?.close();
    this.db = null;
  }

  private async getDb(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (typeof indexedDB === 'undefined') throw new Error('IndexedDB not available');
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
          db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      request.onerror = () => reject(request.error);
    });
  }
}

// ─── Node Provider (SQLite or JSON Fallback) ──────────────────────────────

export class NodeStorageProvider implements StorageProvider {
  private readonly filename: string;
  private sqliteDb: any | null = null;

  constructor(options?: { filename?: string }) {
    this.filename = options?.filename ?? '.anya/ui-memory.sqlite';
  }

  async load(): Promise<MemoryStoreSnapshot | null> {
    const strategy = await this.resolveStrategy();
    if (strategy === 'sqlite') {
      const row = this.sqliteDb.prepare('SELECT data FROM memory_snapshot WHERE id = ?').get('root');
      return row?.data ? JSON.parse(row.data) : null;
    } else {
      // @ts-ignore
      const fs = await import('node:fs');
      const jsonFile = this.filename.replace(/\.sqlite$/, '.json');
      if (!fs.existsSync(jsonFile)) return null;
      const data = fs.readFileSync(jsonFile, 'utf8');
      return JSON.parse(data);
    }
  }

  async save(snapshot: MemoryStoreSnapshot): Promise<void> {
    const strategy = await this.resolveStrategy();
    if (strategy === 'sqlite') {
      this.sqliteDb
        .prepare('INSERT INTO memory_snapshot (id, data, updated_ts) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_ts=excluded.updated_ts')
        .run('root', JSON.stringify(snapshot), Date.now());
    } else {
      // @ts-ignore
      const fs = await import('node:fs');
      // @ts-ignore
      const path = await import('node:path');
      const jsonFile = this.filename.replace(/\.sqlite$/, '.json');
      fs.mkdirSync(path.dirname(jsonFile), { recursive: true });
      fs.writeFileSync(jsonFile, JSON.stringify(snapshot, null, 2));
    }
  }

  close() {
    this.sqliteDb?.close?.();
  }

  private async resolveStrategy(): Promise<'sqlite' | 'json'> {
    if (this.sqliteDb) return 'sqlite';
    
    // Check for node:sqlite support (Node 22.5+)
    try {
      const sqliteSpecifier = `node:${'sqlite'}`;
      // @ts-ignore
      const { DatabaseSync } = await import(/* @vite-ignore */ sqliteSpecifier);
      // @ts-ignore
      const path = await import('node:path');
      // @ts-ignore
      const fs = await import('node:fs');
      fs.mkdirSync(path.dirname(this.filename), { recursive: true });
      
      this.sqliteDb = new DatabaseSync(this.filename);
      this.sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS memory_snapshot (
          id TEXT PRIMARY KEY,
          data TEXT NOT NULL,
          updated_ts INTEGER NOT NULL
        );
      `);
      return 'sqlite';
    } catch {
      return 'json';
    }
  }
}

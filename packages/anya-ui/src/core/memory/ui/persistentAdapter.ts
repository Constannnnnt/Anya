import type { MemoryStore, MemoryStoreSnapshot } from './store';
import type {
  UiMemoryEvent,
  PreferenceMemory,
  InteractionPattern,
  Episode,
  Reflection,
  MemoryCursor,
} from './schemas';
import type {
  EventReadOptions,
  PreferenceQueryOptions,
  PatternQueryOptions,
  EpisodeQueryOptions,
  ReflectionQueryOptions,
} from './store';
import { InMemoryMemoryStore } from './inMemoryAdapter';
import type { StorageProvider } from './storageProvider';

/**
 * A MemoryStore that persists its state using an external StorageProvider.
 * It uses an InMemoryMemoryStore internally for fast access and flushes
 * changes to the provider on every write.
 */
export class PersistentMemoryStore implements MemoryStore {
  private readonly memory = new InMemoryMemoryStore();
  private readonly provider: StorageProvider;
  private readonly ready: Promise<void>;

  constructor(provider: StorageProvider) {
    this.provider = provider;
    this.ready = this.initialize();
  }

  /** Convenience async factory */
  static async create(provider: StorageProvider): Promise<PersistentMemoryStore> {
    const store = new PersistentMemoryStore(provider);
    await store.waitUntilReady();
    return store;
  }

  async appendEvents(events: UiMemoryEvent[]): Promise<void> {
    await this.waitUntilReady();
    await this.memory.appendEvents(events);
    await this.persist();
  }

  async readEvents(options?: EventReadOptions): Promise<UiMemoryEvent[]> {
    await this.waitUntilReady();
    return this.memory.readEvents(options);
  }

  async getLatestEventId(): Promise<string | null> {
    await this.waitUntilReady();
    return this.memory.getLatestEventId();
  }

  async upsertPreference(pref: PreferenceMemory): Promise<void> {
    await this.waitUntilReady();
    await this.memory.upsertPreference(pref);
    await this.persist();
  }

  async findPreferences(actorId: string, options?: PreferenceQueryOptions): Promise<PreferenceMemory[]> {
    await this.waitUntilReady();
    return this.memory.findPreferences(actorId, options);
  }

  async upsertPattern(pattern: InteractionPattern): Promise<void> {
    await this.waitUntilReady();
    await this.memory.upsertPattern(pattern);
    await this.persist();
  }

  async findPatterns(actorId: string, options?: PatternQueryOptions): Promise<InteractionPattern[]> {
    await this.waitUntilReady();
    return this.memory.findPatterns(actorId, options);
  }

  async upsertEpisode(episode: Episode): Promise<void> {
    await this.waitUntilReady();
    await this.memory.upsertEpisode(episode);
    await this.persist();
  }

  async findEpisodes(actorId: string, options?: EpisodeQueryOptions): Promise<Episode[]> {
    await this.waitUntilReady();
    return this.memory.findEpisodes(actorId, options);
  }

  async upsertReflection(reflection: Reflection): Promise<void> {
    await this.waitUntilReady();
    await this.memory.upsertReflection(reflection);
    await this.persist();
  }

  async findReflections(actorId: string, options?: ReflectionQueryOptions): Promise<Reflection[]> {
    await this.waitUntilReady();
    return this.memory.findReflections(actorId, options);
  }

  async getCursor(namespace: string): Promise<MemoryCursor | null> {
    await this.waitUntilReady();
    return this.memory.getCursor(namespace);
  }

  async setCursor(cursor: MemoryCursor): Promise<void> {
    await this.waitUntilReady();
    await this.memory.setCursor(cursor);
    await this.persist();
  }

  async transaction<T>(fn: (store: MemoryStore) => Promise<T>): Promise<T> {
    await this.waitUntilReady();
    const result = await this.memory.transaction(fn);
    await this.persist();
    return result;
  }

  async exportJson(): Promise<MemoryStoreSnapshot> {
    await this.waitUntilReady();
    return this.memory.exportJson();
  }

  close(): void {
    this.provider.close?.();
  }

  private async waitUntilReady(): Promise<void> {
    await this.ready;
  }

  private async initialize(): Promise<void> {
    const snapshot = await this.provider.load();
    if (snapshot) {
      await this.hydrate(snapshot);
    }
  }

  private async hydrate(snapshot: MemoryStoreSnapshot): Promise<void> {
    await this.memory.appendEvents(snapshot.events ?? []);
    await Promise.all([
      ...(snapshot.preferences ?? []).map(pref => this.memory.upsertPreference(pref)),
      ...(snapshot.patterns ?? []).map(pattern => this.memory.upsertPattern(pattern)),
      ...(snapshot.episodes ?? []).map(episode => this.memory.upsertEpisode(episode)),
      ...(snapshot.reflections ?? []).map(reflection => this.memory.upsertReflection(reflection)),
      ...(snapshot.cursors ?? []).map(cursor => this.memory.setCursor(cursor)),
    ]);
  }

  private async persist(): Promise<void> {
    const snapshot = await this.memory.exportJson();
    await this.provider.save(snapshot);
  }
}

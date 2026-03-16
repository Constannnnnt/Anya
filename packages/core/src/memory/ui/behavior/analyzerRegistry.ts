import type { BehaviorAnalyzer } from './analyzers';

export class BehaviorAnalyzerRegistry {
  private readonly analyzers = new Map<string, BehaviorAnalyzer>();

  register(analyzer: BehaviorAnalyzer): this {
    this.analyzers.set(analyzer.id, analyzer);
    return this;
  }

  unregister(id: string): boolean {
    return this.analyzers.delete(id);
  }

  get(id: string): BehaviorAnalyzer | undefined {
    return this.analyzers.get(id);
  }

  list(): BehaviorAnalyzer[] {
    return [...this.analyzers.values()];
  }
}

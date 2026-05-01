import type { AnalyzerDependency } from './analyzers';

export class BehaviorDirtyTracker {
  private readonly dirty = new Set<AnalyzerDependency>();

  markDirty(...dependencies: AnalyzerDependency[]): void {
    for (const dependency of dependencies) {
      this.dirty.add(dependency);
    }
  }

  isDirty(dependency: AnalyzerDependency): boolean {
    return this.dirty.has(dependency);
  }

  snapshot(): Set<AnalyzerDependency> {
    return new Set(this.dirty);
  }

  clear(...dependencies: AnalyzerDependency[]): void {
    for (const dependency of dependencies) {
      this.dirty.delete(dependency);
    }
  }

  clearAll(): void {
    this.dirty.clear();
  }
}

import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';

// Keep hook/runtime tests deterministic by isolating persisted browser storage.
beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

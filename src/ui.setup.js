import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
const values = new Map();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key) => values.get(String(key)) ?? null,
    setItem: (key, value) => values.set(String(key), String(value)),
    removeItem: (key) => values.delete(String(key)),
    clear: () => values.clear(),
  },
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});

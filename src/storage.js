const memory = new Map();

export const storage = {
  getItem(key) {
    if (memory.has(key)) return memory.get(key);
    try {
      return globalThis.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    const text = String(value);
    memory.set(key, text);
    try {
      globalThis.localStorage.setItem(key, text);
    } catch {}
  },
  removeItem(key) {
    memory.set(key, null);
    try {
      globalThis.localStorage.removeItem(key);
    } catch {}
  }
};

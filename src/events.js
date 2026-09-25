export class EventEmitter {
  constructor() {
    this.listeners = new Map();
  }

  on(name, listener) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(listener);
    return this;
  }

  off(name, listener) {
    this.listeners.get(name)?.delete(listener);
  }

  emit(name, data) {
    for (const listener of this.listeners.get(name) || []) listener(data);
  }
}

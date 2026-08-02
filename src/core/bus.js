// Nodes never call each other directly. They publish to the bus and
// read from it. This is what makes feedback loops trivial (a node can
// read its own last-published value) and keeps node logic decoupled.
export class DataBus {
  constructor() {
    this.store = new Map();
  }
  publish(key, value) {
    this.store.set(key, value);
  }
  read(key) {
    return this.store.get(key);
  }
}

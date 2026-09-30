import { DuckGame } from './rules.js';

class MoveTree {
  constructor(game) {
    this.config = {
      variant: game.variant,
      position: game.position,
      blackPosition: game.blackPosition,
      fen: game.initialFen
    };
    this.nodes = [{ id: 0, parent: null, children: [], ply: 0 }];
    this.preferred = new Map();
    let parent = 0;
    for (const record of game.records) parent = this.add(parent, record);
  }

  add(parent, record, annotations = []) {
    const node = this.nodes[parent];
    const existing = node.children.find((id) => this.nodes[id].record.uci === record.uci);
    if (existing !== undefined) return existing;
    const id = this.nodes.length;
    this.nodes.push({
      id,
      parent,
      children: [],
      ply: node.ply + 1,
      record: structuredClone(record),
      annotations
    });
    node.children.push(id);
    return id;
  }

  path(id) {
    if (!this.nodes[id]) throw new Error('Invalid analysis position.');
    const path = [];
    for (let node = this.nodes[id]; node.parent !== null; node = this.nodes[node.parent])
      path.push(node.id);
    return path.reverse();
  }

  select(id) {
    for (const child of this.path(id)) this.preferred.set(this.nodes[child].parent, child);
  }

  line(id) {
    const path = [0, ...this.path(id)];
    let node = this.nodes[id];
    while (node.children.length) {
      node = this.nodes[this.preferred.get(node.id) ?? node.children[0]];
      path.push(node.id);
    }
    return path;
  }

  game(id) {
    const game = new DuckGame(this.config);
    for (const child of this.path(id)) game.playUci(this.nodes[child].record.uci);
    return game;
  }

  rows() {
    const rows = [];
    const stack = this.nodes[0].children
      .map((id, index) => ({ id, depth: index ? 1 : 0 }))
      .reverse();
    while (stack.length) {
      const item = stack.pop();
      const node = this.nodes[item.id];
      rows.push({ ...item, ...node.record, ply: node.ply });
      for (let index = node.children.length - 1; index >= 0; index--)
        stack.push({ id: node.children[index], depth: item.depth + (index ? 1 : 0) });
    }
    return rows;
  }
}

export { MoveTree };

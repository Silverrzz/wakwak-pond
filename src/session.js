import { EventEmitter } from './events.js';
import { DuckGame, sideName, opposite } from './rules.js';
import { GameClock } from './clock.js';
import { Engine } from './engine.js';
import { SearchData } from './search-data.js';
import { parsePgn, formatPgn } from './pgn.js';

const defaultControl = () => ({
  mode: 'clock',
  stages: [{ moves: 0, time: 300000, kind: 'increment', bonus: 3000 }]
});
const defaultConfig = () => ({
  variant: 'duck',
  position: 518,
  blackPosition: 518,
  w: 'human',
  b: 'human',
  controls: { w: defaultControl(), b: defaultControl() }
});

class Session extends EventEmitter {
  constructor(resolveEngine, log) {
    super();
    this.resolveEngine = resolveEngine;
    this.log = log;
    this.config = defaultConfig();
    this.pgn = null;
    this.game = new DuckGame();
    this.clock = new GameClock(this.config.controls);
    this.clockFrames = [this.clock.save()];
    this.phase = 'ready';
    this.busy = false;
    this.status = '';
    this.generation = 0;
    this.engines = {};
    this.searchData = new SearchData();
    this.id = 0;
    this.timer = setInterval(() => {
      if (this.phase !== 'playing') return;
      if (!this.checkFlag()) this.emit('clock', this.clock.snapshot());
    }, 100);
  }

  snapshot() {
    return {
      ...this.game.snapshot(),
      id: this.id,
      config: structuredClone(this.config),
      phase: this.phase,
      busy: this.busy,
      status: this.status,
      clock: this.clock.snapshot(),
      ...this.searchData.snapshot()
    };
  }
  publish() {
    this.emit('state', this.snapshot());
  }

  stopEngines() {
    this.generation++;
    this.searchData.stop('w');
    this.searchData.stop('b');
    for (const engine of Object.values(this.engines)) engine.close();
    this.engines = {};
    this.busy = false;
  }

  pause(message = '') {
    this.clock.pause();
    this.stopEngines();
    if (['playing', 'starting'].includes(this.phase)) this.phase = 'paused';
    this.status = message;
    this.publish();
  }

  checkFlag() {
    if (this.phase !== 'playing') return false;
    const loser = this.clock.expired();
    if (!loser) return false;
    if (this.game.pending) this.game.cancelPiece();
    this.finish(`${sideName(opposite(loser))} wins on time`, opposite(loser));
    return true;
  }

  finish(result, winner = null) {
    this.clock.pause();
    this.stopEngines();
    this.game.result = result;
    this.game.winner = winner;
    this.phase = 'finished';
    this.status = '';
    this.publish();
  }

  async start(input) {
    if (this.phase === 'starting') throw new Error('The engines are still starting.');
    const config = structuredClone(input);
    const game = new DuckGame(config);
    const clock = new GameClock(config.controls || {});
    for (const side of ['w', 'b']) if (config[side] !== 'human') this.resolveEngine(config[side]);
    this.pause();
    this.game = game;
    this.pgn = null;
    this.clock = clock;
    this.searchData = new SearchData();
    this.config = {
      ...config,
      customPosition: !!config.fen,
      startedAt: new Date().toISOString(),
      controls: clock.controls
    };
    this.clockFrames = [clock.save()];
    this.id++;
    this.phase = 'paused';
    this.status = '';
    return this.resume();
  }

  async resume() {
    if (!['paused', 'ready'].includes(this.phase)) throw new Error('This game cannot be resumed.');
    if (this.game.result) {
      this.finish(this.game.result, this.game.winner);
      return;
    }
    this.stopEngines();
    const token = this.generation;
    this.phase = 'starting';
    this.busy = true;
    this.status = 'Preparing engines';
    this.publish();
    try {
      for (const side of ['w', 'b']) {
        if (this.config[side] === 'human') continue;
        const profile = this.resolveEngine(this.config[side]);
        const engine = new Engine(
          profile.file,
          (name, dir, line) => this.log(sideName(side) + ' · ' + name, dir, line),
          (error) => {
            if (token === this.generation) this.pause(error.message);
          }
        );
        this.engines[side] = engine;
        await engine.initialize(this.game.variant, profile.settings);
        if (token !== this.generation) return;
      }
      this.phase = 'playing';
      this.status = '';
      this.busy = false;
      this.advance(token);
    } catch (error) {
      if (token !== this.generation) return;
      this.pause(error.message);
      throw error;
    }
  }

  onInfo(line, channel) {
    const info = this.searchData.update(line, channel);
    if (!info) return;
    this.emit('info', { ...info, gameId: this.id });
  }

  async advance(token = this.generation) {
    if (token !== this.generation || this.phase !== 'playing' || this.checkFlag()) return;
    if (this.game.result) {
      this.finish(this.game.result, this.game.winner);
      return;
    }
    this.clock.start(this.game.turn);
    if (this.config[this.game.turn] === 'human') {
      this.busy = false;
      this.publish();
      return;
    }
    const side = this.game.turn,
      engine = this.engines[side];
    this.busy = true;
    this.searchData.start(side, side, engine.label, this.game.moves.length);
    this.publish();
    try {
      const move = await engine.move(
        this.game.initialFen,
        this.game.moves,
        this.clock.limits(side, engine),
        (line) => {
          if (token === this.generation) this.onInfo(line, side);
        }
      );
      if (token !== this.generation || this.phase !== 'playing' || this.checkFlag()) return;
      this.searchData.stop(side);
      this.game.playUci(move);
      this.clock.complete(side);
      this.clockFrames.push(this.clock.save());
      this.busy = false;
      this.publish();
      setTimeout(() => this.advance(token), 0);
    } catch (error) {
      if (token === this.generation) this.pause(error.message);
    }
  }

  move(data) {
    if (this.checkFlag()) return;
    if (this.phase !== 'playing' || this.busy || this.config[this.game.turn] !== 'human')
      throw new Error('It is not a human turn.');
    const side = this.game.turn;
    if (this.game.pending) this.game.placeDuck(data?.to);
    else {
      if (!Number.isInteger(data?.from) || !Number.isInteger(data?.to))
        throw new Error('Invalid square.');
      this.game.piece(data.from, data.to, data.promotion);
    }
    if (!this.game.pending) {
      this.clock.complete(side);
      this.clockFrames.push(this.clock.save());
    }
    this.advance();
  }

  cancelPiece() {
    if (this.checkFlag()) return;
    if (
      !['playing', 'paused'].includes(this.phase) ||
      this.busy ||
      this.config[this.game.turn] !== 'human'
    )
      throw new Error('It is not a human turn.');
    this.game.cancelPiece();
    this.publish();
  }

  takeback() {
    if (this.phase === 'starting') throw new Error('Wait for the engines to finish starting.');
    if (this.game.pending) {
      this.cancelPiece();
      return;
    }
    if (!this.game.moves.length) throw new Error('There is no move to take back.');
    this.pause();
    let ply = this.game.moves.length - 1;
    const humanSides = ['w', 'b'].filter((side) => this.config[side] === 'human');
    if (humanSides.length === 1)
      while (ply > 0 && this.game.frames[ply].turn !== humanSides[0]) ply--;
    this.game.rewind(ply);
    this.searchData.rewind(ply);
    this.clock.restore(this.clockFrames[ply]);
    this.clockFrames.length = ply + 1;
    this.phase = 'paused';
    this.status = 'Move taken back. Resume when ready.';
    this.id++;
    this.publish();
  }

  savePgn(playerName) {
    return formatPgn(this, playerName);
  }

  loadPgn(text, resolveEngine = (id) => id) {
    const loaded = parsePgn(text);
    for (const side of ['w', 'b']) loaded.config[side] = resolveEngine(loaded.config[side]);
    this.pause();
    Object.assign(this, loaded);
    this.phase = this.game.result ? 'finished' : 'paused';
    this.status = this.game.result ? '' : 'Game loaded. Resume when ready.';
    this.id++;
    this.publish();
  }

  close() {
    clearInterval(this.timer);
    this.clock.pause();
    this.stopEngines();
  }
}

export { Session, defaultConfig };

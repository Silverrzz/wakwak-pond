const { EventEmitter } = require('node:events');
const { DuckGame, square } = require('./rules');
const { Engine } = require('./engine');
const { SearchData } = require('./search-data');
const { parsePgn, formatPgn } = require('./pgn');
const { GameClock } = require('./clock');

const scoreValue = (row) =>
  row.scoreType === 'mate'
    ? (row.mateWinner === 'w' ? 1 : -1) * (1000000 - Math.min(Math.abs(row.score), 9999))
    : Math.max(-900000, Math.min(900000, row.score));

function compareScores(a, b, side) {
  if (a?.score === undefined) return b?.score === undefined ? 0 : 1;
  if (b?.score === undefined) return -1;
  return (scoreValue(b) - scoreValue(a)) * (side === 'w' ? 1 : -1);
}

class Analysis extends EventEmitter {
  constructor(resolveEngine, log) {
    super();
    this.resolveEngine = resolveEngine;
    this.log = log;
    this.enabled = false;
    this.running = true;
    this.revision = 0;
    this.generation = 0;
    this.engine = null;
    this.engineKey = null;
    this.searchTask = null;
    this.queue = Promise.resolve();
    this.data = new SearchData();
    this.points = new Map();
    this.lines = 1;
    this.maxLines = 1;
    this.phase = 'idle';
    this.error = '';
  }

  snapshot() {
    return {
      enabled: this.enabled,
      running: this.running,
      revision: this.revision,
      gameId: this.gameId,
      rootPly: this.rootPly,
      source: this.source,
      engineId: this.engineId,
      phase: this.phase,
      error: this.error,
      lines: this.lines,
      maxLines: this.maxLines,
      frame: this.frame,
      search: this.game ? this.data.current[this.game.turn] : null,
      evaluations: [...this.points.values()]
    };
  }

  publish() {
    clearTimeout(this.publishTimer);
    this.publishTimer = null;
    this.emit('state', this.snapshot());
  }

  select(session, input) {
    if (!input || input.gameId !== session.id) throw new Error('The game has changed.');
    if (session.phase === 'starting') throw new Error('Wait for the game engines to start.');
    let source = session.game;
    let sourceState = null;
    if (input.source === 'existing') {
      if (!this.enabled || !this.sourceGame) throw new Error('Open an analysis board first.');
      source = this.sourceGame;
      sourceState = this.source;
    } else if (['fresh', 'fen', 'pgn'].includes(input.source)) {
      if (input.source === 'fen' && !input.fen?.trim()) throw new Error('Paste a FEN position.');
      if (input.source === 'pgn' && !input.pgn?.trim()) throw new Error('Paste a PGN game.');
      const imported = input.source === 'pgn' ? parsePgn(input.pgn) : null;
      source =
        imported?.game ||
        new DuckGame({
          variant: input.variant,
          fen: input.source === 'fen' ? input.fen.trim() : ''
        });
      input = { ...input, ply: 0 };
      sourceState = {
        ...source.snapshot(),
        config: {
          ...imported?.config,
          w: 'human',
          b: 'human',
          fen: source.initialFen,
          customPosition: input.source === 'fen'
        },
        status: '',
        phase: 'paused'
      };
    }
    source.at(input.ply);
    if (input.engineId) this.resolveEngine(input.engineId);
    const game = Object.assign(Object.create(DuckGame.prototype), structuredClone(source));
    if (!source.pending || input.ply !== source.moves.length) game.rewind(input.ply);
    if (session.phase === 'playing') session.pause();
    if (this.gameId !== session.id || this.engineId !== input.engineId) this.points.clear();
    if (['fresh', 'fen', 'pgn'].includes(input.source) || (this.source && !sourceState))
      this.points.clear();
    this.sourceGame = sourceState ? source : null;
    this.source = sourceState;
    this.gameId = session.id;
    this.rootPly = input.ply;
    this.engineId = input.engineId;
    if (!this.enabled) this.running = !!input.engineId;
    if (!input.engineId) this.running = false;
    this.enabled = true;
    this.game = game;
    this.changed();
    return this.snapshot();
  }

  requirePosition(input) {
    if (!this.enabled || input?.revision !== this.revision)
      throw new Error('The analysis position has changed. Try again.');
  }

  pgn() {
    if (this.game.pending) throw new Error('Complete or undo the piece move before saving.');
    return formatPgn(
      {
        game: this.game,
        config: { w: 'human', b: 'human', fen: this.game.initialFen },
        clock: new GameClock({ w: { mode: 'unlimited' }, b: { mode: 'unlimited' } }),
        clockFrames: [],
        searchData: new SearchData()
      },
      (side) => (side === 'w' ? 'White' : 'Black')
    );
  }

  move(input) {
    this.requirePosition(input);
    if (this.game.moves.length - this.rootPly >= 1024)
      throw new Error('This variation is too long. Return to the game position.');
    if (this.game.pending) this.game.placeDuck(input.to);
    else this.game.piece(input.from, input.to, input.promotion);
    this.changed();
  }

  back(input) {
    this.requirePosition(input);
    if (this.game.pending) this.game.cancelPiece();
    else if (this.game.moves.length > this.rootPly) this.game.rewind(this.game.moves.length - 1);
    else return;
    this.changed();
  }

  reset(input) {
    this.requirePosition(input);
    this.game.rewind(this.rootPly);
    this.changed();
  }

  settings(input) {
    this.requirePosition(input);
    if (
      input.lines !== undefined &&
      (!Number.isInteger(input.lines) || input.lines < 1 || input.lines > this.maxLines)
    )
      throw new Error('Choose a supported number of analysis lines.');
    if (input.running !== undefined && typeof input.running !== 'boolean')
      throw new Error('Invalid analysis state.');
    if (input.engineId !== undefined) {
      this.resolveEngine(input.engineId);
      this.engineId = input.engineId;
      if (input.engineId && !this.running) this.running = true;
      this.points.clear();
      this.data = new SearchData();
      this.maxLines = 1;
      this.lines = 1;
    }
    if (input.lines !== undefined) this.lines = input.lines;
    if (input.running !== undefined) this.running = input.running;
    this.changed(input.running === false);
  }

  changed(keepSearch = false) {
    this.revision++;
    const token = ++this.generation;
    this.error = '';
    this.frame = this.game.snapshot();
    if (keepSearch) this.data.stop(this.game.turn);
    else {
      const previous = this.data.current[this.game.turn];
      this.data = new SearchData();
      if (this.game.pending && previous) {
        const seeds = new Map();
        for (const row of [...previous.rows].sort((a, b) => b.depth - a.depth)) {
          const move = row.pv?.split(/\s+/)[0];
          if (move?.startsWith(this.game.pending.notation + '@') && !seeds.has(move))
            seeds.set(move, row);
        }
        const search = this.data.start(
          this.game.turn,
          this.game.turn,
          previous.source,
          this.game.moves.length
        );
        search.rows = [...seeds.values()]
          .sort((a, b) => compareScores(a, b, this.game.turn))
          .slice(0, this.lines)
          .map((row, i) => ({ ...row, multipv: i + 1 }));
        search.latest = search.rows[0] || {};
        this.data.stop(this.game.turn);
      }
    }
    this.phase = this.game.result ? 'terminal' : this.running ? 'starting' : 'stopped';
    if (this.engine) this.engine.onInfo = null;
    clearTimeout(this.startTimer);
    this.startTimer = setTimeout(() => {
      this.queue = this.queue.catch(() => {}).then(() => this.run(token));
    }, 100);
    this.publish();
  }

  async halt() {
    const task = this.searchTask;
    const engine = this.engine;
    if (!task) return;
    let timer;
    try {
      if (engine && !engine.closed) engine.send('stop');
      await Promise.race([
        task,
        new Promise((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  'The engine did not stop its search. Retry analysis or choose another engine.'
                )
              ),
            3000
          );
        })
      ]);
    } catch (error) {
      engine?.close();
      if (this.engine === engine) this.engine = null;
      throw error;
    } finally {
      clearTimeout(timer);
      if (this.searchTask === task) this.searchTask = null;
    }
  }

  async run(token) {
    try {
      await this.halt();
      if (token !== this.generation || !this.enabled || !this.running || this.game.result) return;
      const profile = this.resolveEngine(this.engineId);
      const key = JSON.stringify([profile.file, profile.settings, this.game.variant]);
      if (!this.engine || this.engine.closed || key !== this.engineKey) {
        this.engine?.close();
        const engine = new Engine(profile.file, (name, dir, line) =>
          this.log('Analysis · ' + name, dir, line)
        );
        this.engine = engine;
        this.engineKey = null;
        try {
          await engine.initialize(this.game.variant, profile.settings);
        } catch (error) {
          engine.close();
          throw error;
        }
        this.engineKey = key;
        if (token !== this.generation) return;
      }
      const engine = this.engine;
      if (engine.options.some((option) => option.name === 'UCI_AnalyseMode'))
        engine.setOption('UCI_AnalyseMode', true);
      const multiPV = engine.options.find(
        (option) => option.name === 'MultiPV' && option.type === 'spin'
      );
      this.maxLines = this.game.pending
        ? 5
        : multiPV
          ? Math.max(1, Math.min(5, Number(multiPV.max) || 1))
          : 1;
      this.lines = Math.min(this.lines, this.maxLines);
      if (multiPV) engine.setOption('MultiPV', this.game.pending ? 1 : this.lines);
      await engine.request('isready', (line) => line === 'readyok');
      if (token !== this.generation) return;
      const side = this.game.turn;
      const seeds = this.data.current[side]?.rows || [];
      this.data.start(side, side, engine.label, this.game.moves.length);
      this.phase = 'searching';
      this.publish();
      const task = (
        this.game.pending
          ? this.searchDuck(engine, token, seeds)
          : engine.analyze(this.game.initialFen, this.game.moves, (line) => {
              if (token !== this.generation) return;
              const info = this.data.update(line, side);
              if (!info) return;
              if (info.evaluation && this.game.moves.length === this.rootPly)
                this.points.set(this.rootPly, info.evaluation);
              if (!this.publishTimer) this.publishTimer = setTimeout(() => this.publish(), 100);
            })
      )
        .then(() => {
          if (token !== this.generation) return;
          this.data.stop(side);
          this.phase = 'complete';
          this.publish();
        })
        .catch((error) => {
          if (token === this.generation) this.failed(error);
        });
      this.searchTask = task;
      void task.finally(() => {
        if (this.searchTask === task) this.searchTask = null;
      });
    } catch (error) {
      if (token === this.generation) this.failed(error);
    }
  }

  async searchDuck(engine, token, seeds) {
    const side = this.game.turn;
    const search = this.data.current[side];
    const candidates = this.game.board.flatMap((piece, to) => {
      if (piece || to === this.game.duck) return [];
      const uci = this.game.pending.notation + '@' + square(to);
      const game = Object.assign(Object.create(DuckGame.prototype), structuredClone(this.game));
      game.placeDuck(to);
      const seed = seeds.find((row) => row.pv?.split(/\s+/)[0] === uci);
      return [
        {
          initialFen: game.initialFen,
          moves: game.moves,
          turn: game.turn,
          result: game.result,
          winner: game.winner,
          uci,
          row: seed || null
        }
      ];
    });
    const compare = (a, b) => compareScores(a.row, b.row, side);
    const update = () => {
      search.rows = [...candidates]
        .filter(({ row }) => row?.score !== undefined)
        .sort(compare)
        .slice(0, this.lines)
        .map(({ row }, i) => ({ ...row, multipv: i + 1 }));
      search.latest = search.rows[0] || {};
      if (!this.publishTimer) this.publishTimer = setTimeout(() => this.publish(), 100);
    };
    update();
    for (let budget = 80; token === this.generation; budget = Math.min(2000, budget * 4)) {
      candidates.sort(compare);
      for (const candidate of candidates) {
        if (token !== this.generation) return;
        if (candidate.result) {
          candidate.row = {
            depth: 1,
            scoreType: candidate.winner ? 'mate' : 'cp',
            score: candidate.winner ? (candidate.winner === 'w' ? 1 : -1) : 0,
            ...(candidate.winner ? { mateWinner: candidate.winner } : {}),
            pv: candidate.uci
          };
        } else {
          const data = new SearchData();
          data.start(side, candidate.turn, engine.label, candidate.moves.length);
          await engine.move(
            candidate.initialFen,
            candidate.moves,
            {
              command: 'movetime ' + budget,
              timeout: budget + 5000
            },
            (line) => {
              if (token !== this.generation) return;
              const info = data.update(line, side);
              if (!info?.row || info.row.multipv !== 1 || info.row.score === undefined) return;
              if (candidate.row && info.row.depth + 1 < candidate.row.depth) return;
              candidate.row = {
                ...info.row,
                depth: info.row.depth + 1,
                ...(info.row.seldepth !== undefined ? { seldepth: info.row.seldepth + 1 } : {}),
                score:
                  info.row.scoreType === 'mate'
                    ? (info.row.mateWinner === 'w' ? 1 : -1) *
                      (Math.abs(info.row.score) + (info.row.mateWinner === side ? 1 : 0))
                    : info.row.score,
                pv: candidate.uci + (info.row.pv ? ' ' + info.row.pv : '')
              };
              update();
            }
          );
          if (token !== this.generation) return;
        }
        update();
      }
      if (candidates.every(({ result }) => result)) return;
    }
  }

  failed(error) {
    this.engine?.close();
    this.engine = null;
    this.data.stop('w');
    this.data.stop('b');
    this.phase = 'error';
    this.error = error.message;
    this.publish();
  }

  close() {
    this.generation++;
    this.revision++;
    clearTimeout(this.startTimer);
    clearTimeout(this.publishTimer);
    this.engine?.close();
    this.engine = null;
    this.searchTask = null;
    this.enabled = false;
    this.phase = 'idle';
    this.data.stop('w');
    this.data.stop('b');
    this.publish();
  }
}

module.exports = { Analysis };

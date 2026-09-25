const files = 'abcdefgh';
const square = (i) => files[i % 8] + (Math.floor(i / 8) + 1);
const index = (s) => (/^[a-h][1-8]$/.test(s) ? files.indexOf(s[0]) + (Number(s[1]) - 1) * 8 : -1);
const color = (p) => (!p ? null : p === p.toUpperCase() ? 'w' : 'b');
const sideName = (s) => (s === 'w' ? 'White' : 'Black');
const opposite = (s) => (s === 'w' ? 'b' : 'w');

function backrank(number) {
  if (!Number.isInteger(number) || number < 0 || number > 959)
    throw new Error('Position number must be an integer from 0 to 959.');
  const row = Array(8).fill(null);
  let n = number;
  row[(n % 4) * 2 + 1] = 'B';
  n = Math.floor(n / 4);
  row[(n % 4) * 2] = 'B';
  n = Math.floor(n / 4);
  const empty = () => row.flatMap((p, i) => (p ? [] : [i]));
  row[empty()[n % 6]] = 'Q';
  n = Math.floor(n / 6);
  const pairs = [
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 4],
    [1, 2],
    [1, 3],
    [1, 4],
    [2, 3],
    [2, 4],
    [3, 4]
  ];
  const free = empty();
  for (const i of pairs[n]) row[free[i]] = 'N';
  empty().forEach((i, j) => {
    row[i] = 'RKR'[j];
  });
  return row;
}

class DuckGame {
  constructor(config = {}) {
    this.variant = config.variant || 'duck';
    if (!['duck', 'duck960', 'duckdfrc'].includes(this.variant))
      throw new Error('Choose a supported duck variant.');
    this.position = config.position ?? 518;
    this.blackPosition = config.blackPosition ?? this.position;
    const white = backrank(this.variant === 'duck' ? 518 : this.position);
    const black = backrank(
      this.variant === 'duck'
        ? 518
        : this.variant === 'duckdfrc'
          ? this.blackPosition
          : this.position
    );
    this.board = [
      ...white,
      ...'PPPPPPPP',
      ...Array(32).fill(null),
      ...'pppppppp',
      ...black.map((p) => p.toLowerCase())
    ];
    this.turn = 'w';
    this.duck = -1;
    this.rights = {
      w: white.flatMap((p, i) => (p === 'R' ? [i] : [])),
      b: black.flatMap((p, i) => (p === 'R' ? [i + 56] : []))
    };
    this.ep = -1;
    this.halfmove = 0;
    this.fullmove = 1;
    this.moves = [];
    this.records = [];
    this.pending = null;
    this.result = null;
    this.winner = null;
    if (config.fen?.trim()) this.loadFen(config.fen.trim());
    this.initialFen = this.fen();
    this.repetitions = new Map([[this.key(), 1]]);
    this.adjudicate();
    this.frames = [this.frame()];
  }

  loadFen(fen) {
    const parts = fen.split(/\s+/);
    if (parts.length !== 6)
      throw new Error(
        'FEN needs six fields: board, turn, castling, en passant, halfmove and move number.'
      );
    const [placement, turn, castling, ep, halfmove, fullmove] = parts;
    const rows = placement.split('/');
    if (rows.length !== 8) throw new Error('FEN must contain eight ranks.');
    this.board = Array(64).fill(null);
    this.duck = -1;
    rows.forEach((row, r) => {
      let file = 0;
      for (const p of row) {
        if (/[1-8]/.test(p)) file += Number(p);
        else {
          if (file >= 8 || !/[prnbqkPRNBQK*]/.test(p))
            throw new Error('Invalid piece in FEN. Use * for the duck.');
          const at = (7 - r) * 8 + file++;
          if (p === '*') {
            if (this.duck !== -1) throw new Error('A position can contain only one duck.');
            this.duck = at;
          } else this.board[at] = p;
        }
      }
      if (file !== 8) throw new Error('Each FEN rank must contain eight squares.');
    });
    for (const p of ['K', 'k'])
      if (this.board.filter((piece) => piece === p).length !== 1)
        throw new Error('The starting position must contain one king of each color.');
    if (this.board.some((p, i) => p?.toLowerCase() === 'p' && (i < 8 || i > 55)))
      throw new Error('Pawns cannot start on the first or eighth rank.');
    if (!['w', 'b'].includes(turn)) throw new Error('FEN turn must be w or b.');
    this.turn = turn;
    this.rights = { w: [], b: [] };
    if (castling !== '-') {
      if (!/^[KQABCDEFGHkqabcdefgh]{1,4}$/.test(castling))
        throw new Error('Invalid FEN castling rights.');
      for (const c of castling) {
        const side = color(c),
          king = this.board.indexOf(side === 'w' ? 'K' : 'k'),
          base = side === 'w' ? 0 : 56;
        const rooks = this.board.flatMap((p, i) =>
          p === (side === 'w' ? 'R' : 'r') && i >= base && i < base + 8 ? [i] : []
        );
        const lower = c.toLowerCase();
        const rook =
          lower === 'k'
            ? rooks.filter((i) => i > king).at(-1)
            : lower === 'q'
              ? rooks.find((i) => i < king)
              : base + files.indexOf(lower);
        if (
          king < base ||
          king >= base + 8 ||
          !rooks.includes(rook) ||
          this.rights[side].some((i) => i > king === rook > king)
        )
          throw new Error(
            'Castling rights must identify an eligible rook on each side of the king.'
          );
        if (this.variant === 'duck' && (king !== base + 4 || ![base, base + 7].includes(rook)))
          throw new Error('This castling arrangement needs Duck960.');
        this.rights[side].push(rook);
      }
    }
    this.ep = ep === '-' ? -1 : index(ep);
    if (
      ep !== '-' &&
      (this.ep < 0 ||
        Math.floor(this.ep / 8) !== (turn === 'w' ? 5 : 2) ||
        this.board[this.ep] ||
        this.board[this.ep + (turn === 'w' ? -8 : 8)] !== (turn === 'w' ? 'p' : 'P'))
    )
      throw new Error('Invalid en passant square.');
    if (
      !/^\d+$/.test(halfmove) ||
      Number(halfmove) > 100 ||
      !/^[1-9]\d*$/.test(fullmove) ||
      Number(fullmove) > 65535
    )
      throw new Error('FEN counters must be integers (halfmove 0–100, move number 1–65535).');
    this.halfmove = Number(halfmove);
    this.fullmove = Number(fullmove);
  }

  fen() {
    const rows = [];
    for (let rank = 7; rank >= 0; rank--) {
      let row = '',
        empty = 0;
      for (let file = 0; file < 8; file++) {
        const at = rank * 8 + file,
          p = this.board[at] || (at === this.duck ? '*' : null);
        if (!p) empty++;
        else {
          if (empty) row += empty;
          empty = 0;
          row += p;
        }
      }
      if (empty) row += empty;
      rows.push(row);
    }
    let rights = '';
    for (const side of ['w', 'b']) {
      const king = this.board.indexOf(side === 'w' ? 'K' : 'k');
      for (const rook of [...this.rights[side]].sort((a, b) => b - a)) {
        const c = this.variant === 'duck' ? (rook > king ? 'k' : 'q') : files[rook % 8];
        rights += side === 'w' ? c.toUpperCase() : c;
      }
    }
    return `${rows.join('/')} ${this.turn} ${rights || '-'} ${this.ep < 0 ? '-' : square(this.ep)} ${this.halfmove} ${this.fullmove}`;
  }

  key() {
    const ep = this.ep >= 0 && this.legalMoves().some((m) => m.ep) ? this.ep : -1;
    return JSON.stringify([
      this.board,
      this.turn,
      this.duck,
      [...this.rights.w].sort(),
      [...this.rights.b].sort(),
      ep
    ]);
  }

  legalMoves(from) {
    if (this.result || this.pending) return [];
    const moves = [];
    const occupied = (i) => i === this.duck || this.board[i];
    for (let a = 0; a < 64; a++) {
      const p = this.board[a];
      if (color(p) !== this.turn || (from !== undefined && a !== from)) continue;
      const x = a % 8,
        y = Math.floor(a / 8),
        kind = p.toLowerCase();
      const add = (b, extra = {}) => {
        if (b === this.duck || color(this.board[b]) === this.turn) return;
        if (kind === 'p' && (b < 8 || b >= 56))
          for (const promotion of 'qrbn') moves.push({ from: a, to: b, promotion, ...extra });
        else moves.push({ from: a, to: b, ...extra });
      };
      if (kind === 'p') {
        const dy = this.turn === 'w' ? 1 : -1,
          next = a + dy * 8;
        if (next >= 0 && next < 64 && !occupied(next)) {
          add(next);
          if (y === (this.turn === 'w' ? 1 : 6) && !occupied(a + dy * 16)) add(a + dy * 16);
        }
        for (const dx of [-1, 1]) {
          const b = next + dx;
          if (x + dx < 0 || x + dx > 7 || b < 0 || b > 63 || b === this.duck) continue;
          if (this.board[b] && color(this.board[b]) !== this.turn) add(b);
          else if (b === this.ep && this.board[b - dy * 8] === (this.turn === 'w' ? 'p' : 'P'))
            add(b, { ep: true });
        }
        continue;
      }
      const diagonals = [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1]
      ];
      const straight = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ];
      const directions =
        kind === 'n'
          ? [
              [1, 2],
              [2, 1],
              [-1, 2],
              [-2, 1],
              [1, -2],
              [2, -1],
              [-1, -2],
              [-2, -1]
            ]
          : kind === 'b'
            ? diagonals
            : kind === 'r'
              ? straight
              : [...diagonals, ...straight];
      for (const [dx, dy] of directions) {
        for (let step = 1; step <= (kind === 'n' || kind === 'k' ? 1 : 7); step++) {
          const xx = x + dx * step,
            yy = y + dy * step;
          if (xx < 0 || xx > 7 || yy < 0 || yy > 7) break;
          const b = yy * 8 + xx;
          add(b);
          if (occupied(b)) break;
        }
      }
      if (kind === 'k') {
        const base = this.turn === 'w' ? 0 : 56;
        for (const rook of this.rights[this.turn]) {
          const short = rook > a,
            kingTo = base + (short ? 6 : 2),
            rookTo = base + (short ? 5 : 3);
          const path = (start, end) =>
            Array.from({ length: Math.abs(end - start) + 1 }, (_, i) => Math.min(start, end) + i);
          if (
            this.board[rook] === (this.turn === 'w' ? 'R' : 'r') &&
            [...path(a, kingTo), ...path(rook, rookTo)].every(
              (i) => i === a || i === rook || !occupied(i)
            )
          ) {
            moves.push({
              from: a,
              to: this.variant === 'duck' ? kingTo : rook,
              castle: { rook, rookTo, kingTo, short }
            });
          }
        }
      }
    }
    return moves;
  }

  piece(from, to, promotion) {
    const legal = this.legalMoves();
    const move = legal.find((m) => m.from === from && m.to === to && m.promotion === promotion);
    if (!move) throw new Error('That piece cannot move to this square.');
    const p = this.board[from],
      captured = move.castle ? null : this.board[to];
    const before = this.frame();
    let san;
    if (move.castle) san = move.castle.short ? 'O-O' : 'O-O-O';
    else {
      const others = legal.filter(
        (m) => m.from !== from && m.to === to && this.board[m.from] === p
      );
      const disambiguation = !others.length
        ? ''
        : others.every((m) => m.from % 8 !== from % 8)
          ? files[from % 8]
          : others.every((m) => Math.floor(m.from / 8) !== Math.floor(from / 8))
            ? String(Math.floor(from / 8) + 1)
            : square(from);
      san =
        (p.toLowerCase() === 'p'
          ? captured || move.ep
            ? files[from % 8]
            : ''
          : p.toUpperCase() + disambiguation) +
        (captured || move.ep ? 'x' : '') +
        square(to) +
        (promotion ? '=' + promotion.toUpperCase() : '');
    }
    this.board[from] = null;
    if (move.castle) {
      this.board[move.castle.rook] = null;
      this.board[move.castle.kingTo] = p;
      this.board[move.castle.rookTo] = this.turn === 'w' ? 'R' : 'r';
    } else
      this.board[to] = promotion ? (this.turn === 'w' ? promotion.toUpperCase() : promotion) : p;
    if (move.ep) this.board[to + (this.turn === 'w' ? -8 : 8)] = null;
    for (const side of ['w', 'b'])
      this.rights[side] = this.rights[side].filter((i) => i !== from && i !== to);
    if (p.toLowerCase() === 'k') this.rights[this.turn] = [];
    this.ep = p.toLowerCase() === 'p' && Math.abs(to - from) === 16 ? (from + to) / 2 : -1;
    this.halfmove = p.toLowerCase() === 'p' || captured || move.ep ? 0 : this.halfmove + 1;
    this.pending = {
      notation: square(from) + square(to) + (promotion || ''),
      san,
      from,
      to: move.castle?.kingTo ?? to,
      before,
      castle: move.castle || null
    };
    if (captured?.toLowerCase() === 'k') {
      this.result = `${sideName(this.turn)} wins by king capture`;
      this.winner = this.turn;
      this.complete(null);
    }
  }

  cancelPiece() {
    if (!this.pending) throw new Error('No piece move to undo.');
    Object.assign(this, structuredClone(this.pending.before));
    this.pending = null;
  }

  placeDuck(to) {
    if (
      !this.pending ||
      !Number.isInteger(to) ||
      to < 0 ||
      to > 63 ||
      this.board[to] ||
      to === this.duck
    )
      throw new Error('Place the duck on a different empty square.');
    this.complete(to);
  }

  complete(duck) {
    const pending = this.pending;
    const uci = pending.notation + (duck === null ? '' : '@' + square(duck));
    this.moves.push(uci);
    this.records.push({
      uci,
      san: pending.san,
      duck: duck === null ? null : square(duck),
      from: pending.from,
      to: pending.to,
      side: this.turn,
      number: this.fullmove,
      castle: pending.castle
    });
    if (duck !== null) this.duck = duck;
    if (this.turn === 'b') this.fullmove++;
    this.turn = opposite(this.turn);
    this.pending = null;
    if (!this.result) {
      const key = this.key();
      this.repetitions.set(key, (this.repetitions.get(key) || 0) + 1);
      this.adjudicate();
    }
    this.frames.push(this.frame());
  }

  adjudicate() {
    if (!this.legalMoves().length) {
      this.result = `${sideName(this.turn)} wins by fowling`;
      this.winner = this.turn;
    } else if ((this.repetitions.get(this.key()) || 0) >= 3)
      this.result = 'Draw by threefold repetition';
    else if (this.halfmove >= 100) this.result = 'Draw by the 50-move rule';
  }

  playUci(text) {
    const match =
      /^([a-h][1-8])([a-h][1-8])([qrbn])?(?:@([a-h][1-8])|,([a-h][1-8])([a-h][1-8]))?$/.exec(text);
    if (!match || (match[5] && match[5] !== match[2]))
      throw new Error(`Invalid duck move from engine: ${text}`);
    const copy = Object.assign(Object.create(DuckGame.prototype), structuredClone(this));
    copy.piece(index(match[1]), index(match[2]), match[3]);
    const duck = match[4] || match[6];
    if (!copy.result) {
      if (!duck) throw new Error('The engine did not include a duck placement.');
      copy.placeDuck(index(duck));
    } else if (duck) {
      const to = index(duck);
      if (copy.board[to] || to === copy.duck)
        throw new Error('Invalid duck square after king capture.');
      copy.duck = to;
      copy.moves[copy.moves.length - 1] += '@' + duck;
      Object.assign(copy.records.at(-1), { uci: copy.moves.at(-1), duck });
      copy.frames[copy.frames.length - 1] = copy.frame();
    }
    Object.assign(this, copy);
  }

  frame() {
    return structuredClone({
      board: this.board,
      turn: this.turn,
      duck: this.duck,
      rights: this.rights,
      ep: this.ep,
      halfmove: this.halfmove,
      fullmove: this.fullmove,
      result: this.result,
      winner: this.winner
    });
  }

  at(ply) {
    if (!Number.isInteger(ply) || ply < 0 || ply > this.moves.length)
      throw new Error('Invalid move number.');
    const copy = Object.assign(
      Object.create(DuckGame.prototype),
      this,
      structuredClone(this.frames[ply]),
      { pending: null }
    );
    return { ...copy.frame(), fen: copy.fen() };
  }

  rewind(ply) {
    const copy = new DuckGame({
      variant: this.variant,
      position: this.position,
      blackPosition: this.blackPosition,
      fen: this.initialFen
    });
    for (const move of this.moves.slice(0, ply)) copy.playUci(move);
    Object.assign(this, copy);
  }

  snapshot() {
    return {
      ...this.frame(),
      fen: this.pending ? this.at(this.moves.length).fen : this.fen(),
      initialFen: this.initialFen,
      variant: this.variant,
      position: this.position,
      blackPosition: this.blackPosition,
      pending: this.pending
        ? { notation: this.pending.notation, from: this.pending.from, to: this.pending.to }
        : null,
      moves: [...this.moves],
      records: structuredClone(this.records),
      legal: this.legalMoves()
    };
  }
}

export { DuckGame, square, index, color, sideName, opposite, backrank };

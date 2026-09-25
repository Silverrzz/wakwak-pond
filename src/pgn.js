import { DuckGame, index, square, sideName } from './rules.js';
import { GameClock, normalizeControl } from './clock.js';
import { SearchData } from './search-data.js';

const results = new Set(['*', '1-0', '0-1', '1/2-1/2']);
const safe = (value) =>
  String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[\r\n]/g, ' ');
const resultOf = (game) =>
  !game.result ? '*' : game.winner === 'w' ? '1-0' : game.winner === 'b' ? '0-1' : '1/2-1/2';

function clockText(milliseconds) {
  const total = Math.max(0, Math.round(milliseconds));
  return `${Math.floor(total / 3600000)}:${String(Math.floor(total / 60000) % 60).padStart(2, '0')}:${String(Math.floor(total / 1000) % 60).padStart(2, '0')}.${String(total % 1000).padStart(3, '0')}`;
}

function timeControl(control) {
  if (control.mode === 'unlimited') return '-';
  if (control.mode === 'movetime') return '*' + control.milliseconds / 1000;
  return control.stages
    .map(
      (stage) =>
        (stage.moves ? stage.moves + '/' : '') +
        stage.time / 1000 +
        (stage.kind === 'increment' && stage.bonus ? '+' + stage.bonus / 1000 : '')
    )
    .join(':');
}

function parseControl(text) {
  if (!text || text === '-' || text === '?') return normalizeControl({ mode: 'unlimited' });
  if (/^\*\d+(?:\.\d+)?$/.test(text))
    return normalizeControl({
      mode: 'movetime',
      milliseconds: Math.round(Number(text.slice(1)) * 1000)
    });
  const stages = text.split(':').map((part) => {
    const match = /^(?:(\d+)\/)?(\d+(?:\.\d+)?)(?:\+(\d+(?:\.\d+)?))?$/.exec(part);
    if (!match) throw new Error(`Unsupported PGN time control: ${text}`);
    return {
      moves: Number(match[1] || 0),
      time: Math.round(Number(match[2]) * 1000),
      bonus: Math.round(Number(match[3] || 0) * 1000),
      kind: 'increment'
    };
  });
  if (stages.at(-1).moves) stages.push({ ...stages.at(-1), moves: 0 });
  return normalizeControl({ mode: 'clock', stages });
}

function readControl(headers, label, standard) {
  const control = parseControl(standard);
  const bonuses = headers['Pond' + label + 'Bonus'];
  if (bonuses !== undefined) {
    const values = bonuses.split(',');
    if (control.mode !== 'clock' || values.length !== control.stages.length)
      throw new Error('The PGN time control is invalid.');
    control.stages.forEach((stage, i) => {
      const match = /^(increment|delay|bronstein):(\d+(?:\.\d+)?)$/.exec(values[i]);
      if (!match) throw new Error('The PGN clock bonus is invalid.');
      stage.kind = match[1];
      stage.bonus = Math.round(Number(match[2]) * 1000);
    });
  }
  const engineTime = headers['Pond' + label + 'EngineTime'];
  if (engineTime !== undefined && control.mode === 'unlimited')
    control.engineTime = Math.round(Number(engineTime) * 1000);
  return normalizeControl(control);
}

function readAnalysis(document, game, config) {
  const data = new SearchData();
  const positions = [document.initial, ...document.entries.map((entry) => entry.annotations)];
  for (let ply = 0; ply < positions.length; ply++) {
    let channel;
    for (const annotation of positions[ply]) {
      for (const match of (annotation.text || '').matchAll(
        /\[%(pondsearch|pondinfo|eval)\s+([^\]]*)\]/g
      )) {
        if (match[1] === 'pondsearch') {
          const search = /^([wb]) (\S+)$/.exec(match[2]);
          if (!search) throw new Error('The PGN engine annotation is invalid.');
          channel = search[1];
          const source = decodeURIComponent(search[2]);
          if (source.length > 256) throw new Error('The PGN engine name is too long.');
          data.start(channel, channel, source, ply);
        } else if (match[1] === 'pondinfo') {
          if (channel) data.update('info ' + match[2], channel);
        } else {
          const score = /^(#[+-]?\d+|[+-]?\d+(?:\.\d+)?)(?:,\s*(\d+))?\s*$/.exec(match[2]);
          if (!score) continue;
          const mate = score[1].startsWith('#');
          const value = mate ? Number(score[1].slice(1)) : Math.round(Number(score[1]) * 100);
          const depth = Number(score[2] || 0);
          if (!Number.isSafeInteger(value) || !Number.isSafeInteger(depth)) continue;
          const side = game.frames[ply].turn;
          const current = data.current[side];
          const previous = data.points.get(side + ':' + ply);
          data.points.set(side + ':' + ply, {
            channel: side,
            side,
            source: current?.ply === ply ? current.source : config.playerNames[side],
            ply,
            depth,
            score: value,
            scoreType: mate ? 'mate' : 'cp',
            bound: previous?.score === value && previous.depth === depth ? previous.bound : null,
            ...(mate ? { mateWinner: score[1].includes('-') ? 'b' : 'w' } : {})
          });
        }
      }
    }
    data.stop('w');
    data.stop('b');
  }
  return data;
}

function analysisAnnotations(session) {
  const positions = new Map();
  const add = (ply, text) => {
    if (ply > session.game.moves.length) return;
    if (!positions.has(ply)) positions.set(ply, []);
    positions.get(ply).push('{' + text + '}');
  };
  const data = session.searchData.export();
  for (const search of data.searches) {
    add(
      search.ply,
      '[%pondsearch ' + search.channel + ' ' + encodeURIComponent(search.source || 'Engine') + ']'
    );
    for (const row of [...search.rows, search.latest]) {
      const fields = [];
      for (const key of [
        'depth',
        'seldepth',
        'multipv',
        'time',
        'nodes',
        'nps',
        'hashfull',
        'tbhits'
      ])
        if (row[key] !== undefined) fields.push(key, row[key]);
      if (row.score !== undefined) {
        fields.push('score', row.scoreType, row.score * (search.side === 'w' ? 1 : -1));
        if (row.bound)
          fields.push(
            search.side === 'w'
              ? row.bound
              : row.bound === 'lowerbound'
                ? 'upperbound'
                : 'lowerbound'
          );
      }
      if (row.currmove) fields.push('currmove', row.currmove);
      if (row.pv) fields.push('pv', row.pv);
      if (fields.length)
        add(search.ply, '[%pondinfo ' + fields.join(' ').replace(/[\[\]{}\r\n]/g, ' ') + ']');
    }
  }
  for (const point of data.evaluations) {
    const score =
      point.scoreType === 'mate'
        ? '#' + (point.mateWinner === 'b' ? '-' : '') + Math.abs(point.score)
        : (point.score / 100).toFixed(2);
    add(point.ply, '[%eval ' + score + (point.depth === undefined ? '' : ',' + point.depth) + ']');
  }
  return positions;
}

function readDocument(input) {
  if (typeof input !== 'string' || input.length > 20000000)
    throw new Error('Choose a PGN game smaller than 20 MB.');
  const text = input.replace(/^\uFEFF/, '');
  const headers = Object.create(null);
  const entries = [];
  const initial = [];
  let result;
  let offset = 0;
  let depth = 0;
  let variationStart = 0;
  const annotations = () => entries.at(-1)?.annotations || initial;
  while (offset < text.length) {
    const char = text[offset];
    if (/\s/.test(char)) {
      offset++;
      continue;
    }
    if (char === ';' || (char === '%' && (offset === 0 || /[\r\n]/.test(text[offset - 1])))) {
      const end = text.indexOf('\n', offset);
      if (!depth && char === ';')
        annotations().push({ text: text.slice(offset + 1, end < 0 ? undefined : end).trim() });
      offset = end < 0 ? text.length : end + 1;
      continue;
    }
    if (char === '{') {
      const end = text.indexOf('}', offset + 1);
      if (end < 0) throw new Error('The PGN has an unfinished comment.');
      if (!depth) annotations().push({ text: text.slice(offset + 1, end).trim() });
      offset = end + 1;
      continue;
    }
    if (char === '(') {
      if (!depth) variationStart = offset;
      depth++;
      offset++;
      continue;
    }
    if (char === ')') {
      if (!depth) throw new Error('The PGN has an unmatched variation ending.');
      if (!--depth) annotations().push({ variation: text.slice(variationStart, offset + 1) });
      offset++;
      continue;
    }
    if (char === '[') {
      const match = /^\[\s*([A-Za-z0-9_]+)\s+"((?:[^"\\]|\\.)*)"\s*\]/.exec(text.slice(offset));
      if (!match) throw new Error('The PGN contains an invalid header.');
      if (!depth) {
        if (entries.length || result !== undefined)
          throw new Error('Open a PGN containing a single game.');
        if (Object.hasOwn(headers, match[1])) throw new Error(`Duplicate PGN header: ${match[1]}`);
        Object.defineProperty(headers, match[1], {
          value: match[2].replace(/\\(["\\])/g, '$1'),
          enumerable: true,
          writable: true,
          configurable: true
        });
      }
      offset += match[0].length;
      continue;
    }
    if (char === '$') {
      const nag = /^\$\d+/.exec(text.slice(offset));
      if (!nag) throw new Error('The PGN has an invalid annotation number.');
      if (!depth) annotations().push({ nag: nag[0] });
      offset += nag[0].length;
      continue;
    }
    const match = /^[^\s{}()[\];$]+/.exec(text.slice(offset));
    if (!match) throw new Error(`Unexpected PGN character: ${char}`);
    offset += match[0].length;
    if (depth) continue;
    const token = match[0].replace(/^\d+\.+/, '');
    if (!token || /^\.+$/.test(token) || /^e\.?p\.?$/i.test(token)) continue;
    if (/^\$\d+$/.test(token) || /^[!?]+$/.test(token)) {
      annotations().push({ nag: token });
      continue;
    }
    if (results.has(token)) {
      if (result !== undefined) throw new Error('Open a PGN containing a single game.');
      result = token;
      continue;
    }
    if (result !== undefined)
      throw new Error('The PGN contains moves after its result or more than one game.');
    if (entries.length >= 10000) throw new Error('The PGN contains too many moves.');
    const suffix = /[!?]+$/.exec(token)?.[0];
    entries.push({
      move: token.replace(/[!?]+$/, ''),
      annotations: suffix ? [{ nag: suffix }] : []
    });
  }
  if (depth) throw new Error('The PGN has an unfinished variation.');
  if (!Object.keys(headers).length && !entries.length && result === undefined)
    throw new Error('This is not a PGN game.');
  if (headers.Result && !results.has(headers.Result)) throw new Error('The PGN result is invalid.');
  if (headers.Result && result !== undefined && headers.Result !== result)
    throw new Error('The PGN header and movetext results disagree.');
  return { headers, entries, initial, result: result ?? headers.Result ?? '*' };
}

function playSan(game, notation) {
  const normalized = notation.replace(/[+#?!]/g, '');
  const match = /^(.*?)(?:[@,]([a-h][1-8]))?$/.exec(normalized);
  const san = match[1].replace(/0/g, 'O');
  const duck = match[2];
  let candidates = game.legalMoves();
  if (/^O-O(?:-O)?$/.test(san))
    candidates = candidates.filter((move) => move.castle && move.castle.short === (san === 'O-O'));
  else {
    const coordinate = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(san);
    const algebraic = /^([KQRBN])?([a-h])?([1-8])?(x)?([a-h][1-8])(?:=?([QRBN]))?$/.exec(san);
    if (coordinate)
      candidates = candidates.filter(
        (move) =>
          move.from === index(coordinate[1]) &&
          move.to === index(coordinate[2]) &&
          move.promotion === coordinate[3]
      );
    else if (algebraic)
      candidates = candidates.filter(
        (move) =>
          !move.castle &&
          game.board[move.from].toUpperCase() === (algebraic[1] || 'P') &&
          (!algebraic[2] || square(move.from)[0] === algebraic[2]) &&
          (!algebraic[3] || square(move.from)[1] === algebraic[3]) &&
          move.to === index(algebraic[5]) &&
          move.promotion === algebraic[6]?.toLowerCase() &&
          !!(game.board[move.to] || move.ep) === !!algebraic[4]
      );
    else candidates = [];
  }
  if (candidates.length !== 1) throw new Error(`Invalid or ambiguous PGN move: ${notation}`);
  const move = candidates[0];
  game.playUci(
    square(move.from) + square(move.to) + (move.promotion || '') + (duck ? '@' + duck : '')
  );
}

function clockAnnotation(annotations) {
  for (const annotation of annotations) {
    const match = /\[%clk\s+(\d+):([0-5]\d):([0-5]\d(?:\.\d+)?)\s*\]/.exec(annotation.text || '');
    if (match) {
      const remaining = Math.round(
        (Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000
      );
      if (!Number.isSafeInteger(remaining) || remaining > 1e12)
        throw new Error('The PGN clock value is invalid.');
      return remaining;
    }
  }
  return undefined;
}

function parsePgn(text) {
  const document = readDocument(text);
  const { headers, entries } = document;
  const name = (headers.Variant || 'Duck').toLowerCase().replace(/[\s_-]/g, '');
  const variants = {
    duck: 'duck',
    duckchess: 'duck',
    duck960: 'duck960',
    duckchess960: 'duck960',
    duckdfrc: 'duckdfrc',
    duckdoublefischerrandom: 'duckdfrc'
  };
  const variant = Object.hasOwn(variants, name) ? variants[name] : null;
  if (!variant)
    throw new Error(`Unsupported PGN variant: ${headers.Variant}. Choose a Duck chess game.`);
  if (headers.SetUp === '1' && !headers.FEN) throw new Error('The PGN setup is missing its FEN.');
  const controls = {
    w: readControl(headers, 'White', headers.TimeControl),
    b: readControl(headers, 'Black', headers.BlackTimeControl || headers.TimeControl)
  };
  const clock = new GameClock(controls);
  const config = {
    variant,
    fen: headers.FEN?.replace('[]', ''),
    position: headers.PondPosition === undefined ? 518 : Number(headers.PondPosition),
    blackPosition:
      headers.PondBlackPosition === undefined
        ? Number(headers.PondPosition ?? 518)
        : Number(headers.PondBlackPosition),
    customPosition:
      headers.PondCustomPosition === undefined ? !!headers.FEN : headers.PondCustomPosition === '1',
    w: headers.PondWhiteEngine || 'human',
    b: headers.PondBlackEngine || 'human',
    controls: clock.controls,
    playerNames: { w: headers.White || 'White', b: headers.Black || 'Black' },
    startedAt:
      headers.PondStartedAt ||
      (/^\d{4}\.\d{2}\.\d{2}$/.test(headers.Date || '')
        ? headers.Date.replace(/\./g, '-') + 'T00:00:00.000Z'
        : new Date().toISOString())
  };
  const game = new DuckGame(config);
  const clockFrames = [clock.save()];
  for (let i = 0; i < entries.length; i++) {
    const side = game.turn;
    try {
      playSan(game, entries[i].move);
    } catch (error) {
      throw new Error(`PGN move ${i + 1} (${entries[i].move}): ${error.message}`);
    }
    clock.complete(side);
    const remaining = clockAnnotation(entries[i].annotations);
    if (remaining !== undefined && clock.sides[side].remaining !== null)
      clock.sides[side].remaining = remaining;
    clockFrames.push(clock.save());
  }
  const automatic = resultOf(game);
  if (game.result && document.result !== '*' && document.result !== automatic)
    throw new Error('The PGN result conflicts with the final position.');
  const winner =
    document.result === '*'
      ? game.winner
      : document.result === '1-0'
        ? 'w'
        : document.result === '0-1'
          ? 'b'
          : null;
  const result =
    document.result === '*'
      ? game.result
      : headers.Termination || game.result || (winner ? `${sideName(winner)} wins` : 'Draw');
  if (headers.PondPending) {
    const pending = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(headers.PondPending);
    if (!pending || result) throw new Error('The PGN has an invalid incomplete turn.');
    game.piece(index(pending[1]), index(pending[2]), pending[3]);
    if (!game.pending) throw new Error('The PGN has an invalid incomplete turn.');
  }
  const restoredClock = clock.save();
  for (const [side, label] of [
    ['w', 'White'],
    ['b', 'Black']
  ]) {
    const tag = headers['Pond' + label + 'Clock'];
    if (tag !== undefined) {
      const match = /^(\d+(?:\.\d+)?|-) (\d+) (\d+)$/.exec(tag);
      if (!match) throw new Error('The PGN has an invalid saved clock.');
      restoredClock.sides[side] = {
        remaining: match[1] === '-' ? null : Number(match[1]),
        stage: Number(match[2]),
        moves: Number(match[3])
      };
    }
    const saved = restoredClock.sides[side];
    const control = clock.controls[side];
    if (
      (control.mode === 'unlimited'
        ? saved.remaining !== null
        : !Number.isFinite(saved.remaining) || saved.remaining < 0 || saved.remaining > 1e12) ||
      !Number.isInteger(saved.stage) ||
      saved.stage < 0 ||
      saved.stage >= (control.stages?.length || 1) ||
      !Number.isInteger(saved.moves) ||
      saved.moves < 0 ||
      saved.moves > 10000
    )
      throw new Error('The PGN has an invalid saved clock.');
  }
  if (headers.PondClockTurn !== undefined)
    restoredClock.active = headers.PondClockTurn === '-' ? null : headers.PondClockTurn;
  if (headers.PondClockSpent !== undefined) restoredClock.spent = Number(headers.PondClockSpent);
  if (
    ![null, 'w', 'b'].includes(restoredClock.active) ||
    (restoredClock.active && restoredClock.active !== game.turn) ||
    !Number.isFinite(restoredClock.spent) ||
    restoredClock.spent < 0 ||
    restoredClock.spent > 1e12
  )
    throw new Error('The PGN has an invalid saved clock.');
  clock.restore(restoredClock);
  if (result) {
    game.result = result;
    game.winner = winner;
  }
  const searchData = readAnalysis(document, game, config);
  const pgn = { headers, initial: document.initial, entries, moves: [...game.moves] };
  return { game, clock, clockFrames, config, searchData, pgn };
}

function formatPgn(session, playerName) {
  const game = session.game;
  const savedClock = session.clock.save();
  const stored = session.pgn;
  const tags = {
    Event: stored?.headers.Event || 'Local game',
    Site: stored?.headers.Site || 'The Pond',
    Date: (session.config.startedAt || new Date().toISOString()).slice(0, 10).replace(/-/g, '.'),
    Round: stored?.headers.Round || '-',
    White: playerName('w'),
    Black: playerName('b'),
    Result: resultOf(game),
    ...stored?.headers
  };
  for (const key of Object.keys(tags)) if (key.startsWith('Pond')) delete tags[key];
  Object.assign(tags, {
    White: playerName('w'),
    Black: playerName('b'),
    Result: resultOf(game),
    Variant:
      game.variant === 'duck'
        ? 'Duck'
        : game.variant === 'duck960'
          ? 'Duck960'
          : 'Duck Double Fischer Random',
    SetUp: '1',
    FEN: game.initialFen,
    TimeControl: timeControl(session.clock.controls.w),
    PondPosition: game.position,
    PondBlackPosition: game.blackPosition,
    PondCustomPosition: (session.config.customPosition ?? !!session.config.fen) ? '1' : '0',
    BlackTimeControl: timeControl(session.clock.controls.b),
    PondWhiteEngine: session.config.w,
    PondBlackEngine: session.config.b,
    PondStartedAt: session.config.startedAt || new Date().toISOString(),
    PondClockTurn: savedClock.active || '-',
    PondClockSpent: savedClock.spent
  });
  if (game.result) tags.Termination = game.result;
  else delete tags.Termination;
  if (game.pending) tags.PondPending = game.pending.notation;
  for (const [side, label] of [
    ['w', 'White'],
    ['b', 'Black']
  ]) {
    const control = session.clock.controls[side];
    const clock = savedClock.sides[side];
    tags['Pond' + label + 'Clock'] = [clock.remaining ?? '-', clock.stage, clock.moves].join(' ');
    if (control.mode === 'clock')
      tags['Pond' + label + 'Bonus'] = control.stages
        .map((stage) => stage.kind + ':' + stage.bonus / 1000)
        .join(',');
    if (control.mode === 'unlimited')
      tags['Pond' + label + 'EngineTime'] = control.engineTime / 1000;
  }
  const annotations = (list) =>
    (list || []).flatMap((annotation) => {
      if (annotation.variation) return [annotation.variation];
      if (annotation.nag) return [annotation.nag];
      const text = (annotation.text || '')
        .replace(/\[%(?:clk|eval|pondsearch|pondinfo)\s+[^\]]*\]/g, '')
        .trim();
      return text ? ['{' + text.replace(/}/g, '') + '}'] : [];
    });
  const analysis = analysisAnnotations(session);
  const moves = [...annotations(stored?.initial), ...(analysis.get(0) || [])];
  let original = !!stored;
  for (let i = 0; i < game.records.length; i++) {
    const record = game.records[i];
    original = original && stored.moves[i] === game.moves[i];
    moves.push(
      (record.side === 'w' ? record.number + '. ' : i === 0 ? record.number + '... ' : '') +
        record.san +
        (record.duck ? ',' + record.duck : '')
    );
    const remaining = session.clockFrames[i + 1]?.sides[record.side].remaining;
    if (remaining !== null && remaining !== undefined)
      moves.push(`{[%clk ${clockText(remaining)}]}`);
    if (original) moves.push(...annotations(stored.entries[i].annotations));
    moves.push(...(analysis.get(i + 1) || []));
  }
  moves.push(tags.Result);
  const lines = [];
  let line = '';
  for (const token of moves) {
    if (line && line.length + token.length + 1 > 100) {
      lines.push(line);
      line = '';
    }
    line += (line ? ' ' : '') + token;
  }
  if (line) lines.push(line);
  return (
    Object.entries(tags)
      .map(([key, value]) => `[${key} "${safe(value)}"]`)
      .join('\n') +
    '\n\n' +
    lines.join('\n') +
    '\n'
  );
}

export { parsePgn, formatPgn };

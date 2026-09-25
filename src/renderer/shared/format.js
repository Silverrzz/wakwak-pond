const pieces = import.meta.glob('../../pieces/*.svg', {
  eager: true,
  query: '?url',
  import: 'default'
});

export const pieceNames = { p: 'pawn', r: 'rook', n: 'knight', b: 'bishop', q: 'queen', k: 'king' };
export const squareName = (i) => 'abcdefgh'[i % 8] + (Math.floor(i / 8) + 1);
export const sideName = (side) => (side === 'w' ? 'White' : 'Black');
export const pieceSource = (piece, duck = false) =>
  pieces[
    `../../pieces/${duck ? 'duck' : (piece === piece.toUpperCase() ? 'w' : 'b') + piece.toLowerCase()}.svg`
  ];
export const compactNumber = (value) =>
  value === undefined
    ? '-'
    : Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);

export function formatClock(ms) {
  if (ms === null) return '∞';
  ms = Math.max(0, ms);
  if (ms < 10000)
    return (
      '0:' + String(Math.floor(ms / 1000)).padStart(2, '0') + '.' + Math.floor((ms % 1000) / 100)
    );
  const total = Math.ceil(ms / 1000),
    seconds = String(total % 60).padStart(2, '0'),
    minutes = Math.floor(total / 60);
  return minutes >= 60
    ? Math.floor(minutes / 60) + ':' + String(minutes % 60).padStart(2, '0') + ':' + seconds
    : minutes + ':' + seconds;
}

export function timeDescription(control) {
  if (control.mode === 'unlimited') return 'No clock';
  if (control.mode === 'movetime') return control.milliseconds / 1000 + ' sec / turn';
  return control.stages
    .map(
      (stage) =>
        `${stage.moves ? stage.moves + '/' : ''}${stage.time / 60000} min${stage.bonus ? (stage.kind === 'increment' ? ' + ' + stage.bonus / 1000 + ' sec' : ' · ' + stage.bonus / 1000 + ' sec ' + (stage.kind === 'bronstein' ? 'Bronstein' : 'delay')) : ''}`
    )
    .join(' → ');
}

export function formatScore(point) {
  if (point?.score === undefined) return '-';
  const prefix = point.bound === 'lowerbound' ? '≥' : point.bound === 'upperbound' ? '≤' : '';
  if (point.scoreType === 'mate')
    return (
      prefix +
      ((point.mateWinner ? point.mateWinner === 'b' : point.score < 0) ? '-M' : 'M') +
      Math.abs(point.score)
    );
  return prefix + (point.score > 0 ? '+' : '') + (point.score / 100).toFixed(2);
}

export function positionLabel(state, ply) {
  if (!state) return '';
  const first = state.initialFen.split(' ');
  const offset = ply + (first[1] === 'b' ? 1 : 0);
  return Number(first[5]) + Math.floor(offset / 2) + (offset % 2 ? '…' : '.');
}

export function searchTime(time) {
  return time === undefined
    ? '-'
    : time < 60000
      ? (time / 1000).toFixed(2) + 's'
      : Math.floor(time / 60000) + ':' + String(Math.floor(time / 1000) % 60).padStart(2, '0');
}

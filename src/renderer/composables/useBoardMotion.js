import { computed, onUnmounted, ref, watch } from 'vue';

const signature = (position) => position.board.join(',') + ':' + position.duck;
const side = (piece) => piece === piece.toUpperCase();
const distance = (a, b) => Math.hypot((a % 8) - (b % 8), Math.floor(a / 8) - Math.floor(b / 8));

export function useBoardMotion(game) {
  const motions = ref([]);
  let sequence = 0;
  let timer;
  const hiddenSquares = computed(() => new Set(motions.value.map((motion) => motion.to)));

  function clearMotion() {
    clearTimeout(timer);
    motions.value = [];
  }

  const position = computed(() => {
    const frame = game.frame.value;
    const state = game.state.value;
    const boardState = game.boardState.value;
    if (!frame || !state) return null;
    return {
      board: frame.board,
      duck: frame.duck,
      ply: game.boardPly.value,
      pending:
        game.analysis.value.enabled || game.reviewPly.value === null ? boardState.pending : null,
      id: state.id,
      startedAt: state.config.startedAt,
      initialFen: state.initialFen,
      moves: boardState.moves,
      records: boardState.records,
      legal: boardState.legal
    };
  });

  watch(position, (next, previous) => {
    if (!next || !previous) return;
    const sameGame =
      next.id === previous.id ||
      (next.startedAt === previous.startedAt &&
        next.initialFen === previous.initialFen &&
        next.moves.length < previous.moves.length &&
        next.moves.every((move, index) => move === previous.moves[index]));
    if (!sameGame) {
      clearMotion();
      game.draggedMove.value = null;
      return;
    }
    if (signature(next) === signature(previous)) return;
    clearMotion();
    const dragged = game.draggedMove.value;
    game.draggedMove.value = null;
    const skip =
      dragged?.gameId === previous.id && dragged.position === signature(previous) ? dragged : null;
    const usedFrom = new Set();
    const usedTo = new Set();
    const moving = [];

    function add(from, to, duck = false, enter = false) {
      if (from === to && !enter) return;
      if (!duck) {
        if (usedFrom.has(from) || usedTo.has(to)) return;
        const before = previous.board[from];
        const after = next.board[to];
        if (!after || (!enter && (!before || side(before) !== side(after)))) return;
        if (
          !enter &&
          before !== after &&
          ![before, after].some((piece) => piece.toLowerCase() === 'p')
        )
          return;
        if (!enter) usedFrom.add(from);
        usedTo.add(to);
      }
      if (skip && skip.from === from && skip.to === to && skip.duck === duck) return;
      moving.push({ id: ++sequence, from, to, duck, enter, piece: duck ? '' : next.board[to] });
    }

    function movePieces(move, reverse = false) {
      if (!move) return;
      add(reverse ? move.to : move.from, reverse ? move.from : move.to);
      if (move.castle) {
        add(
          reverse ? move.castle.rookTo : move.castle.rook,
          reverse ? move.castle.rook : move.castle.rookTo
        );
      }
    }

    if (next.ply === previous.ply && next.pending && !previous.pending) {
      const castle = previous.legal.find(
        (move) =>
          move.from === next.pending.from && (move.castle?.kingTo ?? move.to) === next.pending.to
      )?.castle;
      movePieces({ ...next.pending, castle });
    } else if (next.ply === previous.ply && previous.pending && !next.pending) {
      const castle = next.legal.find(
        (move) =>
          move.from === previous.pending.from &&
          (move.castle?.kingTo ?? move.to) === previous.pending.to
      )?.castle;
      movePieces({ ...previous.pending, castle }, true);
    } else if (next.ply === previous.ply + 1 && !previous.pending) {
      movePieces(next.records[next.ply - 1]);
    } else if (previous.ply === next.ply + 1 && !next.pending) {
      movePieces(previous.records[previous.ply - 1], true);
    }

    const removed = previous.board.flatMap((piece, square) =>
      piece && piece !== next.board[square] ? [{ piece, square }] : []
    );
    for (let to = 0; to < 64; to++) {
      const piece = next.board[to];
      if (!piece || piece === previous.board[to] || usedTo.has(to)) continue;
      const candidates = removed.filter(
        (entry) => entry.piece === piece && !usedFrom.has(entry.square)
      );
      candidates.sort((a, b) => distance(a.square, to) - distance(b.square, to));
      if (candidates.length) add(candidates[0].square, to);
      else add(to, to, false, true);
    }
    if (next.duck !== previous.duck && next.duck >= 0) {
      add(previous.duck < 0 ? next.duck : previous.duck, next.duck, true, previous.duck < 0);
    }
    motions.value = moving;
    if (moving.length) timer = setTimeout(clearMotion, 260);
  });

  function finishMotion(id) {
    motions.value = motions.value.filter((motion) => motion.id !== id);
  }

  watch(game.flipped, clearMotion);
  onUnmounted(clearMotion);
  return { motions, hiddenSquares, finishMotion };
}

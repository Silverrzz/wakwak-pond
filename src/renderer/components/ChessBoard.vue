<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import { usePond } from '../shared/context';
import { pieceNames, squareName } from '../shared/format';
import { useBoardAnnotations } from '../composables/useBoardAnnotations';
import { useBoardMotion } from '../composables/useBoardMotion';
import PieceImage from './PieceImage.vue';

const { game } = usePond();
const {
  state,
  boardState,
  boardPly,
  analysis,
  frame,
  selected,
  flipped,
  promotionMove,
  humanTurn,
  reviewPly
} = game;
const { positionKey, annotations, toggleAnnotation } = useBoardAnnotations(game);
const { motions, hiddenSquares, finishMotion } = useBoardMotion(game);
const board = ref(null);
const promotion = ref(null);
const focus = ref(12);
const gesture = shallowRef(null);
const pending = computed(() =>
  analysis.value.enabled || reviewPly.value === null ? boardState.value?.pending : null
);
const draggedPiece = computed(() =>
  gesture.value?.kind === 'piece' && gesture.value.active ? gesture.value : null
);
const cells = computed(() => {
  if (!frame.value) return [];
  const last = boardState.value.records[boardPly.value - 1];
  const legal = new Set(
    humanTurn.value
      ? pending.value
        ? frame.value.board.flatMap((piece, i) => (!piece && i !== frame.value.duck ? [i] : []))
        : boardState.value.legal
            .filter((move) => move.from === selected.value)
            .map((move) => move.to)
      : []
  );
  const highlighted = pending.value
    ? [pending.value.from, pending.value.to]
    : last
      ? [last.from, last.to, ...(last.castle ? [last.castle.rook, last.castle.rookTo] : [])]
      : [];
  return Array.from({ length: 64 }, (_, position) => {
    const row = Math.floor(position / 8),
      col = position % 8;
    const x = flipped.value ? 7 - col : col,
      y = flipped.value ? row : 7 - row;
    const square = y * 8 + x;
    const piece = frame.value.board[square],
      duck = square === frame.value.duck;
    const castle =
      humanTurn.value &&
      boardState.value.legal.find(
        (move) => move.from === selected.value && move.to === square && move.castle
      );
    return {
      square,
      piece,
      duck,
      rank: col === 0 ? y + 1 : null,
      file: row === 7 ? 'abcdefgh'[x] : null,
      classes: {
        dark: (x + y) % 2 === 0,
        selected: selected.value === square && humanTurn.value,
        last: highlighted.includes(square),
        'duck-last': duck && !!last?.duck,
        legal: legal.has(square)
      },
      label: `${squareName(square)}, ${duck ? 'duck' : piece ? (piece === piece.toUpperCase() ? 'white ' : 'black ') + pieceNames[piece.toLowerCase()] : 'empty'}${legal.has(square) ? ', legal destination' : ''}`,
      title: castle
        ? castle.castle.short
          ? 'Castle kingside'
          : 'Castle queenside'
        : squareName(square),
      draggable:
        humanTurn.value &&
        (pending.value ? duck : boardState.value.legal.some((move) => move.from === square))
    };
  });
});

function point(square) {
  const file = square % 8,
    rank = Math.floor(square / 8);
  return { x: (flipped.value ? 7 - file : file) + 0.5, y: (flipped.value ? rank : 7 - rank) + 0.5 };
}

function arrowShape(mark) {
  const start = point(mark.from),
    end = point(mark.to);
  const dx = end.x - start.x,
    dy = end.y - start.y;
  const knight = mark.knight ?? Math.abs(dx) * Math.abs(dy) === 2;
  const elbow = knight
    ? Math.abs(dx) > Math.abs(dy)
      ? { x: end.x, y: start.y }
      : { x: start.x, y: end.y }
    : start;
  const length = Math.hypot(end.x - elbow.x, end.y - elbow.y) || 1;
  const ux = (end.x - elbow.x) / length,
    uy = (end.y - elbow.y) / length;
  const neck = { x: end.x - ux * 0.34, y: end.y - uy * 0.34 };
  return {
    ...mark,
    key: `${mark.from}-${mark.to}`,
    start,
    end,
    circle: mark.from === mark.to,
    path: `M${start.x} ${start.y}${knight ? `L${elbow.x} ${elbow.y}` : ''}L${neck.x} ${neck.y}`,
    head: `${end.x},${end.y} ${neck.x - uy * 0.24},${neck.y + ux * 0.24} ${neck.x + uy * 0.24},${neck.y - ux * 0.24}`
  };
}

const suggestions = computed(() => {
  const current = analysis.value;
  if (!current.enabled || frame.value?.result || !current.search) return [];
  const rows = new Map();
  for (const row of current.search.rows) {
    const rank = row.multipv || 1;
    if (row.pv && rank <= current.lines && (!rows.has(rank) || row.depth >= rows.get(rank).depth))
      rows.set(rank, row);
  }
  const seen = new Set();
  const marks = [];
  const at = (name) => 'abcdefgh'.indexOf(name[0]) + (Number(name[1]) - 1) * 8;
  for (const [rank, row] of [...rows].sort(([a], [b]) => a - b)) {
    const move = row.pv.split(/\s+/)[0];
    const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?(?:@([a-h][1-8]))?$/.exec(move);
    if (!match) continue;
    let from,
      to,
      knight = false;
    if (pending.value) {
      if (!match[4] || move.split('@')[0] !== pending.value.notation) continue;
      to = at(match[4]);
      if (frame.value.board[to] || to === frame.value.duck) continue;
      from = frame.value.duck < 0 ? to : frame.value.duck;
    } else {
      from = at(match[1]);
      const legal = boardState.value.legal.find(
        (candidate) =>
          candidate.from === from &&
          candidate.to === at(match[2]) &&
          candidate.promotion === match[3]
      );
      if (!legal) continue;
      to = legal.castle?.kingTo ?? legal.to;
      knight = frame.value.board[from]?.toLowerCase() === 'n';
    }
    const key = `${from}-${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    marks.push(
      arrowShape({
        from,
        to,
        knight,
        rank,
        duck: !!pending.value,
        opacity: Math.max(0.18, 0.9 * 0.62 ** (rank - 1))
      })
    );
  }
  return marks.reverse();
});

function pointerPosition(event) {
  const bounds = board.value.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / bounds.width;
  const y = (event.clientY - bounds.top) / bounds.height;
  const col = Math.floor(x * 8),
    row = Math.floor(y * 8);
  return {
    x: x * 100,
    y: y * 100,
    square:
      col < 0 || col > 7 || row < 0 || row > 7
        ? null
        : (flipped.value ? row : 7 - row) * 8 + (flipped.value ? 7 - col : col)
  };
}

function pointerDown(event, cell) {
  if (!event.isPrimary || gesture.value || promotionMove.value || ![0, 2].includes(event.button))
    return;
  const drawing = event.button === 2;
  if (!drawing && !humanTurn.value) return;
  event.preventDefault();
  if (!drawing) event.currentTarget.focus({ preventScroll: true });
  gesture.value = {
    kind: drawing ? 'annotation' : 'piece',
    pointerId: event.pointerId,
    key: positionKey.value,
    from: cell.square,
    to: cell.square,
    piece: cell.piece,
    duck: cell.duck,
    canDrag: cell.draggable,
    active: false,
    startX: event.clientX,
    startY: event.clientY,
    ...pointerPosition(event)
  };
  board.value.setPointerCapture(event.pointerId);
}

function pointerMove(event) {
  const current = gesture.value;
  if (!current || current.pointerId !== event.pointerId) return;
  if (!(event.buttons & (current.kind === 'annotation' ? 2 : 1))) {
    cancelGesture();
    return;
  }
  event.preventDefault();
  const position = pointerPosition(event);
  const active =
    current.active ||
    (current.canDrag &&
      Math.hypot(event.clientX - current.startX, event.clientY - current.startY) >= 4);
  if (active && !current.active && current.kind === 'piece')
    selected.value = pending.value ? null : current.from;
  gesture.value = { ...current, ...position, to: position.square, active };
}

function releaseGesture() {
  const current = gesture.value;
  gesture.value = null;
  if (current && board.value?.hasPointerCapture(current.pointerId))
    board.value.releasePointerCapture(current.pointerId);
  return current;
}

function cancelGesture() {
  const current = releaseGesture();
  if (current?.kind === 'piece' && current.active) selected.value = null;
}

function pointerUp(event) {
  if (!gesture.value || gesture.value.pointerId !== event.pointerId) return;
  event.preventDefault();
  const square = pointerPosition(event).square;
  const current = releaseGesture();
  if (current.key !== positionKey.value || square === null) return;
  if (current.kind === 'annotation') {
    toggleAnnotation(current.from, square);
    return;
  }
  if (!humanTurn.value) return;
  if (!current.active) {
    if (square === current.from) game.clickSquare(square);
    return;
  }
  const legal = pending.value
    ? !boardState.value.board[square] && square !== boardState.value.duck
    : boardState.value.legal.some((move) => move.from === current.from && move.to === square);
  if (legal) {
    if (!pending.value) selected.value = current.from;
    game.clickSquare(square, true);
  }
}

function keyboardClick(event, square) {
  if (event.detail === 0) game.clickSquare(square);
}

function cancelOnEscape(event) {
  if (event.key === 'Escape' && gesture.value) {
    event.preventDefault();
    event.stopPropagation();
    cancelGesture();
  }
}

const marks = computed(() => {
  const current = gesture.value;
  const preview =
    current?.kind === 'annotation' && current.to !== null
      ? { from: current.from, to: current.to, preview: true }
      : null;
  const visible = preview
    ? [
        ...annotations.value.filter((mark) => mark.from !== preview.from || mark.to !== preview.to),
        preview
      ]
    : annotations.value;
  return visible.map(arrowShape);
});

function motionStyle(motion) {
  const from = point(motion.from),
    to = point(motion.to);
  return {
    left: `${(to.x - 0.5) * 12.5}%`,
    top: `${(to.y - 0.5) * 12.5}%`,
    '--move-x': `${(from.x - to.x) * 100}%`,
    '--move-y': `${(from.y - to.y) * 100}%`
  };
}

async function cancelPromotion() {
  promotionMove.value = null;
  await nextTick();
  board.value?.querySelector(`[data-square="${focus.value}"]`)?.focus();
}

watch(promotionMove, async (move) => {
  if (move) {
    cancelGesture();
    await nextTick();
    promotion.value?.querySelector('button')?.focus();
  }
});
watch([positionKey, flipped, () => state.value?.id], cancelGesture);
watch(humanTurn, (value) => {
  if (!value && gesture.value?.kind === 'piece') cancelGesture();
});
onMounted(() => {
  window.addEventListener('blur', cancelGesture);
  document.addEventListener('keydown', cancelOnEscape, true);
});
onUnmounted(() => {
  cancelGesture();
  window.removeEventListener('blur', cancelGesture);
  document.removeEventListener('keydown', cancelOnEscape, true);
});
</script>

<template>
  <div class="board-wrap">
    <div
      id="board"
      ref="board"
      class="board"
      :class="{
        interactive: humanTurn,
        'duck-turn': pending && humanTurn,
        dragging: draggedPiece,
        drawing: gesture?.kind === 'annotation'
      }"
      role="group"
      aria-label="Duck chess board"
      @pointermove="pointerMove"
      @pointerup="pointerUp"
      @pointercancel="cancelGesture"
      @lostpointercapture="cancelGesture"
      @contextmenu.prevent
      @dragstart.prevent
    >
      <button
        v-for="cell in cells"
        :key="cell.square"
        class="square"
        :class="{
          ...cell.classes,
          draggable: cell.draggable,
          'drag-target': draggedPiece?.to === cell.square
        }"
        :data-square="cell.square"
        :data-piece="cell.duck ? '*' : cell.piece || ''"
        :tabindex="cell.square === focus ? 0 : -1"
        :aria-label="cell.label"
        :aria-pressed="selected === cell.square"
        :title="cell.title"
        @click="keyboardClick($event, cell.square)"
        @focus="focus = cell.square"
        @pointerdown="pointerDown($event, cell)"
      >
        <PieceImage
          v-if="cell.piece || cell.duck"
          :piece="cell.piece || ''"
          :duck="cell.duck"
          :class="{
            'piece-hidden': hiddenSquares.has(cell.square) || draggedPiece?.from === cell.square
          }"
        />
        <span v-if="cell.rank" class="coordinate rank">{{ cell.rank }}</span>
        <span v-if="cell.file" class="coordinate file">{{ cell.file }}</span>
      </button>
      <div
        v-for="motion in motions"
        :key="motion.id"
        class="moving-piece"
        :class="{ entering: motion.enter }"
        :style="motionStyle(motion)"
        aria-hidden="true"
        @animationend="finishMotion(motion.id)"
      >
        <PieceImage :piece="motion.piece" :duck="motion.duck" />
      </div>
      <svg
        v-if="suggestions.length"
        class="board-suggestions"
        viewBox="0 0 8 8"
        aria-hidden="true"
        focusable="false"
      >
        <g
          v-for="mark in suggestions"
          :key="mark.key"
          :class="{ 'duck-suggestion': mark.duck }"
          :style="{ opacity: mark.opacity }"
        >
          <circle v-if="mark.circle || mark.duck" :cx="mark.end.x" :cy="mark.end.y" r=".32" />
          <template v-if="!mark.circle">
            <path :d="mark.path" />
            <polygon :points="mark.head" />
          </template>
        </g>
      </svg>
      <svg class="board-annotations" viewBox="0 0 8 8" aria-hidden="true" focusable="false">
        <g v-for="mark in marks" :key="mark.key" :class="{ preview: mark.preview }">
          <circle v-if="mark.circle" :cx="mark.start.x" :cy="mark.start.y" r=".38" />
          <template v-else>
            <path :d="mark.path" />
            <polygon :points="mark.head" />
          </template>
        </g>
      </svg>
      <div
        v-if="draggedPiece"
        class="dragged-piece"
        :style="{ left: draggedPiece.x + '%', top: draggedPiece.y + '%' }"
        aria-hidden="true"
      >
        <PieceImage :piece="draggedPiece.piece || ''" :duck="draggedPiece.duck" />
      </div>
    </div>
    <div id="promotion" ref="promotion" class="promotion" :hidden="!promotionMove">
      <h3>Promotion</h3>
      <div class="promotion-choices">
        <button
          v-for="piece in ['q', 'r', 'b', 'n']"
          :key="piece"
          :data-piece="piece"
          :aria-label="'Promote to ' + pieceNames[piece]"
          @click="promotionMove && game.submit({ ...promotionMove, promotion: piece })"
        >
          <PieceImage
            v-if="promotionMove"
            :piece="boardState.turn === 'w' ? piece.toUpperCase() : piece"
          />
        </button>
      </div>
      <button id="cancel-promotion" @click="cancelPromotion">Cancel</button>
    </div>
  </div>
</template>

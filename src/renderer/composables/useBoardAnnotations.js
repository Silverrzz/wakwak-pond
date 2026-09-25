import { computed, shallowRef, watch } from 'vue';

export function useBoardAnnotations(game) {
  const saved = shallowRef(new Map());
  const positionKey = computed(() => {
    const state = game.boardState.value;
    if (!state) return '';
    const pending =
      game.analysis.value.enabled || game.reviewPly.value === null
        ? state.pending?.notation || ''
        : '';
    return [state.initialFen, ...state.moves.slice(0, game.boardPly.value), pending].join('|');
  });
  const annotations = computed(() => saved.value.get(positionKey.value) || []);

  function toggleAnnotation(from, to) {
    const next = new Map(saved.value);
    const current = next.get(positionKey.value) || [];
    const exists = current.some((mark) => mark.from === from && mark.to === to);
    const marks = exists
      ? current.filter((mark) => mark.from !== from || mark.to !== to)
      : [...current, { from, to }];
    if (marks.length) next.set(positionKey.value, marks);
    else next.delete(positionKey.value);
    saved.value = next;
  }

  watch(game.state, (next, previous) => {
    if (!previous || next.id === previous.id) return;
    const rewound =
      next.config.startedAt === previous.config.startedAt &&
      next.initialFen === previous.initialFen &&
      next.moves.length < previous.moves.length &&
      next.moves.every((move, index) => move === previous.moves[index]);
    if (!rewound) saved.value = new Map();
  });

  return { positionKey, annotations, toggleAnnotation };
}

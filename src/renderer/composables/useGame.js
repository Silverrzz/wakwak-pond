import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue';
import { sideName, timeDescription, variantName } from '../shared/format';

export function useGame(feedback) {
  const liveState = shallowRef(null);
  const state = computed(() =>
    analysis.value.enabled && analysis.value.source
      ? { ...liveState.value, ...analysis.value.source }
      : liveState.value
  );
  const analysis = shallowRef({ enabled: false });
  const analysisBusy = ref(false);
  const analysisEngine = ref(localStorage.getItem('pond-analysis-engine') || '');
  const catalog = shallowRef([]);
  const liveSearches = shallowRef({});
  const evaluations = shallowRef([]);
  const directory = ref('');
  const logs = shallowRef([]);
  const selected = ref(null);
  const flipped = ref(localStorage.getItem('pond-flipped') === 'true');
  const promotionMove = shallowRef(null);
  const draggedMove = shallowRef(null);
  const submitting = ref(false);
  const starting = ref(false);
  const reviewPly = ref(null);
  const reviewFrame = shallowRef(null);
  const reviewTarget = ref(null);
  const clock = shallowRef(null);
  const clockReceived = ref(performance.now());
  let reviewToken = 0;
  const subscriptions = [];
  let disposed = false;

  const frame = computed(() =>
    analysis.value.enabled
      ? analysis.value.frame
      : reviewPly.value === null
        ? state.value
        : reviewFrame.value || state.value
  );
  const boardState = computed(() => (analysis.value.enabled ? analysis.value.frame : state.value));
  const boardPly = computed(() =>
    analysis.value.enabled ? analysis.value.frame.moves.length : ply.value
  );
  const ply = computed(() =>
    analysis.value.enabled
      ? analysis.value.rootPly
      : (reviewPly.value ?? state.value?.moves.length ?? 0)
  );
  const humanTurn = computed(
    () =>
      !analysisBusy.value &&
      !submitting.value &&
      (analysis.value.enabled
        ? !analysis.value.frame.result
        : state.value?.phase === 'playing' &&
          !state.value.busy &&
          reviewPly.value === null &&
          state.value.config[state.value.turn] === 'human')
  );
  const names = computed(() =>
    Object.fromEntries(
      ['w', 'b'].map((side) => {
        const id = state.value?.config[side];
        return [
          side,
          state.value?.config.playerNames?.[side] ||
            (!id || id === 'human'
              ? 'Human'
              : catalog.value.find((engine) => engine.id === id)?.name ||
                id
                  .split(/[\\/]/)
                  .at(-1)
                  .replace(/\.exe$/i, ''))
        ];
      })
    )
  );
  const searches = computed(
    () =>
      (reviewPly.value === null ? liveSearches.value : reviewFrame.value?.searches) ||
      liveSearches.value
  );
  const heading = computed(() => {
    if (!state.value) return { title: 'Duck', subtitle: '', description: '' };
    const current = state.value;
    const controls = current.clock.controls;
    const same = JSON.stringify(controls.w) === JSON.stringify(controls.b);
    const custom = current.config.customPosition ?? !!current.config.fen;
    return {
      title: variantName(current.variant),
      subtitle: custom
        ? 'FEN'
        : current.variant === 'duck'
          ? ''
          : '#' +
            current.position +
            (current.variant === 'duckdfrc' ? ' / #' + current.blackPosition : ''),
      description: same
        ? timeDescription(controls.w)
        : 'White: ' + timeDescription(controls.w) + ' · Black: ' + timeDescription(controls.b)
    };
  });
  const status = computed(() => {
    const current = state.value;
    if (!current) return '';
    if (analysis.value.enabled) {
      const position = analysis.value.frame;
      return (
        'Analysis · ' +
        (position.result ||
          sideName(position.turn) + (position.pending ? ': place duck' : ' to move'))
      );
    }
    if (reviewPly.value !== null)
      return (
        'Review · ' +
        sideName(frame.value.turn) +
        ' to move' +
        (current.phase === 'playing' ? ' · clock running' : '')
      );
    return current.phase === 'ready'
      ? ''
      : current.phase === 'paused'
        ? 'Paused'
        : current.phase === 'starting'
          ? 'Starting engines…'
          : current.result ||
            sideName(current.turn) +
              (current.busy ? ' thinking…' : current.pending ? ': place duck' : ' to move');
  });

  function resetReview() {
    reviewPly.value = null;
    reviewFrame.value = null;
    reviewTarget.value = null;
    reviewToken++;
  }

  function receiveClock(data) {
    clock.value = data;
    clockReceived.value = performance.now();
  }

  function receiveState(next) {
    if (state.value && state.value.id !== next.id) {
      resetReview();
      selected.value = null;
      promotionMove.value = null;
    }
    liveState.value = next;
    liveSearches.value = next.searches || {};
    evaluations.value = next.evaluations || [];
    receiveClock(next.clock);
    if (!humanTurn.value) {
      selected.value = null;
      promotionMove.value = null;
    }
  }

  function receiveInfo(info) {
    if (!state.value || info.gameId !== state.value.id) return;
    const previous = liveSearches.value[info.channel];
    const search =
      previous?.id === info.id
        ? { ...previous, rows: [...previous.rows] }
        : {
            id: info.id,
            channel: info.channel,
            side: info.side,
            source: info.source,
            ply: info.ply,
            rows: []
          };
    search.active = info.active;
    search.latest = info.latest;
    if (info.row) {
      const index = search.rows.findIndex(
        (row) => row.depth === info.row.depth && (row.multipv || 1) === (info.row.multipv || 1)
      );
      if (index < 0) search.rows.push(info.row);
      else search.rows[index] = info.row;
      if (search.rows.length > 128) search.rows.shift();
    }
    if (info.evaluation) {
      const points = [...evaluations.value];
      const index = points.findIndex(
        (point) => point.channel === info.channel && point.ply === info.ply
      );
      if (index < 0) points.push(info.evaluation);
      else points[index] = info.evaluation;
      evaluations.value = points;
    }
    liveSearches.value = { ...liveSearches.value, [info.channel]: search };
  }

  function receiveAnalysis(next) {
    if (next.enabled && next.gameId !== state.value?.id) return;
    if (next.revision === analysis.value.revision) next.frame = analysis.value.frame;
    else {
      selected.value = null;
      promotionMove.value = null;
    }
    analysis.value = next;
    if (next.engineId) analysisEngine.value = next.engineId;
  }

  async function startAnalysis(target = ply.value, options = {}, errorTarget) {
    if (!state.value || analysisBusy.value || submitting.value) return;
    const engine =
      catalog.value.find((entry) => entry.id === analysisEngine.value) ||
      catalog.value.reduce(
        (latest, entry) => (!latest || entry.addedOrder > latest.addedOrder ? entry : latest),
        null
      );
    analysisBusy.value = true;
    try {
      return await feedback.action(async () => {
        const next = await window.pond.startAnalysis({
          gameId: state.value.id,
          ply: target,
          engineId: engine?.id || '',
          source: analysis.value.enabled && analysis.value.source ? 'existing' : 'current',
          ...options
        });
        receiveAnalysis(next);
        if (options.source) resetReview();
        if (engine) {
          analysisEngine.value = engine.id;
          localStorage.setItem('pond-analysis-engine', engine.id);
        }
        return true;
      }, errorTarget);
    } finally {
      analysisBusy.value = false;
    }
  }

  async function analysisAction(method, data = {}) {
    if (analysisBusy.value || submitting.value || !analysis.value.enabled) return;
    analysisBusy.value = true;
    try {
      await feedback.action(async () => {
        await window.pond[method]({ revision: analysis.value.revision, ...data });
        if (data.engineId) localStorage.setItem('pond-analysis-engine', data.engineId);
      });
    } finally {
      analysisBusy.value = false;
    }
  }

  async function stopAnalysis() {
    if (analysisBusy.value || submitting.value) return;
    analysisBusy.value = true;
    try {
      await feedback.action(() => window.pond.stopAnalysis());
      resetReview();
    } finally {
      analysisBusy.value = false;
    }
  }

  async function submit({ dragged = false, ...move }) {
    if (submitting.value) return;
    const current = boardState.value;
    const legal = current.legal.find(
      (candidate) => candidate.from === move.from && candidate.to === move.to
    );
    const marker = dragged
      ? {
          gameId: state.value.id,
          position: current.board.join(',') + ':' + current.duck,
          from: current.pending ? current.duck : move.from,
          to: legal?.castle?.kingTo ?? move.to,
          duck: !!current.pending
        }
      : null;
    draggedMove.value = marker;
    submitting.value = true;
    selected.value = null;
    promotionMove.value = null;
    try {
      let accepted = false;
      await feedback.action(async () => {
        if (analysis.value.enabled)
          await window.pond.analysisMove({ revision: analysis.value.revision, ...move });
        else await window.pond.move(move);
        accepted = true;
      });
      if (!accepted && draggedMove.value === marker) draggedMove.value = null;
    } finally {
      submitting.value = false;
    }
  }

  function clickSquare(square, dragged = false) {
    if (!humanTurn.value || promotionMove.value) return;
    const current = boardState.value;
    if (current.pending) {
      if (!current.board[square] && square !== current.duck) void submit({ to: square, dragged });
      return;
    }
    const moves = current.legal.filter(
      (move) => move.from === selected.value && move.to === square
    );
    if (moves.length) {
      const move = { from: selected.value, to: square, dragged };
      if (moves[0].promotion) promotionMove.value = move;
      else void submit(move);
      return;
    }
    selected.value =
      selected.value === square
        ? null
        : current.legal.some((move) => move.from === square)
          ? square
          : null;
  }

  async function cancelPiece() {
    selected.value = null;
    promotionMove.value = null;
    if (boardState.value?.pending && !submitting.value) {
      submitting.value = true;
      try {
        await feedback.action(() =>
          analysis.value.enabled
            ? window.pond.analysisBack({ revision: analysis.value.revision })
            : window.pond.cancelPiece()
        );
      } finally {
        submitting.value = false;
      }
    }
  }

  async function review(value) {
    if (!state.value) return;
    if (analysisBusy.value || submitting.value) return;
    draggedMove.value = null;
    const token = ++reviewToken;
    const target = Math.max(0, Math.min(value, state.value.moves.length));
    reviewTarget.value = target;
    selected.value = null;
    promotionMove.value = null;
    if (analysis.value.enabled && analysis.value.source) {
      if (await startAnalysis(target)) reviewPly.value = target;
      reviewTarget.value = null;
      return;
    }
    const next = await feedback.action(() => window.pond.review(target));
    if (disposed || token !== reviewToken) return;
    if (next && analysis.value.enabled && !(await startAnalysis(target))) {
      reviewTarget.value = null;
      return;
    }
    if (disposed || token !== reviewToken) return;
    reviewTarget.value = null;
    if (next) {
      if (target === state.value.moves.length) resetReview();
      else {
        reviewPly.value = target;
        reviewFrame.value = next;
      }
    }
  }

  function flip(value = !flipped.value) {
    flipped.value = value;
    localStorage.setItem('pond-flipped', String(value));
  }

  onMounted(() => {
    subscriptions.push(
      window.pond.onState(receiveState),
      window.pond.onClock(receiveClock),
      window.pond.onInfo(receiveInfo),
      window.pond.onAnalysis(receiveAnalysis),
      window.pond.onLogs((value) => {
        logs.value = value;
      })
    );
    void feedback.action(async () => {
      const initial = await window.pond.initial();
      if (disposed) return;
      catalog.value = initial.engines;
      directory.value = initial.directory;
      logs.value = initial.logs;
      receiveState(initial.state);
      receiveAnalysis(initial.analysis);
    });
  });
  onUnmounted(() => {
    disposed = true;
    reviewToken++;
    subscriptions.forEach((unsubscribe) => unsubscribe());
  });

  return {
    state,
    analysis,
    analysisBusy,
    boardState,
    boardPly,
    startAnalysis,
    stopAnalysis,
    analysisAction,
    liveSearches,
    evaluations,
    catalog,
    directory,
    logs,
    selected,
    flipped,
    promotionMove,
    draggedMove,
    submitting,
    starting,
    reviewPly,
    reviewTarget,
    clock,
    clockReceived,
    frame,
    ply,
    humanTurn,
    names,
    searches,
    heading,
    status,
    resetReview,
    submit,
    clickSquare,
    cancelPiece,
    review,
    flip
  };
}

<script setup>
import { computed, nextTick, onMounted, onUnmounted, provide, ref, shallowRef, watch } from 'vue';
import { pondKey } from './shared/context';
import { useFeedback } from './composables/useFeedback';
import { useGame } from './composables/useGame';
import { useSearchOutput } from './composables/useSearchOutput';
import BoardPanel from './components/BoardPanel.vue';
import MoveHistory from './components/MoveHistory.vue';
import EvaluationPanel from './components/EvaluationPanel.vue';
import ConfirmDialog from './components/ConfirmDialog.vue';
import RulesPage from './components/RulesPage.vue';
import AnalysisPanel from './components/AnalysisPanel.vue';
import GameSetup from './components/GameSetup.vue';
import HomePage from './components/HomePage.vue';
import duckArt from '../pieces/duck.svg';

const feedback = useFeedback();
const game = useGame(feedback);
const output = useSearchOutput(game);
const { state, frame, analysis, ply, reviewPly, submitting, analysisBusy } = game;
const { error, notification } = feedback;
const page = ref('home');
const setup = ref(false);
const starting = ref(false);
const routeBusy = ref(false);
const importOpen = ref(false);
const importKind = ref('pgn');
const importText = ref('');
const fileInput = ref(null);
const confirmOpen = ref(false);
const confirmation = shallowRef(null);
let analysisEntry = '';
let navigation = Promise.resolve();
const pond = window.pond;
const supported = globalThis.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined';
const pages = ['home', 'play', 'analysis', 'rules'];
provide(pondKey, { game, feedback });

const canNavigate = computed(() => !analysisBusy.value && !submitting.value && !routeBusy.value);
const playTitle = computed(() => {
  if (state.value?.result) return state.value.result;
  if (starting.value || state.value?.phase === 'starting') return 'Loading WakWak…';
  if (reviewPly.value !== null) return 'Reviewing game';
  if (state.value?.phase === 'paused') return 'Paused';
  if (state.value?.busy) return 'WakWak is thinking';
  return frame.value?.pending ? 'Place the duck' : 'Your move';
});

function go(destination) {
  if (routeBusy.value) return;
  if (location.hash === `#/${destination}`) changePage();
  else location.hash = `/${destination}`;
}

function focusMain() {
  document.getElementById('main-content').focus();
}

function changePage() {
  const requested = location.hash.replace(/^#\/?/, '') || 'home';
  const next = pages.includes(requested) ? requested : 'home';
  navigation = navigation
    .catch(() => {})
    .then(async () => {
      if (!state.value) return;
      routeBusy.value = true;
      try {
        if (next !== 'play' && ['playing', 'starting'].includes(state.value.phase))
          await pond.pause();
        if (next !== 'analysis' && analysis.value.enabled) await game.stopAnalysis();
        page.value = next;
        if (next === 'play') {
          game.resetReview();
          setup.value = state.value.phase === 'ready';
          if (state.value.phase === 'paused' && supported)
            await feedback.action(() => pond.resume());
        }
        if (next === 'analysis' && !analysis.value.enabled) {
          if (analysisEntry === 'current') await game.startAnalysis(0, { source: 'current' });
          else if (!(await window.pond.restoreAnalysis()))
            await game.startAnalysis(0, { source: 'fresh', variant: 'duck' });
          analysisEntry = '';
        }
        document.title = `${{ home: 'Home', play: 'Play', analysis: 'Analysis', rules: 'How to play Duck Chess' }[next]} · WakWak`;
        await nextTick();
        document.querySelector('.page-title')?.focus({ preventScroll: true });
        window.scrollTo({ top: 0, behavior: 'instant' });
      } finally {
        routeBusy.value = false;
      }
    });
  void navigation.catch((failure) => feedback.showError(failure.message));
}

watch(
  () => !!state.value,
  (ready) => {
    if (ready) changePage();
  }
);

async function startGame(config) {
  if (starting.value || !supported) return;
  starting.value = true;
  await feedback.action(async () => {
    const human = config.side === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : config.side;
    game.resetReview();
    game.flip(human === 'b');
    await window.pond.start({
      variant: 'duck',
      w: human === 'w' ? 'human' : 'wakwak',
      b: human === 'b' ? 'human' : 'wakwak',
      controls: config.controls
    });
    setup.value = false;
    go('play');
  });
  starting.value = false;
}

function ask(title, description, label, action) {
  confirmation.value = { title, description, label, action };
  confirmOpen.value = true;
}

function newGame() {
  if (!state.value) return;
  game.resetReview();
  setup.value = true;
}

function analyseGame() {
  analysisEntry = 'current';
  go('analysis');
}

async function importGame() {
  if (analysisBusy.value) return;
  if (importText.value.length > 2 * 1024 * 1024)
    return feedback.showError('Please use a game file smaller than 2 MB.');
  const options =
    importKind.value === 'fen'
      ? { source: 'fen', fen: importText.value, variant: 'duck' }
      : { source: 'pgn', pgn: importText.value };
  if (await game.startAnalysis(0, options)) importOpen.value = false;
}

async function chooseFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  await feedback.action(async () => {
    if (file.size > 2 * 1024 * 1024) throw new Error('Please choose a PGN file smaller than 2 MB.');
    importText.value = await file.text();
    importKind.value = 'pgn';
    importOpen.value = true;
    await importGame();
  });
  event.target.value = '';
}

async function download() {
  await feedback.action(async () => {
    await window.pond.saveGame();
    feedback.notify('Game downloaded');
  });
}

async function copyPosition() {
  await feedback.action(async () => {
    if (analysis.value.enabled)
      await window.pond.copyAnalysisFen({ revision: analysis.value.revision });
    else await window.pond.copyFen(ply.value);
    feedback.notify('Position copied');
  });
}

function shortcut(event) {
  if (event.defaultPrevented || document.querySelector('dialog[open]')) return;
  if (
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.target.closest('input, textarea, select, dialog, [contenteditable]')
  )
    return;
  if (!['play', 'analysis'].includes(page.value) || !canNavigate.value) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    if (game.promotionMove.value || game.selected.value !== null) {
      game.selected.value = null;
      game.promotionMove.value = null;
    } else if (frame.value?.pending) void game.cancelPiece();
    return;
  }
  if (event.key.toLowerCase() === 'f') game.flip();
  if (event.target.closest('.board')) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    void game.review(ply.value + (event.key === 'ArrowLeft' ? -1 : 1));
  }
}

onMounted(() => {
  window.addEventListener('hashchange', changePage);
  window.addEventListener('keydown', shortcut);
});
onUnmounted(() => {
  window.removeEventListener('hashchange', changePage);
  window.removeEventListener('keydown', shortcut);
});
</script>

<template>
  <a class="skip-link" href="#main-content" @click.prevent="focusMain">Skip to board</a>
  <header class="app-header web-header">
    <a class="app-name" href="#/home" aria-label="WakWak home">
      <img :src="duckArt" alt="" />
      WakWak
    </a>
    <nav aria-label="Pages">
      <a href="#/home" :aria-current="page === 'home' ? 'page' : undefined">Home</a>
      <a href="#/play" :aria-current="page === 'play' ? 'page' : undefined">Play</a>
      <a href="#/analysis" :aria-current="page === 'analysis' ? 'page' : undefined">Analysis</a>
    </nav>
    <span class="separator"></span>
    <button
      v-if="page === 'play'"
      :disabled="!state || starting || state?.phase === 'starting'"
      @click="newGame"
    >
      New game
    </button>
    <button v-if="page === 'analysis'" :disabled="!analysis.enabled" @click="fileInput?.click()">
      Open PGN
    </button>
    <button
      v-if="page === 'analysis'"
      :aria-expanded="importOpen"
      @click="importOpen = !importOpen"
    >
      Paste
    </button>
    <button
      v-if="page === 'play' || page === 'analysis'"
      :disabled="!state || !!frame?.pending"
      @click="download"
    >
      Save PGN
    </button>
    <a
      class="github-button"
      href="https://github.com/Silverrzz/WakWak"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="WakWak engine on GitHub"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path
          d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.86c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.64-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.03A9.6 9.6 0 0 1 12 6.82c.85 0 1.71.11 2.51.34 1.91-1.3 2.75-1.03 2.75-1.03.55 1.38.2 2.4.1 2.65.64.7 1.03 1.6 1.03 2.69 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.76c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"
        />
      </svg>
      GitHub
    </a>
  </header>
  <main id="main-content" class="web-main" tabindex="-1" :aria-busy="routeBusy">
    <HomePage
      v-if="page === 'home'"
      @play="newGame"
      @analyse="go('analysis')"
      @rules="go('rules')"
    />
    <RulesPage v-if="page === 'rules'" />
    <p
      v-if="(page === 'play' || page === 'analysis') && !supported"
      class="inline-error"
      role="alert"
    >
      WakWak requires a browser with shared-memory support and a secure connection.
    </p>
    <p
      v-if="
        (page === 'play' || page === 'analysis') &&
        (!state || (page === 'analysis' && !analysis.enabled))
      "
      role="status"
    >
      Loading…
    </p>
    <div
      v-else-if="page === 'play' || page === 'analysis'"
      class="web-workspace"
      :class="{ analysing: page === 'analysis' }"
    >
      <BoardPanel />
      <aside class="web-sidebar">
        <template v-if="page === 'play'">
          <div class="dock-heading">
            <h1 class="page-title" tabindex="-1">Play against WakWak</h1>
          </div>
          <div class="game-message" aria-live="polite">
            <strong>{{ playTitle }}</strong>
            <p v-if="state.status">{{ state.status }}</p>
          </div>
          <div
            v-if="state.phase === 'paused' || reviewPly !== null || state.result"
            class="compact-actions"
          >
            <button
              v-if="state.phase === 'paused'"
              :disabled="starting || !supported"
              class="primary"
              @click="feedback.action(() => pond.resume())"
            >
              Resume
            </button>
            <button v-if="reviewPly !== null" @click="game.review(state.moves.length)">
              Live position
            </button>
            <button v-if="state.result" @click="analyseGame">Analyse game</button>
          </div>
          <div class="moves-area">
            <MoveHistory />
            <p v-if="!state.moves.length" class="empty-state">No moves yet.</p>
          </div>
          <div class="move-navigation">
            <button
              aria-label="First position"
              :disabled="!ply || !canNavigate"
              @click="game.review(0)"
            >
              |‹
            </button>
            <button
              aria-label="Previous move"
              :disabled="!ply || !canNavigate"
              @click="game.review(ply - 1)"
            >
              ←
            </button>
            <button
              aria-label="Next move"
              :disabled="ply >= state.moves.length || !canNavigate"
              @click="game.review(ply + 1)"
            >
              →
            </button>
            <button
              aria-label="Latest position"
              :disabled="ply >= state.moves.length || !canNavigate"
              @click="game.review(state.moves.length)"
            >
              ›|
            </button>
          </div>
          <div class="compact-actions">
            <button
              :disabled="!state.moves.length || state.phase === 'starting' || !canNavigate"
              @click="feedback.action(() => pond.takeback())"
            >
              Take back
            </button>
            <button :disabled="state.phase === 'starting'" @click="analyseGame">Analyse</button>
            <button
              v-if="!state.result"
              @click="ask('Resign?', 'This ends the game.', 'Resign', () => pond.resign())"
            >
              Resign
            </button>
          </div>
        </template>
        <template v-else>
          <div class="dock-heading"><h1 class="page-title" tabindex="-1">Analysis</h1></div>
          <input
            ref="fileInput"
            type="file"
            accept=".pgn,text/plain,application/x-chess-pgn"
            class="visually-hidden"
            aria-label="Open PGN"
            @change="chooseFile"
          />
          <form v-if="importOpen" class="import-form" @submit.prevent="importGame">
            <label>
              Format
              <select v-model="importKind">
                <option value="pgn">PGN game</option>
                <option value="fen">FEN position</option>
              </select>
            </label>
            <label>
              {{ importKind.toUpperCase() }}
              <textarea
                v-model="importText"
                rows="5"
                required
                spellcheck="false"
                maxlength="2097152"
              ></textarea>
            </label>
            <div class="compact-actions">
              <button class="primary" :disabled="analysisBusy">Load</button>
              <button type="button" @click="importOpen = false">Cancel</button>
            </div>
          </form>
          <div class="moves-area">
            <MoveHistory />
            <p v-if="!state.moves.length" class="empty-state">
              Open a PGN, paste a position, or move the pieces.
            </p>
          </div>
          <div class="move-navigation">
            <button
              aria-label="First position"
              :disabled="!ply || !canNavigate"
              @click="game.review(0)"
            >
              |‹
            </button>
            <button
              aria-label="Previous move"
              :disabled="!ply || !canNavigate"
              @click="game.review(ply - 1)"
            >
              ←
            </button>
            <button
              aria-label="Next move"
              :disabled="ply >= state.moves.length || !canNavigate"
              @click="game.review(ply + 1)"
            >
              →
            </button>
            <button
              aria-label="Last position"
              :disabled="ply >= state.moves.length || !canNavigate"
              @click="game.review(state.moves.length)"
            >
              ›|
            </button>
          </div>
          <div class="compact-actions">
            <button :disabled="!!frame.pending" @click="copyPosition">Copy FEN</button>
            <button
              :disabled="!canNavigate"
              @click="
                ask(
                  'Clear analysis?',
                  'This resets the board to the starting position.',
                  'Clear',
                  () => game.startAnalysis(0, { source: 'fresh', variant: 'duck' })
                )
              "
            >
              Clear board
            </button>
          </div>
        </template>
      </aside>
      <section v-if="page === 'analysis'" class="analysis-output" aria-label="WakWak analysis">
        <AnalysisPanel />
      </section>
      <EvaluationPanel v-if="page === 'analysis'" :output="output" @review="game.review" />
    </div>
  </main>
  <GameSetup
    v-model="setup"
    :busy="starting"
    :supported="!!state && supported"
    @start="startGame"
  />
  <div v-if="notification" class="notification" role="status">{{ notification }}</div>
  <div v-if="error" class="error-toast" role="alert">
    <span>{{ error }}</span>
    <button aria-label="Dismiss error" @click="error = ''">×</button>
  </div>
  <ConfirmDialog
    v-model="confirmOpen"
    :confirmation="confirmation"
    @confirm="feedback.action(confirmation.action)"
  />
</template>

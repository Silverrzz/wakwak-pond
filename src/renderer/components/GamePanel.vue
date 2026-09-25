<script setup>
import { computed } from 'vue';
import { usePond } from '../shared/context';
import { sideName, squareName } from '../shared/format';
import MoveHistory from './MoveHistory.vue';

const { game, commands, activeTab } = usePond();
const { state, frame, analysis, ply, heading, reviewPly, reviewTarget, starting, submitting } =
  game;
const message = computed(() =>
  !state.value ||
  state.value.phase === 'starting' ||
  /^(Move taken back|Game loaded)/.test(state.value.status)
    ? ''
    : state.value.status
);
const playable = computed(() => ['playing', 'paused'].includes(state.value?.phase));
const canCopy = computed(() =>
  analysis.value.enabled ? !frame.value?.pending : !state.value?.pending || reviewPly.value !== null
);
const tabs = [
  { name: 'moves', label: 'Moves' },
  { name: 'position', label: 'FEN' }
];
</script>

<template>
  <aside class="game-panel">
    <div class="game-heading">
      <h1 id="game-title" :title="heading.description">{{ heading.title }}</h1>
      <span id="game-subtitle">{{ heading.subtitle }}</span>
    </div>
    <div id="game-message" class="game-message" :hidden="!message" role="status">{{ message }}</div>
    <div class="tabs" role="tablist" aria-label="Game panels">
      <button
        v-for="tab in tabs"
        :id="'tab-' + tab.name"
        :key="tab.name"
        role="tab"
        :aria-selected="activeTab === tab.name"
        :aria-controls="'panel-' + tab.name"
        :data-tab="tab.name"
        tabindex="0"
        @click="activeTab = tab.name"
      >
        {{ tab.label }}
      </button>
    </div>
    <section
      id="panel-moves"
      class="tab-panel moves-panel"
      role="tabpanel"
      aria-labelledby="tab-moves"
      :hidden="activeTab !== 'moves'"
    >
      <MoveHistory />
    </section>
    <section
      id="panel-position"
      class="tab-panel position-panel"
      role="tabpanel"
      aria-labelledby="tab-position"
      :hidden="activeTab !== 'position'"
    >
      <textarea
        id="position-fen"
        :value="frame?.fen || ''"
        readonly
        rows="4"
        aria-label="Position FEN"
        spellcheck="false"
      ></textarea>
      <button
        id="copy-fen"
        :disabled="!canCopy"
        :title="canCopy ? 'Copy position FEN' : 'Complete the turn first'"
        @click="commands.copyFen"
      >
        Copy
      </button>
      <dl class="position-details">
        <div>
          <dt>Turn</dt>
          <dd id="position-turn">{{ sideName(frame?.turn || 'w') }}</dd>
        </div>
        <div>
          <dt>Duck</dt>
          <dd id="position-duck">{{ frame && frame.duck >= 0 ? squareName(frame.duck) : '-' }}</dd>
        </div>
        <div>
          <dt>Halfmove</dt>
          <dd id="position-halfmove">{{ frame?.halfmove || 0 }}</dd>
        </div>
      </dl>
    </section>
    <div class="move-navigation" role="group" aria-label="Move navigation">
      <button
        id="first-move"
        :disabled="!ply"
        aria-label="Starting position"
        title="Start (Home)"
        @click="game.review(0)"
      >
        <svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M5 5v14m13-14-7 7 7 7" />
        </svg>
      </button>
      <button
        id="previous-move"
        :disabled="!ply"
        aria-label="Previous move"
        title="Previous (Left arrow)"
        @click="game.review((reviewTarget ?? ply) - 1)"
      >
        <svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="m15 6-6 6 6 6" />
        </svg>
      </button>
      <span id="move-counter" :aria-label="ply + ' of ' + (state?.moves.length || 0) + ' moves'">
        <span class="current-ply">{{ ply }}</span>
        <span class="move-counter-divider" aria-hidden="true">/</span>
        <span>{{ state?.moves.length || 0 }}</span>
      </span>
      <button
        id="next-move"
        :disabled="ply >= (state?.moves.length || 0)"
        aria-label="Next move"
        title="Next (Right arrow)"
        @click="game.review((reviewTarget ?? ply) + 1)"
      >
        <svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="m9 6 6 6-6 6" />
        </svg>
      </button>
      <button
        id="last-move"
        :disabled="ply >= (state?.moves.length || 0)"
        aria-label="Latest position"
        title="Latest (End)"
        @click="game.review(state.moves.length)"
      >
        <svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M19 5v14M6 5l7 7-7 7" />
        </svg>
      </button>
    </div>
    <div class="game-controls" :hidden="!state || state.phase === 'ready' || analysis.enabled">
      <button
        id="pause"
        :hidden="!['playing', 'paused', 'starting'].includes(state?.phase)"
        :disabled="state?.phase === 'starting' || starting"
        @click="commands.pause"
      >
        {{ state?.phase === 'paused' ? 'Resume' : 'Pause' }}
      </button>
      <button
        id="takeback"
        title="Undo the last move"
        :disabled="
          (!state?.moves.length && !state?.pending) || state?.phase === 'starting' || submitting
        "
        @click="commands.takeback"
      >
        <svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="m9 14-5-5 5-5M4 9h10a6 6 0 0 1 0 12h-3" />
        </svg>
        <span>Take back</span>
      </button>
      <button
        id="resign"
        :hidden="!playable || state?.config[state.turn] !== 'human'"
        @click="commands.resign"
      >
        Resign
      </button>
      <button
        id="agree-draw"
        :hidden="!playable || state?.config.w !== 'human' || state?.config.b !== 'human'"
        @click="commands.draw"
      >
        Draw
      </button>
    </div>
  </aside>
</template>

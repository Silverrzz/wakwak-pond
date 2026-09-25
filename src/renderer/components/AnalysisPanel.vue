<script setup>
import { computed } from 'vue';
import { usePond } from '../shared/context';
import { formatScore } from '../shared/format';
import SearchPane from './SearchPane.vue';

const { game, commands } = usePond();
const { analysis, analysisBusy, submitting, catalog, state } = game;
const busy = computed(() => analysisBusy.value || submitting.value);
const position = computed(() => analysis.value.frame);
const branch = computed(() => position.value?.records.slice(analysis.value.rootPly) || []);
const principal = computed(
  () =>
    [...(analysis.value.search?.rows || [])]
      .filter((row) => (row.multipv || 1) === 1)
      .sort((a, b) => b.depth - a.depth)[0]
);
const searchState = computed(() => ({
  ...state.value,
  searches: { [position.value?.turn]: analysis.value.search }
}));
const searching = computed(() => ['starting', 'searching'].includes(analysis.value.phase));
const status = computed(
  () =>
    ({
      starting: 'Preparing analysis…',
      terminal: position.value?.result,
      error: analysis.value.error
    })[analysis.value.phase] || ''
);

function settings(data) {
  void game.analysisAction('analysisSettings', data);
}
</script>

<template>
  <section class="analysis-panel" aria-label="Position analysis">
    <div class="analysis-controls">
      <strong class="analysis-score" title="Score from White’s perspective">
        {{ formatScore(principal) || '-' }}
      </strong>
      <label class="analysis-engine">
        <select
          aria-label="Analysis engine"
          :value="analysis.engineId"
          :disabled="busy"
          @change="settings({ engineId: $event.target.value })"
        >
          <option v-if="!analysis.engineId" value="" disabled>Engine</option>
          <option v-for="engine in catalog" :key="engine.id" :value="engine.id">
            {{ engine.name }}
          </option>
        </select>
      </label>
      <label v-if="analysis.maxLines > 1" class="analysis-lines">
        <select
          aria-label="Number of analysis lines"
          :value="analysis.lines"
          :disabled="busy || analysis.maxLines <= 1 || analysis.phase === 'starting'"
          @change="settings({ lines: Number($event.target.value) })"
        >
          <option v-for="count in analysis.maxLines" :key="count" :value="count">
            {{ count }} {{ count === 1 ? 'line' : 'lines' }}
          </option>
        </select>
      </label>
      <button v-if="!catalog.length" @click="commands.engines">Add engine</button>
      <button
        v-else
        :disabled="busy || !analysis.engineId || !!position?.result"
        @click="settings({ running: !searching })"
      >
        {{ searching ? 'Stop' : analysis.phase === 'error' ? 'Retry' : 'Analyze' }}
      </button>
    </div>
    <div
      v-if="status"
      class="analysis-message"
      :class="{ 'analysis-error': analysis.phase === 'error' }"
      role="status"
    >
      {{ status }}
    </div>
    <div v-if="branch.length || position?.pending" class="analysis-branch">
      <div class="analysis-branch-controls">
        <button
          :disabled="busy || (!branch.length && !position?.pending)"
          @click="game.analysisAction('analysisBack')"
        >
          Undo
        </button>
        <button
          :disabled="busy || (!branch.length && !position?.pending)"
          @click="game.analysisAction('analysisReset')"
        >
          Reset variation
        </button>
      </div>
      <div
        v-if="branch.length || position?.pending"
        class="analysis-branch-moves"
        aria-label="Analysis variation"
      >
        <span v-for="(move, index) in branch" :key="index">
          {{ move.number }}{{ move.side === 'w' ? '.' : '…' }} {{ move.san
          }}{{ move.duck ? '@' + move.duck : '' }}
        </span>
        <span v-if="position?.pending">{{ position.pending.notation }} · place duck</span>
      </div>
    </div>
    <SearchPane
      v-if="position"
      id-prefix="analysis-search"
      :show-heading="false"
      inline-variation
      :channel="position.turn"
      :state="searchState"
      :search="analysis.search"
    />
  </section>
</template>

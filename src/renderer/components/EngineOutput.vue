<script setup>
import { ref } from 'vue';
import DockSplitter from './DockSplitter.vue';
import SearchPane from './SearchPane.vue';
import AnalysisPanel from './AnalysisPanel.vue';
import AnalysisImport from './AnalysisImport.vue';
import { usePond } from '../shared/context';

const { game, commands } = usePond();
const { analysis, analysisBusy, submitting } = game;
const importOpen = ref(false);

defineProps({ output: { type: Object, required: true } });
</script>

<template>
  <section class="output-panel" aria-label="Engine output">
    <div class="dock-heading">
      <h2>{{ analysis.enabled ? 'Analysis' : 'Engine output' }}</h2>
      <div v-if="analysis.enabled" class="analysis-source-controls">
        <button :disabled="analysisBusy || submitting" @click="commands.newAnalysis">
          New board
        </button>
        <button :disabled="analysisBusy || submitting" @click="commands.openGame">Open PGN</button>
        <button
          :disabled="analysisBusy || submitting"
          :aria-expanded="importOpen"
          @click="importOpen = !importOpen"
        >
          Paste
        </button>
      </div>
    </div>
    <AnalysisImport v-if="analysis.enabled" v-model="importOpen" />
    <AnalysisPanel v-if="analysis.enabled" />
    <div v-show="!analysis.enabled" id="game-searches" class="game-searches">
      <SearchPane
        channel="w"
        :state="output.state"
        :search="output.searches.w"
        :name="output.names.w"
      />
      <DockSplitter
        id="engine-splitter"
        orientation="horizontal"
        label="White and black output height"
      />
      <SearchPane
        channel="b"
        :state="output.state"
        :search="output.searches.b"
        :name="output.names.b"
      />
    </div>
  </section>
</template>

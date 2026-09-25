<script setup>
import { ref } from 'vue';
import { usePond } from '../shared/context';

const { game } = usePond();
const open = defineModel({ type: Boolean, default: false });
const source = ref('fen');
const text = ref('');
const error = ref('');
const { analysisBusy: busy } = game;

async function load() {
  if (
    await game.startAnalysis(
      0,
      {
        source: source.value,
        variant: game.state.value.variant,
        fen: text.value.trim(),
        pgn: text.value.trim()
      },
      error
    )
  ) {
    open.value = false;
    text.value = '';
  }
}
</script>

<template>
  <form v-if="open" class="analysis-import" @submit.prevent="load">
    <div class="analysis-import-controls">
      <select v-model="source" aria-label="Import format" :disabled="busy">
        <option value="fen">FEN</option>
        <option value="pgn">PGN</option>
      </select>
      <button type="submit" :disabled="busy || !text.trim()">Load</button>
      <button type="button" :disabled="busy" @click="open = false">Cancel</button>
    </div>
    <textarea
      v-model="text"
      :aria-label="source.toUpperCase()"
      :placeholder="source.toUpperCase()"
      rows="3"
      required
      spellcheck="false"
      :disabled="busy"
    />
    <div v-if="error" role="alert">{{ error }}</div>
  </form>
</template>

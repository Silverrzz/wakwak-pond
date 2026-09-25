<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { usePond } from '../shared/context';
import { sideName } from '../shared/format';

const { game } = usePond();
const history = ref(null);
const { state, ply, reviewPly } = game;
const rows = computed(() => {
  const result = [];
  for (const [index, move] of (state.value?.records || []).entries()) {
    if (result.at(-1)?.number !== move.number)
      result.push({ number: move.number, w: null, b: null });
    result.at(-1)[move.side] = { ...move, ply: index + 1 };
  }
  return result;
});
watch(
  () => [state.value?.id, state.value?.moves.join(' '), state.value?.phase].join('|'),
  async () => {
    await nextTick();
    if (reviewPly.value === null && history.value)
      history.value.scrollTop = history.value.scrollHeight;
  }
);
watch(ply, async () => {
  await nextTick();
  history.value?.querySelector('.move.active')?.scrollIntoView({ block: 'nearest' });
});
</script>

<template>
  <div class="history-heading">
    <span></span>
    <span>White</span>
    <span>Black</span>
  </div>
  <div id="history" ref="history" class="history">
    <div v-for="row in rows" :key="row.number" class="history-row">
      <span class="move-number">{{ row.number }}.</span>
      <template v-for="side in ['w', 'b']" :key="side">
        <button
          v-if="row[side]"
          class="move"
          :class="{ active: row[side].ply === ply }"
          :data-ply="row[side].ply"
          :title="row[side].uci"
          :aria-current="row[side].ply === ply"
          :aria-label="`${row.number}. ${sideName(side)} ${row[side].san}${row[side].duck ? ', duck ' + row[side].duck : ''}`"
          @click="game.review(row[side].ply)"
        >
          <span>{{ row[side].san }}</span>
          <span v-if="row[side].duck" class="duck-notation">@{{ row[side].duck }}</span>
        </button>
        <span v-else></span>
      </template>
    </div>
  </div>
</template>

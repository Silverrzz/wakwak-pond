<script setup>
import { computed } from 'vue';
import { usePond } from '../shared/context';
import { formatScore } from '../shared/format';

const { game } = usePond();
const principal = computed(
  () =>
    [...(game.analysis.value.search?.rows || [])]
      .filter((row) => (row.multipv || 1) === 1 && row.score !== undefined)
      .sort((a, b) => b.depth - a.depth)[0]
);
const whiteShare = computed(() => {
  const position = game.analysis.value.frame;
  if (position?.result) return position.winner === 'w' ? 100 : position.winner === 'b' ? 0 : 50;
  const row = principal.value;
  if (!row) return 50;
  if (row.scoreType === 'mate') return row.mateWinner === 'w' ? 100 : 0;
  return 50 + 50 * Math.tanh(row.score / 600);
});
const label = computed(
  () => game.analysis.value.frame?.result || `White evaluation: ${formatScore(principal.value)}`
);
</script>

<template>
  <div class="evaluation-bar" role="img" :aria-label="label" :title="label">
    <div
      class="evaluation-bar-white"
      :class="{ flipped: game.flipped.value }"
      :style="{ height: whiteShare + '%' }"
    ></div>
    <span class="evaluation-bar-midpoint" aria-hidden="true"></span>
  </div>
</template>

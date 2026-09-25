<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { usePond } from '../shared/context';
import { formatClock, sideName, timeDescription } from '../shared/format';

const props = defineProps({ side: { type: String, required: true } });
const { game } = usePond();
const now = ref(performance.now());
let timer;
const display = computed(() => {
  const clock = game.clock.value?.[props.side];
  if (game.analysis.value.enabled)
    return { time: '-', detail: 'Analysis', running: false, low: false };
  if (!clock) return { time: '5:00', detail: '', running: false, low: false };
  const elapsed = Math.max(0, now.value - game.clockReceived.value);
  const running = clock.running && game.state.value?.phase === 'playing';
  const charge = running
    ? clock.kind === 'delay'
      ? Math.max(0, elapsed - clock.delay)
      : elapsed
    : 0;
  const remaining = clock.remaining === null ? null : Math.max(0, clock.remaining - charge);
  const detail = [];
  if (running && clock.delay > elapsed)
    detail.push('Delay ' + ((clock.delay - elapsed) / 1000).toFixed(1));
  else if (clock.bonus)
    detail.push(
      (clock.kind === 'increment' ? '+' : clock.kind === 'bronstein' ? 'Refund ' : 'Delay ') +
        clock.bonus / 1000 +
        's'
    );
  if (clock.movesToGo) detail.push(clock.movesToGo + ' moves to stage ' + (clock.stage + 2));
  return {
    time: formatClock(remaining),
    detail: detail.join('\n'),
    running,
    low: remaining !== null && remaining < 10000 && game.state.value?.phase !== 'ready'
  };
});
const name = computed(
  () =>
    sideName(props.side) +
    (game.state.value?.config[props.side] === 'human' ? '' : ' · ' + game.names.value[props.side])
);
const description = computed(() =>
  game.clock.value ? timeDescription(game.clock.value.controls[props.side]) : ''
);
onMounted(() => {
  timer = setInterval(() => {
    now.value = performance.now();
  }, 50);
});
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <div class="player-bar" :class="{ active: display.running, low: display.low }">
    <strong class="player-name">{{ name }}</strong>
    <div class="clock-group">
      <span class="clock-detail">{{ display.detail }}</span>
      <output class="clock" :aria-label="sideName(side) + ' clock'" :title="description">
        {{ display.time }}
      </output>
    </div>
  </div>
</template>

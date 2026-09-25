<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { EvaluationGraph } from '../graph/EvaluationGraph';

const props = defineProps({ output: { type: Object, required: true } });
const emit = defineEmits(['review']);
const canvas = ref(null);
const tooltip = ref(null);
const plot = ref(null);
const scale = ref('auto');
let graph;
let observer;
function update() {
  graph?.update(props.output.state, props.output.ply, scale.value);
}
watch([() => props.output, scale], update, { flush: 'post' });
onMounted(() => {
  graph = new EvaluationGraph(canvas.value, tooltip.value);
  observer = new ResizeObserver(() => graph.draw());
  observer.observe(plot.value);
  update();
});
onUnmounted(() => observer?.disconnect());
</script>

<template>
  <section class="graph-panel" aria-label="Evaluation history">
    <div class="dock-heading">
      <h2>{{ output.state?.analysisActive ? 'Analysis evaluations' : 'Evaluation' }}</h2>
      <span class="graph-perspective">White’s perspective</span>
      <div class="graph-legend">
        <span class="legend-w">White</span>
        <span class="legend-b">Black</span>
      </div>
      <select id="graph-scale" v-model="scale" aria-label="Evaluation graph range">
        <option value="auto">Auto</option>
        <option value="2">±2</option>
        <option value="5">±5</option>
        <option value="10">±10</option>
      </select>
    </div>
    <div id="graph-plot" ref="plot" class="graph-plot">
      <canvas
        id="eval-graph"
        ref="canvas"
        tabindex="0"
        role="img"
        aria-label="Evaluation history. Click a point to review the position; use arrow keys to navigate."
        @pointermove="graph?.pointerMove($event)"
        @pointerleave="graph?.pointerLeave()"
        @click="graph?.hover && emit('review', graph.hover.point.ply)"
      ></canvas>
      <div id="graph-empty" class="graph-empty" :hidden="!!output.state?.evaluations?.length">
        No evaluations
      </div>
      <output id="graph-tooltip" ref="tooltip" class="graph-tooltip" hidden></output>
    </div>
  </section>
</template>

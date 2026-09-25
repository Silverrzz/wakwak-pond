<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { compactNumber, formatScore, positionLabel, searchTime, sideName } from '../shared/format';

const props = defineProps({
  channel: String,
  state: Object,
  search: Object,
  name: String,
  showHeading: { type: Boolean, default: true },
  inlineVariation: Boolean,
  idPrefix: { type: String, default: 'search' }
});
const selected = ref(null);
const variation = ref(null);
const columns = [
  ['Depth', 'Depth / selective depth; principal variation number when greater than one'],
  ['Score', 'Pawns, from White’s perspective'],
  ['Time', 'Elapsed search time'],
  ['Nodes', 'Searched nodes'],
  ['N/s', 'Nodes per second'],
  ['Principal variation', 'Piece move @ duck square']
];
const source = computed(() => props.search?.source || props.name);
const live = computed(
  () =>
    props.search?.active &&
    props.state?.searches?.[props.channel]?.id === props.search.id &&
    props.state.searches[props.channel].active
);
const rows = computed(() =>
  [...(props.search?.rows || [])].sort(
    (a, b) => b.depth - a.depth || (a.multipv || 1) - (b.multipv || 1)
  )
);
const key = (row) => `${props.search.id}:${row.depth}:${row.multipv || 1}`;
const selectedRow = computed(() => rows.value.find((row) => key(row) === selected.value));
const status = computed(() => {
  const search = props.search;
  const parts = [];
  if (search?.latest?.hashfull !== undefined)
    parts.push('Hash ' + (search.latest.hashfull / 10).toFixed(1) + '%');
  if (search?.latest?.tbhits !== undefined)
    parts.push('TB hits ' + compactNumber(search.latest.tbhits));
  if (search?.active && search.latest?.currmove)
    parts.push(search.latest.currmove.replace(/,([a-h][1-8])([a-h][1-8])/g, '@$2'));
  return parts.join('   ·   ');
});
async function select(row) {
  selected.value = selected.value === key(row) ? null : key(row);
  await nextTick();
  if (!props.inlineVariation) variation.value?.focus({ preventScroll: true });
}
watch(
  () => props.state?.id,
  () => {
    selected.value = null;
  }
);
</script>

<template>
  <section
    :id="idPrefix + '-' + channel"
    class="search-pane"
    :aria-label="sideName(channel) + ' engine output'"
  >
    <div v-if="showHeading" class="search-heading" :class="{ searching: live }">
      <strong class="search-name" :title="source">
        {{ sideName(channel) + (source ? ' · ' + source : '') }}
      </strong>
      <span class="search-position">{{ search ? positionLabel(state, search.ply) : '' }}</span>
    </div>
    <div class="search-scroll">
      <table class="search-table" :aria-label="sideName(channel) + ' search depths'">
        <thead>
          <tr>
            <th v-for="[label, title] in columns" :key="label" scope="col" :title="title">
              {{ label }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="key(row)"
            tabindex="0"
            :class="{
              'selected-row': selected === key(row),
              'expanded-variation': inlineVariation && selected === key(row)
            }"
            :aria-expanded="selected === key(row)"
            @click="select(row)"
            @keydown.enter.prevent="select(row)"
            @keydown.space.prevent="select(row)"
          >
            <td>
              {{
                row.depth +
                (row.seldepth !== undefined ? '/' + row.seldepth : '') +
                (row.multipv > 1 ? ' #' + row.multipv : '')
              }}
            </td>
            <td>{{ formatScore(row) }}</td>
            <td :title="row.time === undefined ? '' : row.time.toLocaleString() + ' ms'">
              {{ searchTime(row.time) }}
            </td>
            <td :title="row.nodes?.toLocaleString() || ''">{{ compactNumber(row.nodes) }}</td>
            <td :title="row.nps?.toLocaleString() || ''">{{ compactNumber(row.nps) }}</td>
            <td :title="row.pv || ''">{{ row.pv || '' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div
      v-if="!inlineVariation"
      ref="variation"
      class="search-variation"
      :hidden="!selectedRow?.pv"
      tabindex="0"
      aria-label="Selected principal variation"
    >
      {{ selectedRow?.pv || '' }}
    </div>
    <div class="search-status">{{ status }}</div>
  </section>
</template>

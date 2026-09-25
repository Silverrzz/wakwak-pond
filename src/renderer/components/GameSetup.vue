<script setup>
import { computed, ref } from 'vue';
import AppDialog from './AppDialog.vue';
import ClockEditor from './ClockEditor.vue';
import { defaultControl, presetControl } from '../shared/controls';
import { pieceSource } from '../shared/format';
const open = defineModel({ type: Boolean, default: false });
const props = defineProps({ busy: Boolean, supported: Boolean });
const emit = defineEmits(['start']);
const side = ref('w');
const preset = ref('unlimited');
const seconds = ref(2);
const separate = ref(false);
const white = ref(defaultControl());
const black = ref(defaultControl());
const presets = [
  ['unlimited', 'Untimed'],
  ['3+2', '3 + 2'],
  ['5+3', '5 + 3'],
  ['10+0', '10 + 0'],
  ['15+10', '15 + 10'],
  ['custom', 'Custom']
];
const description = computed(() => {
  if (preset.value === 'custom') return '';
  if (preset.value === 'unlimited') return 'No game clock.';
  const [minutes, increment] = preset.value.split('+');
  return `${minutes} minutes per side${Number(increment) ? `, with ${increment} seconds added per move` : ''}.`;
});
function start() {
  if (props.busy || !props.supported) return;
  const control =
    preset.value === 'custom' ? white.value : presetControl(preset.value, 5, seconds.value);
  emit('start', {
    side: side.value,
    controls: JSON.parse(
      JSON.stringify({
        w: control,
        b: preset.value === 'custom' && separate.value ? black.value : control
      })
    )
  });
}
</script>

<template>
  <AppDialog v-model="open" :busy="busy" labelledby="new-game-title" class="web-setup">
    <form @submit.prevent="start">
      <div class="dialog-heading">
        <h2 id="new-game-title">Play WakWak</h2>
        <button type="button" :disabled="busy" aria-label="Close" @click="open = false">×</button>
      </div>
      <fieldset :disabled="busy">
        <legend>Play as</legend>
        <div class="side-options">
          <button
            v-for="choice in [
              ['w', 'White'],
              ['random', 'Random'],
              ['b', 'Black']
            ]"
            :key="choice[0]"
            type="button"
            :aria-pressed="side === choice[0]"
            @click="side = choice[0]"
          >
            <span class="side-pieces">
              <svg
                v-if="choice[0] === 'random'"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path
                  d="M3 6h3c5 0 7 12 12 12h3m-4-4 4 4-4 4M3 18h3c2 0 3.5-2 5-4.5M13 10.5C14.5 8 16 6 18 6h3m-4-4 4 4-4 4"
                />
              </svg>
              <img v-else :src="pieceSource(choice[0] === 'w' ? 'K' : 'k')" alt="" />
            </span>
            {{ choice[1] }}
          </button>
        </div>
      </fieldset>
      <fieldset :disabled="busy">
        <legend>Time control</legend>
        <div class="time-presets">
          <button
            v-for="[value, label] in presets"
            :key="value"
            type="button"
            :aria-pressed="preset === value"
            @click="preset = value"
          >
            {{ label }}
          </button>
        </div>
        <p v-if="description" class="clock-description">{{ description }}</p>
        <label v-if="preset === 'unlimited'" class="untimed-setting">
          Engine seconds per move
          <input
            v-model.number="seconds"
            type="number"
            min="0.01"
            max="3600"
            step="0.01"
            required
          />
        </label>
        <div v-if="preset === 'custom'" class="custom-clocks">
          <label class="separate-clocks">
            <input v-model="separate" type="checkbox" />
            Different clocks for each side
          </label>
          <ClockEditor
            v-model="white"
            side="w"
            :label="separate ? 'White' : 'Both sides'"
            :disabled="busy"
          />
          <ClockEditor v-if="separate" v-model="black" side="b" label="Black" :disabled="busy" />
        </div>
      </fieldset>
      <p v-if="!supported" class="inline-error" role="alert">
        WakWak requires shared-memory support. Open this site over HTTPS or localhost in a supported
        browser.
      </p>
      <div class="dialog-footer">
        <button type="button" :disabled="busy" @click="open = false">Cancel</button>
        <button class="primary" :disabled="busy || !supported">
          {{ busy ? 'Loading WakWak…' : 'Start game' }}
        </button>
      </div>
    </form>
  </AppDialog>
</template>

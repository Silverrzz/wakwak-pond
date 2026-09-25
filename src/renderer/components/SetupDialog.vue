<script setup>
import { computed, onUnmounted, reactive, ref, watch } from 'vue';
import { usePond } from '../shared/context';
import { clone } from '../shared/format';
import { defaultControl, presetControl, timePresets, variants } from '../shared/controls';
import AppDialog from './AppDialog.vue';
import ClockEditor from './ClockEditor.vue';
import PieceImage from './PieceImage.vue';
import SelectField from './SelectField.vue';

const open = defineModel({ type: Boolean, default: false });
const { game, feedback, activeTab } = usePond();
const { catalog, state, clock, starting } = game;
const error = ref('');
const preview = ref(null);
const form = reactive({
  variant: 'duck',
  position: 518,
  blackPosition: 518,
  w: 'human',
  b: 'human',
  preset: '5+3',
  fixedSeconds: 5,
  engineSeconds: 1,
  source: 'generated',
  fen: '',
  separate: false,
  controls: { w: defaultControl(), b: defaultControl() }
});
const players = computed(() => [
  { value: 'human', label: 'Human' },
  ...catalog.value.map((engine) => ({ value: engine.id, label: engine.name }))
]);
const generated = computed(() => form.source === 'generated');
const previewPieces = computed(() => {
  if (!preview.value || !generated.value || form.variant === 'duck') return [];
  return (form.variant === 'duckdfrc' ? [7, 0] : [0]).flatMap((rank) =>
    preview.value.board.slice(rank * 8, rank * 8 + 8)
  );
});
let previewToken = 0;

function positionConfig() {
  return {
    variant: form.variant,
    position: Number(form.position),
    blackPosition: Number(form.blackPosition),
    fen: generated.value ? '' : form.fen.trim()
  };
}

async function previewPosition() {
  const token = ++previewToken;
  const config = positionConfig();
  if (!generated.value && !config.fen) {
    preview.value = null;
    error.value = '';
    return;
  }
  try {
    const frame = await window.pond.preview(config);
    if (token !== previewToken) return;
    preview.value = frame;
    error.value = '';
  } catch (failure) {
    if (token === previewToken) {
      preview.value = null;
      error.value = failure.message;
    }
  }
}

function load() {
  const current = state.value;
  if (!current) return;
  form.variant = current.variant;
  form.position = current.position;
  form.blackPosition = current.blackPosition;
  for (const side of ['w', 'b'])
    form[side] = catalog.value.some((engine) => engine.id === current.config[side])
      ? current.config[side]
      : 'human';
  form.source = (current.config.customPosition ?? !!current.config.fen) ? 'fen' : 'generated';
  form.fen = current.config.fen || '';
  form.controls = clone(clock.value.controls);
  const same = JSON.stringify(form.controls.w) === JSON.stringify(form.controls.b);
  form.separate = !same;
  form.preset = 'custom';
  const control = form.controls.w;
  if (same && control.mode === 'unlimited') {
    form.preset = 'unlimited';
    form.engineSeconds = control.engineTime / 1000;
  }
  if (same && control.mode === 'movetime') {
    form.preset = 'movetime';
    form.fixedSeconds = control.milliseconds / 1000;
  }
  if (
    same &&
    control.mode === 'clock' &&
    control.stages.length === 1 &&
    control.stages[0].kind === 'increment'
  ) {
    const stage = control.stages[0],
      candidate = stage.time / 60000 + '+' + stage.bonus / 1000;
    if (timePresets.some((preset) => preset.value === candidate)) form.preset = candidate;
  }
  error.value = '';
  preview.value = null;
}

function randomize() {
  form.position = Math.floor(Math.random() * 960);
  if (form.variant === 'duckdfrc') form.blackPosition = Math.floor(Math.random() * 960);
}

async function start() {
  if (starting.value) return;
  starting.value = true;
  error.value = '';
  try {
    const controls =
      form.preset === 'custom'
        ? { w: clone(form.controls.w), b: clone(form.controls[form.separate ? 'b' : 'w']) }
        : {
            w: presetControl(form.preset, form.fixedSeconds, form.engineSeconds),
            b: presetControl(form.preset, form.fixedSeconds, form.engineSeconds)
          };
    const config = { ...positionConfig(), w: form.w, b: form.b, controls };
    if (!generated.value && !config.fen) throw new Error('Paste a starting FEN.');
    await window.pond.start(config);
    open.value = false;
    game.resetReview();
    activeTab.value = 'moves';
    if (config.w !== 'human' && config.b === 'human') game.flip(true);
  } catch (failure) {
    error.value = failure.message;
  } finally {
    starting.value = false;
  }
}

watch(open, (value) => {
  if (value) {
    load();
    feedback.target.value = error;
    void previewPosition();
  } else {
    previewToken++;
    if (feedback.target.value === error) feedback.target.value = null;
  }
});
watch(
  () => [form.variant, form.source, form.position, form.blackPosition, form.fen],
  () => {
    if (open.value) void previewPosition();
  }
);
watch(catalog, () => {
  for (const side of ['w', 'b'])
    if (!players.value.some((player) => player.value === form[side])) form[side] = 'human';
});
onUnmounted(() => {
  previewToken++;
});
</script>

<template>
  <AppDialog
    id="setup-dialog"
    v-model="open"
    class="setup-dialog"
    labelledby="setup-title"
    :busy="starting"
  >
    <form id="setup-form" @submit.prevent="start">
      <div class="dialog-heading"><h2 id="setup-title">New game</h2></div>
      <div class="setup-fields">
        <SelectField id="variant" v-model="form.variant" label="Variant" :options="variants" />
        <SelectField id="white" v-model="form.w" label="White" :options="players" />
        <SelectField id="black" v-model="form.b" label="Black" :options="players" />
        <SelectField id="time-preset" v-model="form.preset" label="Clock" :options="timePresets" />
        <div id="fixed-time" class="inline-field" :hidden="form.preset !== 'movetime'">
          <label for="fixed-seconds">Seconds / turn</label>
          <input
            id="fixed-seconds"
            v-model="form.fixedSeconds"
            type="number"
            min="0.01"
            max="3600"
            step="0.01"
            :disabled="form.preset !== 'movetime'"
          />
        </div>
        <div id="unlimited-time" :hidden="form.preset !== 'unlimited'">
          <div class="inline-field">
            <label for="engine-seconds">Engine sec / move</label>
            <input
              id="engine-seconds"
              v-model="form.engineSeconds"
              type="number"
              min="0.01"
              max="3600"
              step="0.01"
              :disabled="form.preset !== 'unlimited'"
            />
          </div>
        </div>
        <div id="advanced-time" :hidden="form.preset !== 'custom'">
          <label class="checkbox-label">
            <input
              id="separate-clocks"
              v-model="form.separate"
              type="checkbox"
              :disabled="form.preset !== 'custom'"
            />
            Separate clocks
          </label>
          <ClockEditor
            id="white-control"
            v-model="form.controls.w"
            side="w"
            :label="form.separate ? 'White' : 'Both'"
            :disabled="form.preset !== 'custom'"
          />
          <ClockEditor
            id="black-control"
            v-model="form.controls.b"
            side="b"
            label="Black"
            :hidden="!form.separate"
            :disabled="form.preset !== 'custom' || !form.separate"
          />
        </div>
        <SelectField
          id="position-source"
          v-model="form.source"
          label="Position"
          :options="[
            { value: 'generated', label: 'Start position' },
            { value: 'fen', label: 'FEN' }
          ]"
        />
        <div
          id="random-position"
          class="random-position"
          :hidden="form.variant === 'duck' || !generated"
        >
          <label id="white-position-label">
            {{ form.variant === 'duckdfrc' ? 'White #' : 'Position #' }}
            <input
              id="position-number"
              v-model="form.position"
              type="number"
              min="0"
              max="959"
              step="1"
              :disabled="!generated || form.variant === 'duck'"
            />
          </label>
          <label id="black-position-label" :hidden="form.variant !== 'duckdfrc'">
            Black #
            <input
              id="black-position-number"
              v-model="form.blackPosition"
              type="number"
              min="0"
              max="959"
              step="1"
              :disabled="!generated || form.variant !== 'duckdfrc'"
            />
          </label>
          <button id="randomize" type="button" @click="randomize">Random</button>
        </div>
        <div id="fen-field" :hidden="generated">
          <textarea
            id="start-fen"
            v-model="form.fen"
            rows="3"
            spellcheck="false"
            aria-label="Starting FEN"
            placeholder="FEN"
            title="Six-field FEN; * is the duck."
            :required="!generated"
            :disabled="generated"
          ></textarea>
        </div>
        <div
          id="preview-board"
          class="backrank"
          aria-label="Starting back rank"
          :hidden="!previewPieces.length"
        >
          <span v-for="(piece, index) in previewPieces" :key="index">
            <PieceImage :piece="piece" />
          </span>
        </div>
      </div>
      <p id="setup-error" class="form-error" role="alert" :hidden="!error">{{ error }}</p>
      <div class="dialog-footer">
        <button type="button" @click="!starting && (open = false)">Cancel</button>
        <button id="start-game" type="submit" class="primary" :disabled="starting">
          {{ starting ? 'Starting…' : 'Start' }}
        </button>
      </div>
    </form>
  </AppDialog>
</template>

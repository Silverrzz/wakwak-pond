<script setup>
import { computed, nextTick, onUnmounted, ref, shallowRef, watch } from 'vue';
import { usePond } from '../shared/context';
import AppDialog from './AppDialog.vue';
import EngineOption from './EngineOption.vue';

const open = defineModel({ type: Boolean, default: false });
const { game, feedback } = usePond();
const { catalog, logs, directory } = game;
const current = ref(null);
const details = shallowRef(null);
const settings = ref({});
const error = ref('');
const loading = ref(false);
const saving = ref(false);
const optionsForm = ref(null);
const logElement = ref(null);
let inspection = 0;
const managed = new Set([
  'UCI_Variant',
  'UCI_Chess960',
  'UseDumbInterface',
  'SoftTarget',
  'Minimal',
  'Ponder'
]);
const options = computed(
  () =>
    details.value?.options.filter(
      (option) => !managed.has(option.name) && option.type !== 'button'
    ) || []
);

function optionValue(option, defaults = false) {
  const value = defaults
    ? option.default || ''
    : (details.value.settings[option.name] ?? option.default ?? '');
  return option.type === 'check' ? String(value) === 'true' : String(value);
}

async function inspect(id) {
  const token = ++inspection;
  current.value = id;
  loading.value = true;
  details.value = null;
  const result = await feedback.action(() => window.pond.inspectEngine(id), error);
  if (token !== inspection) return;
  loading.value = false;
  if (!result) return;
  details.value = result;
  settings.value = Object.fromEntries(
    options.value.map((option) => [option.name, optionValue(option)])
  );
}

async function save() {
  if (saving.value || !optionsForm.value.reportValidity()) return;
  const id = current.value;
  const values = Object.fromEntries(
    options.value.map((option) => [option.name, String(settings.value[option.name])])
  );
  saving.value = true;
  try {
    await feedback.action(async () => {
      catalog.value = await window.pond.engineSettings({ id, settings: values });
      feedback.notify('Engine options saved');
    }, error);
  } finally {
    saving.value = false;
  }
}

function defaults() {
  settings.value = Object.fromEntries(
    options.value.map((option) => [option.name, optionValue(option, true)])
  );
}
function add(kind) {
  return feedback.action(async () => {
    const engines = await window.pond.addEngine(kind);
    if (engines) {
      catalog.value = engines;
      feedback.notify('Engine added');
    }
  }, error);
}
function refresh() {
  return feedback.action(async () => {
    catalog.value = await window.pond.scan();
    feedback.notify('Engine list refreshed');
  }, error);
}
function folder() {
  return feedback.action(() => window.pond.folder(), error);
}

watch(open, (value) => {
  if (value) {
    feedback.target.value = error;
    if (!current.value && catalog.value.length) void inspect(catalog.value.at(-1).id);
  } else if (feedback.target.value === error) feedback.target.value = null;
});
watch(catalog, (engines) => {
  if (!current.value || engines.some((engine) => engine.id === current.value)) return;
  inspection++;
  current.value = null;
  details.value = null;
  loading.value = false;
});
watch(logs, async () => {
  const element = logElement.value;
  const atEnd = element && element.scrollHeight - element.scrollTop - element.clientHeight < 35;
  await nextTick();
  if (atEnd) element.scrollTop = element.scrollHeight;
});
onUnmounted(() => {
  inspection++;
});
</script>

<template>
  <AppDialog id="engines-dialog" v-model="open" class="engines-dialog" labelledby="engines-title">
    <div class="dialog-heading">
      <h2 id="engines-title">Engines</h2>
      <button aria-label="Close engines" @click="open = false">×</button>
    </div>
    <div class="engine-toolbar">
      <button id="add-engine" @click="add('file')">Add engine…</button>
      <button id="add-engine-folder" @click="add('folder')">Add folder…</button>
      <button id="refresh-engines" @click="refresh">Refresh</button>
      <button id="engine-folder" @click="folder">Folder</button>
    </div>
    <div class="engine-layout">
      <div id="engine-list" class="engine-list" aria-label="Installed engines">
        <button
          v-for="engine in catalog"
          :key="engine.id"
          class="quiet"
          :class="{ active: current === engine.id }"
          :title="engine.file"
          @click="inspect(engine.id)"
        >
          {{ engine.name }}
        </button>
        <p v-if="!catalog.length" class="hint">No engines</p>
      </div>
      <div id="engine-detail" class="engine-detail">
        <p v-if="loading" class="hint">Loading…</p>
        <template v-else-if="details">
          <h3>{{ details.name }}</h3>
          <div class="engine-capabilities">
            <span>{{ details.duck ? '✓ Duck' : 'Duck unsupported' }}</span>
            <span>{{ details.chess960 ? '✓ Duck960 / double FRC' : '960 unsupported' }}</span>
          </div>
          <form ref="optionsForm" @submit.prevent="save">
            <div class="engine-options">
              <EngineOption
                v-for="option in options"
                :key="option.name"
                v-model="settings[option.name]"
                :option="option"
              />
            </div>
            <div class="engine-save">
              <button
                class="primary"
                type="submit"
                title="Applies at the next engine start"
                :disabled="saving"
              >
                Apply
              </button>
              <button class="quiet" type="button" @click="defaults">Defaults</button>
            </div>
          </form>
        </template>
      </div>
    </div>
    <p id="engine-error" class="form-error" role="alert" :hidden="!error">{{ error }}</p>
    <details class="engine-log">
      <summary>
        UCI log
        <span id="log-count">{{ logs.length }}</span>
      </summary>
      <pre id="logs" ref="logElement">{{ logs.join('\n') }}</pre>
    </details>
    <p class="hint">
      All engines live in this folder. Delete any engine folder, then refresh to remove it.
    </p>
    <p id="directory" class="directory">{{ directory }}</p>
  </AppDialog>
</template>

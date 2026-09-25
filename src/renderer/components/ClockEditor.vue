<script setup>
import { bonusTypes, clockModes, defaultControl } from '../shared/controls';
import { sideName } from '../shared/format';
import NumberField from './NumberField.vue';

defineProps({ side: String, label: String, disabled: Boolean });
const control = defineModel({ type: Object, required: true });
function setMode(event) {
  const mode = event.target.value;
  control.value =
    mode === 'clock'
      ? defaultControl()
      : mode === 'movetime'
        ? { mode, milliseconds: 5000 }
        : { mode, engineTime: 1000 };
}
function addStage() {
  control.value.stages.at(-1).moves = 40;
  control.value.stages.push({ moves: 0, time: 1800000, kind: 'increment', bonus: 30000 });
}
function removeStage(index) {
  control.value.stages.splice(index, 1);
  control.value.stages.at(-1).moves = 0;
}
</script>

<template>
  <div class="control-editor">
    <div class="control-heading">
      <strong>{{ label }}</strong>
      <button
        v-if="control.mode === 'clock'"
        type="button"
        class="quiet"
        :disabled="control.stages.length >= 8"
        @click="addStage"
      >
        + Add stage
      </button>
    </div>
    <select
      class="control-mode"
      :value="control.mode"
      :aria-label="sideName(side) + ' clock mode'"
      :disabled="disabled"
      @change="setMode"
    >
      <option v-for="mode in clockModes" :key="mode.value" :value="mode.value">
        {{ mode.label }}
      </option>
    </select>
    <NumberField
      v-if="control.mode !== 'clock'"
      v-model="control[control.mode === 'movetime' ? 'milliseconds' : 'engineTime']"
      :label="control.mode === 'movetime' ? 'Seconds per turn' : 'Engine seconds per move'"
      :factor="1000"
      :min="0.01"
      :max="3600"
      field="seconds"
      :side="side"
      :stage="0"
      :disabled="disabled"
    />
    <template v-else>
      <div v-for="(stage, index) in control.stages" :key="index" class="stage">
        <div class="stage-heading">
          <span>
            Stage {{ index + 1 }}{{ index === control.stages.length - 1 ? ' · Rest of game' : '' }}
          </span>
          <button
            v-if="control.stages.length > 1"
            class="quiet"
            type="button"
            @click="removeStage(index)"
          >
            Remove
          </button>
        </div>
        <div class="stage-grid">
          <NumberField
            v-model="stage.moves"
            label="Moves"
            :min="index === control.stages.length - 1 ? 0 : 1"
            :max="1000"
            step="1"
            field="moves"
            :side="side"
            :stage="index"
            :disabled="disabled || index === control.stages.length - 1"
          />
          <NumberField
            v-model="stage.time"
            :label="index ? 'Add min' : 'Minutes'"
            :factor="60000"
            :min="index ? 0 : 1 / 60"
            :max="10080"
            field="time"
            :side="side"
            :stage="index"
            :disabled="disabled"
          />
          <label>
            Bonus type
            <select v-model="stage.kind" data-field="kind" :disabled="disabled">
              <option v-for="kind in bonusTypes" :key="kind.value" :value="kind.value">
                {{ kind.label }}
              </option>
            </select>
          </label>
          <NumberField
            v-model="stage.bonus"
            label="Seconds"
            :factor="1000"
            :min="0"
            :max="3600"
            field="bonus"
            :side="side"
            :stage="index"
            :disabled="disabled"
          />
        </div>
      </div>
    </template>
  </div>
</template>

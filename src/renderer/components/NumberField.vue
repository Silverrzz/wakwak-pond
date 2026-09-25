<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  label: String,
  min: [Number, String],
  max: [Number, String],
  step: { type: [Number, String], default: 'any' },
  disabled: Boolean,
  factor: { type: Number, default: 1 },
  field: String,
  side: String,
  stage: Number
});
const model = defineModel();
const draft = ref(String(model.value / props.factor));
watch(model, (value) => {
  const current = Number(draft.value) * props.factor;
  if (value !== (props.factor === 1 ? current : Math.round(current)))
    draft.value = String(value / props.factor);
});
function update(event) {
  draft.value = event.target.value;
  const value = Number(draft.value) * props.factor;
  model.value = props.factor === 1 ? value : Math.round(value);
}
</script>

<template>
  <label>
    {{ label }}
    <input
      type="number"
      :value="draft"
      :min="min"
      :max="max"
      :step="step"
      :disabled="disabled"
      :data-field="field"
      :data-side="side"
      :data-stage="stage"
      required
      @input="update"
    />
  </label>
</template>

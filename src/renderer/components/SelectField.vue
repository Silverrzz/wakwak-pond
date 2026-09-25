<script setup>
defineProps({
  id: String,
  label: String,
  options: { type: Array, required: true },
  disabled: Boolean
});
const model = defineModel();
</script>

<template>
  <label class="form-row">
    {{ label }}
    <select :id="id" v-model="model" :disabled="disabled">
      <option v-for="option in options" :key="option.value" :value="option.value">
        {{ option.label }}
      </option>
    </select>
  </label>
</template>

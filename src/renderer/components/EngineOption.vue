<script setup>
defineProps({ option: { type: Object, required: true } });
const model = defineModel();
</script>

<template>
  <label
    :class="{ 'checkbox-label': option.type === 'check' }"
    :title="option.type === 'spin' ? `${option.min} to ${option.max}` : undefined"
  >
    <template v-if="option.type === 'check'">
      <input v-model="model" type="checkbox" :data-option="option.name" />
      {{ option.name }}
    </template>
    <template v-else>
      {{ option.name }}
      <select v-if="option.type === 'combo'" v-model="model" :data-option="option.name">
        <option v-for="value in option.vars" :key="value" :value="value">
          {{ value }}
        </option>
      </select>
      <input
        v-else
        v-model="model"
        :type="option.type === 'spin' ? 'number' : 'text'"
        :min="option.type === 'spin' ? option.min : undefined"
        :max="option.type === 'spin' ? option.max : undefined"
        :step="option.type === 'spin' ? '1' : undefined"
        :required="option.type === 'spin'"
        :data-option="option.name"
      />
    </template>
  </label>
</template>

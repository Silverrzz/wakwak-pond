<script setup>
defineProps({ id: String, label: String, orientation: { type: String, default: 'vertical' } });
</script>

<template>
  <div
    :id="id"
    class="splitter"
    :class="orientation"
    role="separator"
    :aria-label="label"
    :aria-orientation="orientation"
    tabindex="0"
  ></div>
</template>

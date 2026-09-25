<script setup>
import AppDialog from './AppDialog.vue';

defineProps({ confirmation: Object });
const emit = defineEmits(['confirm']);
const open = defineModel({ type: Boolean, default: false });
</script>

<template>
  <AppDialog id="confirm-dialog" v-model="open" class="confirm-dialog" labelledby="confirm-title">
    <h2 id="confirm-title">{{ confirmation?.title }}</h2>
    <p id="confirm-description">{{ confirmation?.description }}</p>
    <div class="dialog-footer">
      <button id="confirm-cancel" @click="open = false">Cancel</button>
      <button
        id="confirm-accept"
        class="primary"
        @click="
          open = false;
          emit('confirm');
        "
      >
        {{ confirmation?.label || 'Confirm' }}
      </button>
    </div>
  </AppDialog>
</template>

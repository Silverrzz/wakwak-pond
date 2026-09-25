<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue';

const props = defineProps({ id: String, labelledby: String, busy: Boolean });
const open = defineModel({ type: Boolean, default: false });
const element = ref(null);
function sync() {
  if (!element.value) return;
  if (open.value && !element.value.open) element.value.showModal();
  else if (!open.value && element.value.open) element.value.close();
}
function cancel(event) {
  if (props.busy) event.preventDefault();
}
watch(open, sync, { flush: 'post' });
onMounted(sync);
onUnmounted(() => element.value?.close());
</script>

<template>
  <dialog
    :id="id"
    ref="element"
    :aria-labelledby="labelledby"
    @cancel="cancel"
    @close="open = false"
  >
    <slot
      :close="
        () => {
          if (!busy) open = false;
        }
      "
    />
  </dialog>
</template>

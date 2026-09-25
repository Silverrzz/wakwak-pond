import { onUnmounted, ref, shallowRef } from 'vue';

export function useFeedback() {
  const error = ref('');
  const notification = ref('');
  const target = shallowRef(null);
  let timer;

  function showError(message, destination = target.value || error) {
    destination.value = message || '';
  }

  async function action(fn, destination) {
    try {
      showError('', destination);
      return await fn();
    } catch (failure) {
      showError(failure.message || String(failure), destination);
      return undefined;
    }
  }

  function notify(message) {
    clearTimeout(timer);
    notification.value = message;
    timer = setTimeout(() => {
      notification.value = '';
    }, 3000);
  }

  onUnmounted(() => clearTimeout(timer));
  return { error, notification, target, showError, action, notify };
}

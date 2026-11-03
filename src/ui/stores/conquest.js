import { defineStore } from 'pinia';
import { shallowRef, ref } from 'vue';

/** Presentation state; the campaign owner supplies all actions. */
export const useConquestStore = defineStore('conquest', () => {
  const match = shallowRef(null);
  const selected = ref(0);
  const origin = ref(0);
  const paused = ref(true);
  const loading = ref(false);
  const error = ref('');
  const mapError = ref(false);
  const handlers = {};
  function act(name, ...args) {
    handlers[name]?.(...args);
  }
  return {
    match,
    selected,
    origin,
    paused,
    loading,
    error,
    mapError,
    handlers,
    act,
  };
});

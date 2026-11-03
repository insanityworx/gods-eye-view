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
  const battlefield = shallowRef(null);
  const selectedUnits = ref([]);
  const selectedBuilding = ref(null);
  const buildTool = ref(null);
  const tacticalPaused = ref(false);
  const tacticalOrder = ref('move');
  const tacticalError = ref('');
  const hoverCell = ref(null);
  const handlers = {};
  function act(name, ...args) {
    handlers[name]?.(...args);
  }
  return {
    match,
    battlefield,
    selectedUnits,
    selectedBuilding,
    buildTool,
    tacticalPaused,
    tacticalOrder,
    tacticalError,
    hoverCell,
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

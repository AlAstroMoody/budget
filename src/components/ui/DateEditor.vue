<template>
  <div class="flex items-center gap-1">
    <input
      type="date"
      :value="displayValue"
      @change="onDateChange"
      class="border-none bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1"
      style="min-width: 120px"
    />
    <button
      @click="confirmChange"
      class="px-1 py-0.5 text-xs bg-green-500 text-white rounded hover:bg-green-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
      title="Подтвердить изменение даты"
      :disabled="!hasChanges"
    >
      ✓
    </button>
    <button
      @click="cancelChange"
      class="px-1 py-0.5 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
      title="Отменить изменение даты"
      :disabled="!hasChanges"
    >
      ✕
    </button>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";

const props = defineProps({
  value: {
    type: [Date, String],
    required: true,
  },
});

const emit = defineEmits(["update:value"]);

// Локальное значение для редактирования
const localValue = ref("");
const hasChanges = ref(false);

// Отображаемое значение
const displayValue = computed(() => {
  if (hasChanges.value) {
    return localValue.value;
  }

  if (props.value instanceof Date) {
    return props.value.toISOString().split("T")[0];
  }

  return new Date(props.value).toISOString().split("T")[0];
});

function onDateChange(event) {
  localValue.value = event.target.value;
  hasChanges.value = true;
}

function confirmChange() {
  if (hasChanges.value) {
    emit("update:value", localValue.value);
    hasChanges.value = false;
    localValue.value = "";
  }
}

function cancelChange() {
  hasChanges.value = false;
  localValue.value = "";
}
</script>

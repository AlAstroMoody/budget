<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    @click="$emit('close')"
  >
    <div
      class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
      @click.stop
    >
      <div class="p-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold text-gray-900">➕ Добавить транзакцию</h2>
          <button
            @click="$emit('close')"
            class="text-gray-400 hover:text-gray-600 transition-colors"
          >
            ✕
          </button>
        </div>

        <form @submit.prevent="handleSubmit" class="space-y-4">
          <!-- Дата -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Дата</label>
            <input
              v-model="form.date"
              type="date"
              required
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <!-- Описание -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Описание</label>
            <input
              v-model="form.description"
              type="text"
              required
              placeholder="Введите описание транзакции"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <!-- Сумма -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Сумма</label>
            <input
              v-model="form.amount"
              type="number"
              step="0.01"
              required
              placeholder="0.00"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p class="text-xs text-gray-500 mt-1">
              Положительная сумма = доход, отрицательная = расход
            </p>
          </div>

          <!-- Категория -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Категория</label>
            <CategorySelect
              v-model="form.category"
              :categories="categories"
              placeholder="Выберите категорию"
            />
          </div>

          <!-- Банк -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Банк</label>
            <select
              v-model="form.bank"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Выберите банк</option>
              <option value="Сбербанк">Сбербанк</option>
              <option value="Тинькофф">Тинькофф</option>
              <option value="Озон-банк">Озон-банк</option>
              <option value="Альфа-банк">Альфа-банк</option>
              <option value="Ручной ввод">Ручной ввод</option>
            </select>
          </div>

          <!-- Кнопки -->
          <div class="flex space-x-3 pt-4">
            <button
              type="button"
              @click="$emit('close')"
              class="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              :disabled="!isFormValid"
              :class="[
                'flex-1 px-4 py-2 rounded-lg font-medium transition-colors',
                isFormValid
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed',
              ]"
            >
              Добавить
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import CategorySelect from "./CategorySelect.vue";

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false,
  },
  categories: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(["close", "add-transaction"]);

const form = ref({
  date: "",
  description: "",
  amount: "",
  category: "",
  bank: "Ручной ввод",
});

// Валидация формы
const isFormValid = computed(() => {
  return (
    form.value.date &&
    form.value.description.trim() &&
    form.value.amount !== "" &&
    parseFloat(form.value.amount) !== 0
  );
});

// Сброс формы при открытии
watch(
  () => props.isOpen,
  (newValue) => {
    if (newValue) {
      // Устанавливаем текущую дату по умолчанию
      const today = new Date();
      form.value.date = today.toISOString().split("T")[0];
      form.value.description = "";
      form.value.amount = "";
      form.value.category = "";
      form.value.bank = "Ручной ввод";
    }
  }
);

function handleSubmit() {
  if (!isFormValid.value) return;

  const transaction = {
    date: form.value.date,
    description: form.value.description.trim(),
    amount: parseFloat(form.value.amount),
    category: form.value.category || "Прочее",
    bank: form.value.bank,
    raw: `Ручной ввод: ${form.value.description}`,
    meta: {
      source: "manual",
      addedAt: new Date().toISOString(),
    },
  };

  emit("add-transaction", transaction);
  emit("close");
}
</script>

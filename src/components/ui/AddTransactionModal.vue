<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    @click="$emit('close')"
  >
    <div
      class="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto"
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
            <UniversalSelect
              v-model="form.bank"
              :items="availableBanks"
              placeholder="Выберите банк"
              item-name="банк"
              :allow-add-new="true"
            />
          </div>

          <!-- Дата -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1"
              >Дата <span class="text-red-500">*</span></label
            >
            <input
              v-model="form.date"
              type="date"
              required
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <!-- Описание -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1"
              >Описание <span class="text-red-500">*</span></label
            >
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
            <label class="block text-sm font-medium text-gray-700 mb-1"
              >Сумма <span class="text-red-500">*</span></label
            >
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
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-100',
              ]"
            >
              Добавить
            </button>
          </div>

          <!-- Подсказка о обязательных полях -->
          <div class="text-xs text-gray-500 mt-2">
            <span class="text-red-500">*</span> - обязательные поля
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import CategorySelect from "./CategorySelect.vue";
import UniversalSelect from "./UniversalSelect.vue";

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false,
  },
  categories: {
    type: Array,
    default: () => [],
  },
  banks: {
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
  bank: "",
});

const availableBanks = computed(() => {
  const existingBanks = props.banks || [];

  if (existingBanks.length === 0) {
    return ["Наличные"];
  }

  return existingBanks.sort();
});

const isFormValid = computed(() => {
  const hasDate = !!form.value.date;
  const hasDescription = !!form.value.description.trim();
  const hasAmount = form.value.amount !== "" && parseFloat(form.value.amount) !== 0;

  return hasDate && hasDescription && hasAmount;
});

watch(
  () => props.isOpen,
  (newValue) => {
    if (newValue) {
      const today = new Date();
      form.value.date = today.toISOString().split("T")[0];
      form.value.description = "";
      form.value.amount = "";
      form.value.category = "";

      const availableBanksList = availableBanks.value;
      form.value.bank = availableBanksList.length > 0 ? availableBanksList[0] : "";
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
    bank: form.value.bank || "Наличные",
    raw: `${form.value.bank || "Наличные"}: ${form.value.description}`,
    meta: {
      source: "manual",
      addedAt: new Date().toISOString(),
    },
  };

  emit("add-transaction", transaction);
  emit("close");
}
</script>

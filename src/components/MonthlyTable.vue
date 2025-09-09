<template>
  <div
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
    @click="$emit('close')"
  >
    <div class="bg-white rounded-lg shadow-xl w-full max-h-[90vh] overflow-hidden" @click.stop>
      <!-- Заголовок -->
      <div class="flex justify-between items-center p-6 border-b">
        <h2 class="text-2xl font-bold text-gray-900">📊 Таблица расходов по месяцам</h2>
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2">
            <label class="text-sm text-gray-600">Год:</label>
            <select
              v-model="selectedYear"
              class="text-sm border rounded px-2 py-1"
              @change="filterByYear"
            >
              <option value="">Все годы</option>
              <option v-for="year in availableYears" :key="year" :value="year">
                {{ year }}
              </option>
            </select>
          </div>

          <button
            @click="$emit('close')"
            class="text-gray-400 hover:text-gray-600 text-2xl font-bold"
          >
            ×
          </button>
        </div>
      </div>

      <!-- Содержимое -->
      <div class="p-6 overflow-auto max-h-[calc(90vh-120px)]">
        <div v-if="!monthlyData || Object.keys(monthlyData).length === 0" class="text-center py-8">
          <p class="text-gray-500">Нет данных для отображения</p>
        </div>

        <div
          v-if="monthlyData && Object.keys(monthlyData).length > 0"
          class="mb-4 text-sm text-gray-600"
        >
          Всего транзакций: {{ props.transactions.length }} | Показано месяцев:
          {{ months.length }} | Категорий: {{ editableCategories.length }}
        </div>

        <div v-if="monthlyData && Object.keys(monthlyData).length > 0" class="overflow-x-auto">
          <table class="min-w-full border-collapse">
            <thead>
              <tr class="bg-gray-50">
                <th class="border px-3 py-2 text-left font-semibold text-gray-700">Категория</th>
                <th
                  v-for="month in months"
                  :key="month.key"
                  class="border px-3 py-2 text-center font-semibold text-gray-700"
                >
                  {{ month.label }}
                </th>
                <th class="border px-3 py-2 text-center font-semibold text-gray-700">Итого</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="category in editableCategories" :key="category" class="hover:bg-gray-50">
                <td class="border px-3 py-2 font-medium text-gray-900">
                  {{ category }}
                </td>
                <template v-for="month in months" :key="month.key">
                  <td
                    class="border px-2 py-2 text-right"
                    :class="getCellClass(getCategoryMonthTotal(month.key, category))"
                  >
                    {{ formatAmount(getCategoryMonthTotal(month.key, category)) }}
                  </td>
                </template>
                <td class="border px-2 py-2 text-right font-semibold bg-gray-100 text-gray-900">
                  {{ formatAmount(getCategoryTotal(category)) }}
                </td>
              </tr>
              <!-- Строка итогов -->
              <tr class="bg-gray-100 font-bold">
                <td class="border px-3 py-2 text-gray-900">ИТОГО</td>
                <template v-for="month in months" :key="month.key">
                  <td class="border px-2 py-2 text-right bg-gray-200 text-gray-900">
                    {{ formatAmount(getMonthTotal(month.key)) }}
                  </td>
                </template>
                <td class="border px-2 py-2 text-right bg-gray-300 text-gray-900">
                  {{ formatAmount(getGrandTotal()) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted } from "vue";
import { getCategoriesFromDb } from "../services/db";

const props = defineProps({
  transactions: {
    type: Array,
    default: () => [],
  },
});

defineEmits(["close"]);

const selectedYear = ref("");

// Редактируемые категории
const editableCategories = ref([]);

// Месяцы для отображения (динамически на основе данных)
const months = computed(() => {
  let monthKeys = Object.keys(monthlyData.value).sort();

  // Фильтруем по году, если выбран
  if (selectedYear.value) {
    monthKeys = monthKeys.filter((key) => key.startsWith(selectedYear.value + "-"));
  }

  const monthLabels = {
    "01": "Январь",
    "02": "Февраль",
    "03": "Март",
    "04": "Апрель",
    "05": "Май",
    "06": "Июнь",
    "07": "Июль",
    "08": "Август",
    "09": "Сентябрь",
    10: "Октябрь",
    11: "Ноябрь",
    12: "Декабрь",
  };

  return monthKeys.map((key) => {
    const [year, month] = key.split("-");
    return {
      key,
      label: `${monthLabels[month]} ${year}`,
      year,
      month,
    };
  });
});

// Доступные годы для фильтрации
const availableYears = computed(() => {
  const years = new Set();
  Object.keys(monthlyData.value).forEach((key) => {
    const year = key.split("-")[0];
    years.add(year);
  });
  return Array.from(years).sort();
});

// Группировка данных по месяцам и категориям
const monthlyData = computed(() => {
  const data = {};

  props.transactions.forEach((transaction) => {
    if (!transaction.date || !transaction.amount) return;

    const date = parseDate(transaction.date);

    // Проверяем, что дата валидна
    if (!date) {
      console.warn("Недопустимая дата для транзакции:", transaction);
      return;
    }

    const year = date.getFullYear();
    const monthKey = String(date.getMonth() + 1).padStart(2, "0");
    const yearMonthKey = `${year}-${monthKey}`;
    const category = transaction.category || "Прочее";

    if (!data[yearMonthKey]) {
      data[yearMonthKey] = {};
    }

    if (!data[yearMonthKey][category]) {
      data[yearMonthKey][category] = { income: 0, expense: 0 };
    }

    if (transaction.amount > 0) {
      data[yearMonthKey][category].income += transaction.amount;
    } else {
      data[yearMonthKey][category].expense += Math.abs(transaction.amount);
    }
  });

  return data;
});

// Вычисляем минимальные и максимальные значения для окрашивания
const incomeStats = computed(() => {
  const values = [];
  Object.values(monthlyData.value).forEach((monthData) => {
    Object.values(monthData).forEach((categoryData) => {
      if (categoryData.income > 0) {
        values.push(categoryData.income);
      }
    });
  });

  if (values.length === 0) return { min: 0, max: 0 };

  return {
    min: Math.min(...values),
    max: Math.max(...values),
  };
});

const expenseStats = computed(() => {
  const values = [];
  Object.values(monthlyData.value).forEach((monthData) => {
    Object.values(monthData).forEach((categoryData) => {
      if (categoryData.expense > 0) {
        values.push(categoryData.expense);
      }
    });
  });

  if (values.length === 0) return { min: 0, max: 0 };

  return {
    min: Math.min(...values),
    max: Math.max(...values),
  };
});

// Категории из базы данных
const dbCategories = ref([]);

// Получаем уникальные категории
const categories = computed(() => {
  // Объединяем категории из БД с категориями из транзакций
  const transactionCategories = Array.from(
    new Set(props.transactions.map((t) => t.category))
  ).filter(Boolean);

  const allCategories = [...new Set([...dbCategories.value, ...transactionCategories])];
  return allCategories.sort();
});

// Загружаем категории из БД при монтировании компонента
onMounted(async () => {
  await refreshCategoriesFromDb();
});

// Функция для обновления категорий из БД
async function refreshCategoriesFromDb() {
  try {
    const categories = await getCategoriesFromDb();
    if (categories) {
      dbCategories.value = categories;
      // Принудительно обновляем editableCategories
      editableCategories.value = [...categories];
    }
  } catch (error) {
    console.error("Ошибка при загрузке категорий из БД:", error);
  }
}

// Инициализируем редактируемые категории - только те, в которых есть транзакции
const initEditableCategories = () => {
  // Показываем только категории, в которых есть транзакции
  const categoriesWithTransactions = Array.from(
    new Set(props.transactions.map((t) => t.category))
  ).filter(Boolean);

  editableCategories.value = categoriesWithTransactions.sort();
};

// Следим за изменениями в categories и обновляем editableCategories
watch(
  [categories, dbCategories, () => props.transactions],
  () => {
    initEditableCategories();
  },
  { immediate: true }
);

// Функции для вычисления итогов
function getCategoryIncomeTotal(category) {
  return Object.values(monthlyData.value).reduce((total, monthData) => {
    return total + (monthData[category]?.income || 0);
  }, 0);
}

function getCategoryExpenseTotal(category) {
  return Object.values(monthlyData.value).reduce((total, monthData) => {
    return total + (monthData[category]?.expense || 0);
  }, 0);
}

function getMonthIncomeTotal(monthKey) {
  const monthData = monthlyData.value[monthKey] || {};
  return Object.values(monthData).reduce((total, categoryData) => {
    return total + (categoryData.income || 0);
  }, 0);
}

function getMonthExpenseTotal(monthKey) {
  const monthData = monthlyData.value[monthKey] || {};
  return Object.values(monthData).reduce((total, categoryData) => {
    return total + (categoryData.expense || 0);
  }, 0);
}

function getGrandIncomeTotal() {
  return Object.keys(monthlyData.value).reduce((total, monthKey) => {
    return total + getMonthIncomeTotal(monthKey);
  }, 0);
}

function getGrandExpenseTotal() {
  return Object.keys(monthlyData.value).reduce((total, monthKey) => {
    return total + getMonthExpenseTotal(monthKey);
  }, 0);
}

// Новые функции для вычисления общих сумм (доходы - расходы)
function getCategoryMonthTotal(monthKey, category) {
  const monthData = monthlyData.value[monthKey] || {};
  const categoryData = monthData[category] || { income: 0, expense: 0 };
  return categoryData.income - categoryData.expense;
}

function getCategoryTotal(category) {
  return Object.keys(monthlyData.value).reduce((total, monthKey) => {
    return total + getCategoryMonthTotal(monthKey, category);
  }, 0);
}

function getMonthTotal(monthKey) {
  const monthData = monthlyData.value[monthKey] || {};
  return Object.values(monthData).reduce((total, categoryData) => {
    return total + (categoryData.income - categoryData.expense);
  }, 0);
}

function getGrandTotal() {
  return Object.keys(monthlyData.value).reduce((total, monthKey) => {
    return total + getMonthTotal(monthKey);
  }, 0);
}

// Вспомогательные функции
function parseDate(dateInput) {
  // Если это уже Date объект, возвращаем как есть
  if (dateInput instanceof Date) {
    return dateInput;
  }

  // Если это строка в формате дд.мм.гггг
  if (typeof dateInput === "string" && /^\d{2}\.\d{2}\.\d{4}$/.test(dateInput)) {
    const [day, month, year] = dateInput.split(".");
    const result = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    return result;
  }

  // Пытаемся создать Date из строки (для других форматов)
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) {
    console.warn("Не удалось распарсить дату:", dateInput);
    return null;
  }

  return date;
}

function formatAmount(amount) {
  if (amount === 0) return "0";
  const formatted = amount.toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return amount > 0 ? `+${formatted}` : formatted;
}

function getCellClass(amount) {
  if (amount === 0) return "";

  if (amount > 0) {
    // Для положительных сумм: зелёные оттенки
    const absAmount = Math.abs(amount);
    if (absAmount >= 100000) return "bg-green-600 text-white font-semibold";
    if (absAmount >= 50000) return "bg-green-500 text-white";
    if (absAmount >= 20000) return "bg-green-400 text-white";
    if (absAmount >= 10000) return "bg-green-300 text-gray-800";
    return "bg-green-100 text-gray-800";
  } else {
    // Для отрицательных сумм: красные оттенки
    const absAmount = Math.abs(amount);
    if (absAmount >= 100000) return "bg-red-600 text-white font-semibold";
    if (absAmount >= 50000) return "bg-red-500 text-white";
    if (absAmount >= 20000) return "bg-red-400 text-white";
    if (absAmount >= 10000) return "bg-red-300 text-gray-800";
    return "bg-red-100 text-gray-800";
  }
}

// Фильтрация по году
function filterByYear() {
  // Автоматически обновляется через computed свойство months
}

// Экспортируем функции для внешнего использования
defineExpose({
  refreshCategoriesFromDb,
});
</script>

<script setup>
import FileUpload from "./components/ui/FileUpload.vue";
import AllTransactionsTable from "./components/AllTransactionsTable.vue";
import MonthlyTable from "./components/MonthlyTable.vue";
import AddTransactionModal from "./components/ui/AddTransactionModal.vue";
import { ref, onMounted, computed } from "vue";

const allTable = ref(null);
const monthlyTable = ref(null);
const currentMode = ref("upload"); // 'upload' или 'database'
const showMonthlyTable = ref(false);
const showAddTransactionModal = ref(false);
const hasUnsavedData = ref(false); // Новое состояние для отслеживания несохраненных данных
const showAutoSwitchNotification = ref(false); // Уведомление об автоматическом переключении

async function handleFileParsed(parsedStatement) {
  if (allTable.value && allTable.value.addStatement) {
    await allTable.value.addStatement(parsedStatement);
    hasUnsavedData.value = true; // Помечаем, что есть несохраненные данные

    // Показываем уведомление о успешной загрузке
    showAutoSwitchNotification.value = true;

    // Скрываем уведомление через 5 секунд
    setTimeout(() => {
      showAutoSwitchNotification.value = false;
    }, 5000);
  }
}

async function saveToDatabase() {
  if (allTable.value && allTable.value.saveAllToDb) {
    await allTable.value.saveAllToDb();
    hasUnsavedData.value = false; // Данные сохранены
    // Автоматически переключаемся в режим просмотра БД
    currentMode.value = "database";
    // Обновляем категории в MonthlyTable
    await refreshCategoriesInMonthlyTable();
  }
}

function switchToUpload() {
  currentMode.value = "upload";
  // Очищаем данные из базы при переключении в режим загрузки
  if (allTable.value && allTable.value.clearStatements) {
    allTable.value.clearStatements();
  }
  // Устанавливаем режим загрузки в таблице
  if (allTable.value && allTable.value.setDatabaseMode) {
    allTable.value.setDatabaseMode(false);
  }
  hasUnsavedData.value = false;
  showAutoSwitchNotification.value = false; // Скрываем уведомление
}

function switchToDatabase() {
  currentMode.value = "database";
  // Загружаем данные из базы при переключении
  if (allTable.value && allTable.value.loadStatementsFromDb) {
    allTable.value.loadStatementsFromDb();
  }
  // Устанавливаем режим базы данных в таблице
  if (allTable.value && allTable.value.setDatabaseMode) {
    allTable.value.setDatabaseMode(true);
  }
  // Обновляем категории в MonthlyTable
  refreshCategoriesInMonthlyTable();
  hasUnsavedData.value = false;
  showAutoSwitchNotification.value = false; // Скрываем уведомление
}

// Функция для обновления категорий в MonthlyTable
async function refreshCategoriesInMonthlyTable() {
  if (monthlyTable.value && monthlyTable.value.refreshCategoriesFromDb) {
    await monthlyTable.value.refreshCategoriesFromDb();
  }
}

// Функция для обработки обновления категорий
async function handleCategoriesUpdated() {
  // Категории уже обновлены в AllTransactionsTable через глобальное событие
  // Обновляем только категории в MonthlyTable
  await refreshCategoriesInMonthlyTable();
}

// Функция для добавления транзакции вручную
async function handleAddTransaction(transaction) {
  if (allTable.value && allTable.value.addManualTransaction) {
    await allTable.value.addManualTransaction(transaction);
    hasUnsavedData.value = true;
  }
}

// Функции для работы с датами
function parseDate(dateInput) {
  // Если это уже Date объект, возвращаем как есть
  if (dateInput instanceof Date) {
    return dateInput;
  }

  // Если это строка в формате дд.мм.гггг
  if (typeof dateInput === "string" && /^\d{2}\.\d{2}\.\d{4}$/.test(dateInput)) {
    const [day, month, year] = dateInput.split(".");
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }

  // Пытаемся создать Date из строки (для других форматов)
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) {
    console.warn("Не удалось распарсить дату:", dateInput);
    return null;
  }

  return date;
}

// Функции для расчета статистики
function calculateBalance(transactions) {
  if (!Array.isArray(transactions)) return 0;
  return transactions.reduce((sum, t) => sum + (t.amount || 0), 0);
}

// Находит последний год с данными
function findLastYearWithData(transactions) {
  if (!Array.isArray(transactions) || transactions.length === 0) return null;

  const years = new Set();
  transactions.forEach((t) => {
    if (t.date) {
      const date = parseDate(t.date);
      if (date) {
        years.add(date.getFullYear());
      }
    }
  });

  if (years.size === 0) return null;

  return Math.max(...years);
}

function calculateMonthlyIncome(transactions) {
  if (!Array.isArray(transactions) || transactions.length === 0) return 0;

  // Находим последний год с данными
  const lastYearWithData = findLastYearWithData(transactions);
  if (!lastYearWithData) return 0;

  const filteredTransactions = transactions.filter((t) => {
    if (!t.date) return false;
    const date = parseDate(t.date);
    if (!date) return false;

    const isLastYear = date.getFullYear() === lastYearWithData;
    const isPositive = (t.amount || 0) > 0;

    return isLastYear && isPositive;
  });

  return filteredTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
}

function calculateMonthlyExpenses(transactions) {
  if (!Array.isArray(transactions) || transactions.length === 0) return 0;

  // Находим последний год с данными
  const lastYearWithData = findLastYearWithData(transactions);
  if (!lastYearWithData) return 0;

  const filteredTransactions = transactions.filter((t) => {
    if (!t.date) return false;
    const date = parseDate(t.date);
    if (!date) return false;

    const isLastYear = date.getFullYear() === lastYearWithData;
    const isNegative = (t.amount || 0) < 0;

    return isLastYear && isNegative;
  });

  return filteredTransactions.reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
}

// Вычисляемые свойства для статистики
const statistics = computed(() => {
  if (!allTable.value) {
    return { balance: 0, income: 0, expenses: 0 };
  }

  const transactions = allTable.value.getAllTransactions?.() || [];

  return {
    balance: calculateBalance(transactions),
    income: calculateMonthlyIncome(transactions),
    expenses: calculateMonthlyExpenses(transactions),
  };
});

// Проверка наличия транзакций в базе данных
const hasTransactions = computed(() => {
  if (!allTable.value) {
    return false;
  }
  const transactions = allTable.value.getAllTransactions?.() || [];
  return transactions.length > 0;
});

// При загрузке приложения инициализируем компонент
onMounted(async () => {
  // Небольшая задержка, чтобы компонент AllTransactionsTable успел инициализироваться
  setTimeout(async () => {
    // Проверяем, есть ли данные в базе данных
    if (allTable.value && allTable.value.loadStatementsFromDb) {
      try {
        await allTable.value.loadStatementsFromDb();
        // Если данные загружены успешно, переключаемся в режим базы данных
        currentMode.value = "database";
        if (allTable.value && allTable.value.setDatabaseMode) {
          allTable.value.setDatabaseMode(true);
        }
      } catch {
        // Если данных нет или ошибка, начинаем в режиме загрузки файлов
        if (allTable.value && allTable.value.clearStatements) {
          allTable.value.clearStatements();
        }
        if (allTable.value && allTable.value.setDatabaseMode) {
          allTable.value.setDatabaseMode(false);
        }
      }
    }
  }, 100);
});

// Функции для работы с данными

function exportData() {
  if (allTable.value && allTable.value.exportData) {
    allTable.value.exportData();
  }
}

function importData() {
  // Создаем скрытый input для импорта
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.onchange = (event) => {
    if (allTable.value && allTable.value.importData) {
      allTable.value.importData(event);
    }
  };
  input.click();
}

function clearAllData() {
  if (allTable.value && allTable.value.clearAllData) {
    allTable.value.clearAllData();
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <div class="w-full max-w-none mx-auto space-y-4 p-4">
      <!-- Заголовок приложения -->
      <header class="bg-white border-b border-gray-200 px-4 py-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-3">
            <h1 class="text-lg font-bold text-gray-900">💰 Семейный бюджет</h1>
            <div v-if="hasUnsavedData" class="flex items-center">
              <span
                class="inline-flex items-center px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full"
              >
                ⚠️ Есть несохраненные данные
              </span>
            </div>
          </div>
          <p class="text-xs text-gray-500">Local-first PWA для управления финансами</p>
        </div>
      </header>

      <!-- Уведомление об успешной загрузке файла -->
      <div v-if="showAutoSwitchNotification" class="fixed top-3 right-3 z-50">
        <div class="bg-green-50 border border-green-200 rounded-lg p-3 shadow-lg max-w-sm">
          <div class="flex items-center">
            <div class="text-green-500 text-lg mr-2">✅</div>
            <div>
              <h3 class="font-medium text-green-800 text-sm">Файл успешно загружен</h3>
              <p class="text-xs text-green-700 mt-0.5">
                Данные добавлены в таблицу. Не забудьте сохранить их в базу!
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Карточки статистики -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card class="text-center hover:shadow-lg transition-shadow">
          <div class="text-xs text-gray-500 mb-1">
            {{ currentMode === "upload" ? "📁 Загруженные файлы" : "💾 База данных" }}
          </div>
          <div class="text-2xl font-bold text-green-600 mb-2">
            {{ statistics.balance >= 0 ? "+" : ""
            }}{{
              statistics.balance.toLocaleString("ru-RU", {
                style: "currency",
                currency: "RUB",
                minimumFractionDigits: 0,
              })
            }}
          </div>
          <div class="text-gray-600">Общий баланс</div>
        </Card>

        <Card class="text-center hover:shadow-lg transition-shadow">
          <div class="text-xs text-gray-500 mb-1">
            {{ currentMode === "upload" ? "📁 Загруженные файлы" : "💾 База данных" }}
          </div>
          <div class="text-2xl font-bold text-green-500 mb-2">
            {{
              statistics.income.toLocaleString("ru-RU", {
                style: "currency",
                currency: "RUB",
                minimumFractionDigits: 0,
              })
            }}
          </div>
          <div class="text-gray-600">Доходы за год</div>
        </Card>

        <Card class="text-center hover:shadow-lg transition-shadow">
          <div class="text-xs text-gray-500 mb-1">
            {{ currentMode === "upload" ? "📁 Загруженные файлы" : "💾 База данных" }}
          </div>
          <div class="text-2xl font-bold text-red-500 mb-2">
            {{
              statistics.expenses.toLocaleString("ru-RU", {
                style: "currency",
                currency: "RUB",
                minimumFractionDigits: 0,
              })
            }}
          </div>
          <div class="text-gray-600">Расходы за год</div>
        </Card>
      </div>

      <!-- Переключение режимов -->
      <Card>
        <div class="flex space-x-2 mb-4">
          <button
            @click="switchToUpload"
            :class="[
              'px-4 py-2 rounded-lg font-medium transition-colors text-sm',
              currentMode === 'upload'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
            ]"
          >
            📁 Загрузить файлы
          </button>
          <button
            @click="switchToDatabase"
            :class="[
              'px-4 py-2 rounded-lg font-medium transition-colors text-sm',
              currentMode === 'database'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
            ]"
          >
            💾 Мои данные
          </button>
        </div>

        <!-- Режим загрузки файлов -->
        <div v-if="currentMode === 'upload'">
          <h2 class="text-lg font-semibold text-gray-900 mb-3">
            📊 Загрузить новую банковскую выписку
          </h2>
          <p class="text-gray-600 mb-4 text-sm">
            Загрузите Excel или PDF файл с банковской выпиской. После загрузки данные будут
            отображаться в таблице ниже, где вы сможете их просмотреть и сохранить в базу.
          </p>

          <!-- Список поддерживаемых банков -->
          <div class="mb-3 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
            <span class="font-medium">🏦 Поддерживаемые банки:</span> Сбербанк, Тинькофф, Озон-банк,
            Альфа-банк
          </div>
          <FileUpload @file-parsed="handleFileParsed" />
        </div>

        <!-- Режим просмотра базы данных -->
        <div v-if="currentMode === 'database'">
          <h2 class="text-lg font-semibold text-gray-900 mb-3">💾 Мои сохраненные данные</h2>
          <p class="text-gray-600 mb-4 text-sm">
            Здесь отображаются все сохраненные выписки из локальной базы данных. Вы можете
            просматривать, анализировать и экспортировать данные.
          </p>
          <div class="flex flex-wrap gap-2">
            <button
              @click="showMonthlyTable = true"
              class="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium text-sm"
            >
              📊 По месяцам
            </button>

            <div class="w-4"></div>

            <button
              @click="showAddTransactionModal = true"
              class="px-3 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium text-sm"
            >
              ➕ Добавить
            </button>

            <div class="w-4"></div>

            <button
              @click="exportData"
              :disabled="!hasTransactions"
              :class="[
                'px-3 py-2 rounded-lg transition-colors font-medium text-sm',
                hasTransactions
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed',
              ]"
            >
              📥 Экспорт
            </button>
            <button
              @click="importData"
              class="px-3 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors font-medium text-sm"
            >
              📤 Импорт
            </button>

            <div class="w-4"></div>

            <button
              @click="clearAllData"
              class="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm"
            >
              🗑️ Очистить
            </button>
          </div>
        </div>
      </Card>

      <Card>
        <AllTransactionsTable
          ref="allTable"
          @categories-updated="handleCategoriesUpdated"
          @save-to-database="saveToDatabase"
        />
      </Card>

      <!-- Таблица по месяцам -->
      <MonthlyTable
        v-if="showMonthlyTable"
        ref="monthlyTable"
        :transactions="allTable?.getAllTransactions?.() || []"
        @close="showMonthlyTable = false"
        @categories-updated="handleCategoriesUpdated"
      />

      <!-- Модальное окно добавления транзакции -->
      <AddTransactionModal
        :is-open="showAddTransactionModal"
        :categories="allTable?.getCategories?.() || []"
        @close="showAddTransactionModal = false"
        @add-transaction="handleAddTransaction"
      />
    </div>
  </div>
</template>

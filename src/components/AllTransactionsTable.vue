<!-- eslint-disable vue/multi-word-component-names -->
<script setup>
import { ref, computed, nextTick, watch } from "vue";
import Table from "./ui/Table.vue";
import CategorySelect from "./ui/CategorySelect.vue";
import UniversalSelect from "./ui/UniversalSelect.vue";
import DateEditor from "./ui/DateEditor.vue";
import {
  aggregateTransactions,
  filterAndSortTransactions,
} from "../services/pdfParser";
import {
  saveTransactionsToDb,
  saveTransactionToDb,
  getAllTransactionsFromDb,
  updateTransactionInDb,
  exportAllDataFromDb,
  importDataToDb,
  deleteAllTransactionsFromDb,
  deleteTransactionFromDb,
  addCategoryToDb,
  getCategoriesFromDb,
} from "../services/db";

defineProps({
  transactions: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(["categoriesUpdated", "saveToDatabase"]);

// statements теперь только в памяти, не сохраняется в localStorage
const statements = ref([]);
const isDatabaseMode = ref(false);

// Пользовательские категории (добавленные пользователем)
const userCategories = ref([]);

// Ключ для принудительного обновления таблицы
const tableKey = ref(0);

// Флаг для отслеживания редактирования (чтобы не применять сортировку)
const isEditing = ref(false);
const editingTimeout = ref(null);

// Состояние для модальных окон
const showDeleteModal = ref(false);
const transactionToDelete = ref(null);
const showClearAllModal = ref(false);

// Состояние для массового удаления
const selectedTransactions = ref(new Set());
const showBulkDeleteModal = ref(false);

// Состояние для массового редактирования
const showBulkEditModal = ref(false);
const bulkEditBank = ref("");
const bulkEditCategory = ref("");
const bulkEditDescription = ref("");

// Загружаем пользовательские категории из БД
async function loadUserCategoriesFromDb() {
  try {
    const dbCategories = await getCategoriesFromDb();
    if (dbCategories && Array.isArray(dbCategories)) {
      userCategories.value = dbCategories;

      // Принудительно обновляем computed свойства после загрузки
      await nextTick();

      // Уведомляем родительский компонент об обновлении категорий
      emit("categoriesUpdated");

      // Отправляем глобальное событие для обновления всех CategorySelect компонентов
      window.dispatchEvent(
        new CustomEvent("categories-updated", {
          detail: { categories: availableCategories.value },
        })
      );
    }
  } catch (error) {
    console.error("Ошибка при загрузке категорий из БД:", error);
  }
}

// Следим за изменениями в userCategories для обновления availableCategories
watch(
  userCategories,
  () => {
    // Принудительно обновляем computed свойство
    nextTick(() => {
      // availableCategories автоматически обновится
    });
  },
  { deep: true }
);

// Уведомления
const notifications = ref([]);
function notify(msg, type = "info", timeout = 3500) {
  const id = Date.now() + Math.random();
  notifications.value.push({ id, msg, type });
  setTimeout(() => {
    notifications.value = notifications.value.filter((n) => n.id !== id);
  }, timeout);
}

// Функции для массового удаления
function toggleTransactionSelection(transactionId) {
  if (selectedTransactions.value.has(transactionId)) {
    selectedTransactions.value.delete(transactionId);
  } else {
    selectedTransactions.value.add(transactionId);
  }
}

function selectAllTransactions() {
  selectedTransactions.value.clear();
  filtered.value.forEach((transaction) => {
    selectedTransactions.value.add(getTransactionId(transaction));
  });
}

function deselectAllTransactions() {
  selectedTransactions.value.clear();
}

function getTransactionId(transaction) {
  // Создаем уникальный ID для транзакции
  return `${transaction.date?.getTime() || transaction.date}-${transaction.description}-${
    transaction.amount
  }-${transaction.bank}-${transaction.category || ""}`;
}

function isTransactionSelected(transaction) {
  return selectedTransactions.value.has(getTransactionId(transaction));
}

function getSelectedTransactionsCount() {
  return selectedTransactions.value.size;
}

function showBulkDeleteConfirmation() {
  if (selectedTransactions.value.size === 0) {
    notify("Выберите транзакции для удаления", "warning");
    return;
  }
  showBulkDeleteModal.value = true;
}

async function deleteSelectedTransactions() {
  try {
    const transactionsToDelete = filtered.value.filter((transaction) =>
      selectedTransactions.value.has(getTransactionId(transaction))
    );

    if (isDatabaseMode.value) {
      // Проверяем, что все транзакции имеют ID
      const transactionsWithoutId = transactionsToDelete.filter((t) => !t.id);
      if (transactionsWithoutId.length > 0) {
        console.warn("Найдены транзакции без ID:", transactionsWithoutId);
        notify("Некоторые транзакции не могут быть удалены (отсутствует ID)", "warning");
      }

      // Удаляем из базы данных только транзакции с ID
      let deletedCount = 0;
      for (const transaction of transactionsToDelete) {
        if (transaction.id) {
          await deleteTransactionFromDb(transaction.id);
          deletedCount++;
        } else {
          console.warn("Транзакция без ID:", transaction);
        }
      }

      // Перезагружаем данные из БД
      await loadStatementsFromDb();
      // Принудительно обновляем таблицу
      tableKey.value++;

      if (deletedCount < transactionsToDelete.length) {
        notify(`Удалено ${deletedCount} из ${transactionsToDelete.length} транзакций`, "warning");
      }
    } else {
      // Удаляем из памяти
      for (const transaction of transactionsToDelete) {
        const statementIndex = statements.value.findIndex((s) =>
          s.transactions.some((t) => getTransactionId(t) === getTransactionId(transaction))
        );
        if (statementIndex !== -1) {
          const transactionIndex = statements.value[statementIndex].transactions.findIndex(
            (t) => getTransactionId(t) === getTransactionId(transaction)
          );
          if (transactionIndex !== -1) {
            statements.value[statementIndex].transactions.splice(transactionIndex, 1);
          }
        }
      }
    }

    selectedTransactions.value.clear();
    showBulkDeleteModal.value = false;

    // Принудительно обновляем таблицу
    tableKey.value++;

    if (isDatabaseMode.value) {
      // Уведомление уже отправлено выше для базы данных
    } else {
      notify(`Удалено ${transactionsToDelete.length} транзакций`, "success");
    }
  } catch (error) {
    console.error("Ошибка при массовом удалении:", error);
    notify("Ошибка при удалении транзакций", "error");
  }
}

function cancelBulkDelete() {
  showBulkDeleteModal.value = false;
}

// Функции для массового редактирования
function showBulkEditConfirmation() {
  if (selectedTransactions.value.size === 0) {
    notify("Выберите транзакции для редактирования", "warning");
    return;
  }
  // Сбрасываем значения формы
  bulkEditBank.value = "";
  bulkEditCategory.value = "";
  showBulkEditModal.value = true;
}

async function saveBulkEdit() {
  try {
    const transactionsToEdit = filtered.value.filter((transaction) =>
      selectedTransactions.value.has(getTransactionId(transaction))
    );

    if (transactionsToEdit.length === 0) {
      notify("Нет выбранных транзакций для редактирования", "warning");
      return;
    }

    // Определяем, какие поля нужно обновить
    const updates = {};
    if (bulkEditBank.value) {
      updates.bank = bulkEditBank.value;
    }
    if (bulkEditCategory.value) {
      updates.category = bulkEditCategory.value;
    }
    if (bulkEditDescription.value.trim()) {
      updates.description = bulkEditDescription.value.trim();
    }

    // Если ничего не выбрано для изменения
    if (Object.keys(updates).length === 0) {
      notify("Выберите хотя бы одно поле для изменения", "warning");
      return;
    }

    if (isDatabaseMode.value) {
      // Обновляем транзакции в базе данных
      const transactionsWithoutId = transactionsToEdit.filter((t) => !t.id);
      if (transactionsWithoutId.length > 0) {
        throw new Error(
          `Некоторые транзакции не имеют ID для обновления в базе данных (${transactionsWithoutId.length})`
        );
      }

      // Обновляем каждую транзакцию в БД
      let updatedCount = 0;
      for (const transaction of transactionsToEdit) {
        try {
          await updateTransactionInDb(transaction.id, updates);
          updatedCount++;

          // Обновляем локальный объект транзакции
          for (const statement of statements.value) {
            const transactionIndex = statement.transactions.findIndex((t) => t.id === transaction.id);
            if (transactionIndex !== -1) {
              Object.assign(statement.transactions[transactionIndex], updates);
              break;
            }
          }
        } catch (error) {
          console.error(`Ошибка при обновлении транзакции ${transaction.id}:`, error);
        }
      }

      notify(
        `Обновлено ${updatedCount} из ${transactionsToEdit.length} транзакций`,
        updatedCount === transactionsToEdit.length ? "success" : "warning"
      );

      // Перезагружаем данные из базы для полной синхронизации
      await loadStatementsFromDb();
    } else {
      // Обновляем транзакции в памяти (несохраненные данные)
      for (const transaction of transactionsToEdit) {
        Object.assign(transaction, updates);
      }

      notify(`Обновлено ${transactionsToEdit.length} транзакций`, "success");
    }

    // Очищаем выделение и закрываем модальное окно
    selectedTransactions.value.clear();
    showBulkEditModal.value = false;
    bulkEditBank.value = "";
    bulkEditCategory.value = "";
    bulkEditDescription.value = "";

    // Принудительно обновляем таблицу
    tableKey.value++;
  } catch (error) {
    console.error("Ошибка при массовом редактировании транзакций:", error);
    notify("Ошибка при массовом редактировании транзакций", "error");
  }
}

function cancelBulkEdit() {
  showBulkEditModal.value = false;
  bulkEditBank.value = "";
  bulkEditCategory.value = "";
  bulkEditDescription.value = "";
}

// Добавление новой выписки
async function addStatement(newStatement) {
  if (!newStatement || !newStatement.transactions) return;

  // Проверка на дубликат файла (по имени и периоду)
  const isDuplicateFile = statements.value.some(
    (s) =>
      s.fileName === newStatement.fileName &&
      s.period?.from?.toString() === newStatement.period?.from?.toString() &&
      s.period?.to?.toString() === newStatement.period?.to?.toString()
  );
  if (isDuplicateFile) {
    notify("Этот файл уже был загружен", "warning");
    return;
  }

  try {
    // Сохраняем все транзакции как есть (без удаления одинаковых)
    statements.value.push(newStatement);

    // Обновляем ключ таблицы для принудительного перерендера
    tableKey.value = tableKey.value + 1;

    notify(`Добавлено транзакций: ${newStatement.transactions.length}`, "success");
  } catch (error) {
    console.error("Ошибка при проверке дубликатов:", error);
    notify("Ошибка при проверке дубликатов", "error");
  }
}

// Функция для установки дат по умолчанию (от начала года до сегодня)
function setDefaultDates() {
  // Показываем все даты по умолчанию, чтобы сразу видеть загруженные данные
  dateFrom.value = "";
  dateTo.value = "";
}

function resetFilters() {
  selectedBank.value = "";
  selectedCategory.value = "";
  selectedYear.value = "";
  selectedMonth.value = "";
  search.value = "";
  setDefaultDates();

  sortField.value = "date";
  sortDirection.value = "desc";

  notify("Фильтры сброшены", "info");
}

// Локальные фильтры и сортировка
const selectedBank = ref("");
const selectedCategory = ref("");
const dateFrom = ref("");
const dateTo = ref("");
const selectedYear = ref("");
const selectedMonth = ref("");
const search = ref("");
const sortField = ref("date");
const sortDirection = ref("desc");

// Устанавливаем даты по умолчанию при инициализации
setDefaultDates();

// Генерируем список годов для селекта на основе данных транзакций
const availableYears = computed(() => {
  const years = new Set();

  // Добавляем годы из транзакций
  allTransactions.value.forEach((transaction) => {
    if (transaction.date) {
      const date = parseDate(transaction.date);
      if (date) {
        years.add(date.getFullYear());
      }
    }
  });

  // Добавляем текущий год, если его нет в данных
  const currentYear = new Date().getFullYear();
  years.add(currentYear);

  // Добавляем предыдущий и следующий год для удобства
  years.add(currentYear - 1);
  years.add(currentYear + 1);

  return Array.from(years).sort((a, b) => b - a);
});

// Генерируем список месяцев для селекта
const availableMonths = computed(() => {
  const months = [];
  const monthLabels = {
    1: "Январь",
    2: "Февраль",
    3: "Март",
    4: "Апрель",
    5: "Май",
    6: "Июнь",
    7: "Июль",
    8: "Август",
    9: "Сентябрь",
    10: "Октябрь",
    11: "Ноябрь",
    12: "Декабрь",
  };

  for (let month = 1; month <= 12; month++) {
    months.push({
      value: month,
      label: monthLabels[month],
    });
  }

  return months;
});

// Обработчик изменения года
function onYearChange() {
  updateDateRange();
}

// Обработчик изменения месяца
function onMonthChange() {
  updateDateRange();
}

// Обновление диапазона дат на основе выбранного года и месяца
function updateDateRange() {
  if (!selectedYear.value && !selectedMonth.value) {
    // Сброс фильтра по месяцу
    setDefaultDates();
    return;
  }

  if (selectedYear.value && selectedMonth.value) {
    // Выбран конкретный месяц
    const year = parseInt(selectedYear.value);
    const month = parseInt(selectedMonth.value);
    const endOfMonth = new Date(year, month, 0); // Последний день месяца

    // Используем локальное время для избежания проблем с часовыми поясами
    dateFrom.value = `${year}-${String(month).padStart(2, "0")}-01`;
    dateTo.value = `${year}-${String(month).padStart(2, "0")}-${String(
      endOfMonth.getDate()
    ).padStart(2, "0")}`;
  } else if (selectedYear.value) {
    // Выбран только год
    const year = parseInt(selectedYear.value);
    // Используем локальное время для избежания проблем с часовыми поясами
    dateFrom.value = `${year}-01-01`;
    dateTo.value = `${year}-12-31`;
  } else if (selectedMonth.value) {
    // Выбран только месяц - используем год из данных транзакций или текущий год
    const month = parseInt(selectedMonth.value);

    // Находим год из данных транзакций, который содержит этот месяц
    const yearsFromTransactions = new Set();
    allTransactions.value.forEach((transaction) => {
      if (transaction.date) {
        const date = parseDate(transaction.date);
        if (date) {
          yearsFromTransactions.add(date.getFullYear());
        }
      }
    });

    // Используем самый последний год из транзакций, или текущий год
    const availableYears = Array.from(yearsFromTransactions).sort((a, b) => b - a);
    const yearToUse = availableYears.length > 0 ? availableYears[0] : new Date().getFullYear();

    const endOfMonth = new Date(yearToUse, month, 0);

    // Используем локальное время для избежания проблем с часовыми поясами
    dateFrom.value = `${yearToUse}-${String(month).padStart(2, "0")}-01`;
    dateTo.value = `${yearToUse}-${String(month).padStart(2, "0")}-${String(
      endOfMonth.getDate()
    ).padStart(2, "0")}`;

    // Автоматически устанавливаем год в селекте
    selectedYear.value = yearToUse.toString();
  }
}

// Синхронизация выбранного года и месяца с полями дат
function syncSelectedMonth() {
  if (!dateFrom.value || !dateTo.value) {
    selectedYear.value = "";
    selectedMonth.value = "";
    return;
  }

  const fromDate = new Date(dateFrom.value);
  const toDate = new Date(dateTo.value);

  // Проверяем, соответствует ли диапазон дат целому месяцу
  const fromMonth = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
  const toMonth = new Date(toDate.getFullYear(), toDate.getMonth() + 1, 0);

  if (fromDate.getTime() === fromMonth.getTime() && toDate.getTime() === toMonth.getTime()) {
    // Это целый месяц
    selectedYear.value = fromDate.getFullYear().toString();
    selectedMonth.value = (fromDate.getMonth() + 1).toString();
  } else {
    // Проверяем, соответствует ли диапазон целому году
    const fromYear = new Date(fromDate.getFullYear(), 0, 1);
    const toYear = new Date(toDate.getFullYear(), 11, 31);

    if (fromDate.getTime() === fromYear.getTime() && toDate.getTime() === toYear.getTime()) {
      // Это целый год
      selectedYear.value = fromDate.getFullYear().toString();
      selectedMonth.value = "";
    } else {
      // Это произвольный диапазон
      selectedYear.value = "";
      selectedMonth.value = "";
    }
  }
}

// Реактивная переменная для принудительного обновления computed
const refreshTrigger = ref(0);

// Агрегируем все транзакции
const allTransactions = computed(() => {
  // Используем refreshTrigger только для принудительного обновления при добавлении/удалении
  refreshTrigger.value;

  const transactions = aggregateTransactions(statements.value);

  return transactions;
});

function getAllTransactions() {
  return allTransactions.value;
}

function getBanks() {
  return banks.value || [];
}

// Получаем уникальные банки и категории для фильтров
const banks = computed(() =>
  Array.from(new Set(allTransactions.value.map((t) => t.bank))).filter(Boolean)
);

const categories = computed(() =>
  Array.from(new Set(allTransactions.value.map((t) => t.category))).filter(Boolean)
);

// Доступные категории для селекта (только те, что есть в транзакциях)
const availableCategories = computed(() => [...categories.value].sort());

// Обработчик добавления новой категории
async function onCategoryAdded(newCategory) {
  // Добавляем новую категорию в список пользовательских категорий
  if (!userCategories.value.includes(newCategory)) {
    userCategories.value.push(newCategory);
    userCategories.value.sort();

    // Принудительно обновляем список доступных категорий
    await nextTick();

    // Уведомляем родительский компонент об обновлении категорий
    emit("categoriesUpdated");

    // Отправляем глобальное событие для обновления всех CategorySelect компонентов
    window.dispatchEvent(
      new CustomEvent("categories-updated", {
        detail: { categories: availableCategories.value },
      })
    );
  }

  // Сохраняем категорию в БД
  try {
    await addCategoryToDb(newCategory);
    notify(`Добавлена новая категория: ${newCategory}`, "success");
  } catch (error) {
    console.error("Ошибка при сохранении категории в БД:", error);
    notify("Ошибка при сохранении категории", "error");
  }
}

// Обработчик добавления нового банка
function onBankAdded(newBank) {
  // Обновляем список банков (он автоматически обновится через computed свойство banks)
  notify(`Добавлен новый банк: ${newBank}`, "success");
}

// Функции для управления состоянием редактирования
function startEditing() {
  isEditing.value = true;
  // Очищаем предыдущий таймаут
  if (editingTimeout.value) {
    clearTimeout(editingTimeout.value);
  }
}

function endEditing() {
  // Устанавливаем таймаут для завершения редактирования
  editingTimeout.value = setTimeout(() => {
    isEditing.value = false;
    editingTimeout.value = null;
  }, 500); // 500мс задержка после последнего изменения
}

// Функция для обновления даты
function onDateUpdate(row, newDateValue) {
  onEdit(row, "date", newDateValue, true);
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

// Применяем фильтры и сортировку
const filtered = computed(() => {
  let arr = filterAndSortTransactions(
    allTransactions.value,
    {
      bank: selectedBank.value || undefined,
      category: selectedCategory.value || undefined,
      dateFrom: dateFrom.value ? parseDate(dateFrom.value) : undefined,
      dateTo: dateTo.value ? parseDate(dateTo.value) : undefined,
      search: search.value || undefined,
    },
    // Не применяем сортировку во время редактирования
    isEditing.value
      ? { field: "date", direction: "desc" }
      : { field: sortField.value, direction: sortDirection.value }
  );

  return arr;
});

// Итоговая сумма по отфильтрованным транзакциям
const filteredTotal = computed(() =>
  filtered.value.reduce((sum, t) => sum + (t.amount || 0), 0)
);

function setSort(field) {
  if (sortField.value === field) {
    sortDirection.value = sortDirection.value === "asc" ? "desc" : "asc";
  } else {
    sortField.value = field;
    sortDirection.value = "asc";
  }

  // Обновляем ключ таблицы для принудительного перерендера
  tableKey.value = tableKey.value + 1;
}

// Сохранение всех выписок в базу данных
async function saveAllToDb() {
  try {
    let savedCount = 0;
    let totalTransactions = 0;

    for (const statement of statements.value) {
      // Используем исходные транзакции из парсера, а не обработанные
      const transactionsToSave = statement.transactions.map((t) => ({
        ...t,
        // Убеждаемся, что банк сохранен
        bank: t.bank || statement.bank || "Неизвестный банк",
      }));

      await saveTransactionsToDb(transactionsToSave);
      totalTransactions += transactionsToSave.length;
      savedCount++;
    }

    notify(`Сохранено ${totalTransactions} транзакций из ${savedCount} выписок в базу`, "success");

    // Автоматически загружаем данные из базы после сохранения
    await loadStatementsFromDb();

    // Обновляем ключ таблицы для принудительного перерендера
    tableKey.value = tableKey.value + 1;
  } catch (error) {
    notify("Ошибка при сохранении в базу", "error");
    console.error("Ошибка сохранения:", error);
  }
}

async function loadStatementsFromDb() {
  try {
    const loadedTransactions = await getAllTransactionsFromDb();

    if (Array.isArray(loadedTransactions) && loadedTransactions.length > 0) {
      // Группируем транзакции по банку для совместимости с существующим кодом
      const groupedByBank = {};
      loadedTransactions.forEach((transaction) => {
        const bank = transaction.bank || "Неизвестный банк";
        if (!groupedByBank[bank]) {
          groupedByBank[bank] = [];
        }
        groupedByBank[bank].push(transaction);
      });

      // Создаем виртуальные выписки для совместимости
      statements.value = Object.entries(groupedByBank).map(([bank, transactions]) => ({
        bank,
        totalTransactions: transactions.length,
        transactions,
        fileName: `Импортированные транзакции ${bank}`,
        period: {
          from: new Date(Math.min(...transactions.map((t) => new Date(t.date)))),
          to: new Date(Math.max(...transactions.map((t) => new Date(t.date)))),
        },
      }));

      isDatabaseMode.value = true;
      notify(`Загружено ${loadedTransactions.length} транзакций из IndexedDB`, "success");
    } else {
      statements.value = [];
      isDatabaseMode.value = true;
      notify("Нет сохраненных транзакций в базе данных", "info");
    }

    // Загружаем пользовательские категории из БД
    // (глобальное событие уже отправляется в loadUserCategoriesFromDb)
    await loadUserCategoriesFromDb();
  } catch (error) {
    notify("Ошибка при загрузке из IndexedDB", "error");
    console.error("Ошибка загрузки из IndexedDB:", error);
  }
}

function clearStatements() {
  statements.value = [];
  isDatabaseMode.value = false;
}

async function exportData() {
  try {
    const result = await exportAllDataFromDb();
    notify(`Экспортировано ${result.count} транзакций`, "success");
  } catch (error) {
    notify("Ошибка при экспорте данных", "error");
    console.error("Ошибка экспорта:", error);
  }
}

async function importData(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const result = await importDataToDb(text);
    notify(`Импортировано ${result.count} транзакций`, "success");
    // Перезагружаем данные из базы
    // (глобальное событие уже отправляется в loadStatementsFromDb -> loadUserCategoriesFromDb)
    await loadStatementsFromDb();
  } catch (error) {
    notify("Ошибка при импорте данных", "error");
    console.error("Ошибка импорта:", error);
  }

  // Очищаем input для возможности повторной загрузки того же файла
  event.target.value = "";
}

// Показать модальное окно очистки всех данных
function showClearAllConfirmation() {
  showClearAllModal.value = true;
}

// Очистка всех данных
async function clearAllData() {
  try {
    const result = await deleteAllTransactionsFromDb();
    notify(`Удалено ${result.deletedCount} транзакций из базы`, "success");
    statements.value = [];

    // Обновляем ключ таблицы для принудительного перерендера
    tableKey.value = tableKey.value + 1;
  } catch (error) {
    notify("Ошибка при удалении данных", "error");
    console.error("Ошибка удаления:", error);
  } finally {
    showClearAllModal.value = false;
  }
}

// Отмена очистки всех данных
function cancelClearAll() {
  showClearAllModal.value = false;
}

async function onEdit(row, field, value, shouldEndEditing = true) {
  // Преобразуем amount к числу, если редактируется сумма
  if (field === "amount") {
    const num = parseFloat(value.replace(/[^\d\-.,]/g, "").replace(",", "."));
    row.amount = isNaN(num) ? 0 : num;
  } else if (field === "date") {
    // Для даты преобразуем строку в Date объект
    const dateValue = new Date(value);
    if (!isNaN(dateValue.getTime())) {
      row.date = dateValue;
    } else {
      notify("Неверный формат даты", "error");
      return;
    }
  } else {
    // Для других полей (включая category и bank) обновляем значение
    row[field] = value;
  }

  // Если мы в режиме базы данных, сохраняем изменения
  if (isDatabaseMode.value && row.id) {
    try {
      // Обновляем транзакцию напрямую в БД
      const updatedTransaction = await updateTransactionInDb(row.id, { [field]: row[field] });

      // Обновляем локальный объект транзакции с данными из БД
      if (updatedTransaction) {
        // Находим и обновляем транзакцию в statements.value
        for (const statement of statements.value) {
          const transactionIndex = statement.transactions.findIndex((t) => t.id === row.id);
          if (transactionIndex !== -1) {
            // Обновляем только измененное поле, сохраняя остальные данные
            statement.transactions[transactionIndex][field] = updatedTransaction[field];
            break;
          }
        }
      }

      // Не используем refreshTrigger, чтобы не нарушать сортировку
      // Вместо этого обновляем только ключ таблицы для перерендера строки
      tableKey.value = tableKey.value + 1;

      notify(`Поле "${field}" обновлено`, "success");
    } catch (error) {
      notify("Ошибка при сохранении изменений", error);
    }
  }

  // Завершаем редактирование только если это нужно
  if (shouldEndEditing) {
    endEditing();
  }
}

// Установка режима базы данных
function setDatabaseMode(mode) {
  isDatabaseMode.value = mode;

  // При переключении в режим базы данных обновляем даты по умолчанию
  if (mode) {
    setDefaultDates();
  }
}

// Добавление транзакции вручную
async function addManualTransaction(transaction) {
  try {
    if (isDatabaseMode.value) {
      // Сохраняем транзакцию в базу данных
      await saveTransactionToDb(transaction);

      // Перезагружаем данные из базы для обновления таблицы
      await loadStatementsFromDb();
      // Принудительно обновляем таблицу
      tableKey.value++;

      notify("Транзакция добавлена в базу данных", "success");
    } else {
      // Добавляем транзакцию в statements как отдельную "выписку"
      const manualStatement = {
        fileName: "Наличные",
        transactions: [transaction],
        period: {
          from: new Date(transaction.date),
          to: new Date(transaction.date),
        },
        meta: {
          source: "manual",
          addedAt: new Date().toISOString(),
        },
      };

      statements.value.push(manualStatement);

      // Принудительно обновляем таблицу
      tableKey.value++;

      notify("Транзакция добавлена в несохраненные данные", "success");
    }
  } catch (error) {
    console.error("Ошибка при добавлении транзакции:", error);
    notify("Ошибка при добавлении транзакции", "error");
  }
}

// Показать модальное окно удаления транзакции
function showDeleteConfirmation(transaction) {
  transactionToDelete.value = transaction;
  showDeleteModal.value = true;
}

// Удаление транзакции
async function deleteTransaction() {
  if (!transactionToDelete.value) return;

  try {
    if (isDatabaseMode.value) {
      // Удаляем из базы данных по ID
      if (transactionToDelete.value.id) {
        await deleteTransactionFromDb(transactionToDelete.value.id);
        notify("Транзакция удалена из базы данных", "success");

        // Перезагружаем данные из базы для обновления таблицы
        await loadStatementsFromDb();
        // Принудительно обновляем таблицу
        tableKey.value++;
      } else {
        throw new Error("Транзакция не имеет ID для удаления из базы данных");
      }
    } else {
      // Удаляем из statements (несохраненные данные)
      for (let i = 0; i < statements.value.length; i++) {
        const statement = statements.value[i];
        const transactionIndex = statement.transactions.findIndex(
          (t) => t === transactionToDelete.value
        );
        if (transactionIndex !== -1) {
          statement.transactions.splice(transactionIndex, 1);
          // Если в выписке не осталось транзакций, удаляем её
          if (statement.transactions.length === 0) {
            statements.value.splice(i, 1);
          }
          break;
        }
      }
      notify("Транзакция удалена из несохраненных данных", "success");

      // Принудительно обновляем таблицу для несохраненных данных
      tableKey.value++;
    }

    // Закрываем модальное окно
    showDeleteModal.value = false;
    transactionToDelete.value = null;
  } catch (error) {
    console.error("Ошибка при удалении транзакции:", error);
    notify("Ошибка при удалении транзакции", "error");
  }
}

// Отмена удаления
function cancelDelete() {
  showDeleteModal.value = false;
  transactionToDelete.value = null;
}

// Копирование транзакции
async function copyTransaction(transaction) {
  try {
    // Создаем копию транзакции без ID и с новой датой создания
    const copiedTransaction = {
      ...transaction,
      id: undefined, // Убираем старый ID
      description: `${transaction.description} (копия)`,
      createdAt: new Date().toISOString(),
    };

    if (isDatabaseMode.value) {
      // Сохраняем копию в базу данных
      await saveTransactionToDb(copiedTransaction);

      // Перезагружаем данные из базы для обновления таблицы
      await loadStatementsFromDb();
      // Принудительно обновляем таблицу
      tableKey.value++;

      notify("Транзакция скопирована в базу данных", "success");
    } else {
      // Добавляем копию в statements (несохраненные данные)
      const manualStatement = {
        fileName: "Копия транзакции",
        transactions: [copiedTransaction],
        period: {
          from: new Date(copiedTransaction.date),
          to: new Date(copiedTransaction.date),
        },
        meta: {
          source: "copy",
          addedAt: new Date().toISOString(),
        },
      };

      statements.value.push(manualStatement);

      // Принудительно обновляем таблицу
      tableKey.value++;

      notify("Транзакция скопирована в несохраненные данные", "success");
    }
  } catch (error) {
    console.error("Ошибка при копировании транзакции:", error);
    notify("Ошибка при копировании транзакции", "error");
  }
}

defineExpose({
  addStatement,
  addManualTransaction,
  copyTransaction,
  loadStatementsFromDb,
  clearStatements,
  exportData,
  importData,
  clearAllData,
  showClearAllConfirmation,
  getAllTransactions,
  getCategories: () => availableCategories.value,
  getBanks,
  saveAllToDb,
  setDatabaseMode,
  statements,
  isDatabaseMode,
});
</script>

<template>
  <!-- Заголовок таблицы -->
  <div class="mb-4">
    <h3 class="text-lg font-semibold text-gray-900">
      {{ isDatabaseMode ? "📊 Все транзакции" : "📋 Загруженные данные" }}
    </h3>
    <p class="text-gray-600 text-sm">
      {{
        isDatabaseMode
          ? "Просмотр и анализ всех сохраненных транзакций"
          : "Просмотрите данные перед сохранением в базу"
      }}
    </p>
  </div>

  <!-- Уведомления -->
  <div class="fixed top-2 right-2 z-50 flex flex-col gap-2">
    <div
      v-for="n in notifications"
      :key="n.id"
      :class="[
        'px-4 py-2 rounded shadow text-sm',
        n.type === 'success'
          ? 'bg-green-100 text-green-800'
          : n.type === 'warning'
          ? 'bg-yellow-100 text-yellow-800'
          : n.type === 'error'
          ? 'bg-red-100 text-red-800'
          : 'bg-blue-100 text-blue-800',
      ]"
    >
      {{ n.msg }}
    </div>
  </div>

  <!-- Список выписок (только в режиме загрузки файлов) -->
  <div v-if="!isDatabaseMode && statements.length > 0" class="mb-4 space-y-3">
    <!-- Кнопка сохранения всех выписок -->
    <div class="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-3">
      <div class="flex items-center">
        <div class="text-blue-600 text-lg mr-2">💾</div>
        <div>
          <h3 class="font-medium text-blue-800">Несохраненные данные</h3>
          <p class="text-sm text-blue-700">Загружено выписок: {{ statements.length }}</p>
        </div>
      </div>
      <button
        @click="emit('saveToDatabase')"
        class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
      >
        💾 Сохранить все в базу
      </button>
    </div>
  </div>

  <!-- Фильтры -->
  <div class="mb-4 flex flex-wrap gap-2 items-end">
    <div>
      <label class="block text-xs mb-1">Банк</label>
      <select v-model="selectedBank" class="border rounded px-2 py-1 h-8">
        <option value="">Все</option>
        <option v-for="b in banks" :key="b" :value="b">{{ b }}</option>
      </select>
    </div>
    <div>
      <label class="block text-xs mb-1">Категория</label>
      <select v-model="selectedCategory" class="border rounded px-2 py-1 h-8">
        <option value="">Все</option>
        <option v-for="c in availableCategories" :key="c" :value="c">{{ c }}</option>
      </select>
    </div>
    <div>
      <label class="block text-xs mb-1">Год</label>
      <select
        v-model="selectedYear"
        @change="onYearChange"
        class="border rounded px-2 py-1 h-8 min-w-20"
      >
        <option value="">Все годы</option>
        <option v-for="year in availableYears" :key="year" :value="year">
          {{ year }}
        </option>
      </select>
    </div>
    <div>
      <label class="block text-xs mb-1">Месяц</label>
      <select
        v-model="selectedMonth"
        @change="onMonthChange"
        class="border rounded px-2 py-1 h-8 min-w-24"
      >
        <option value="">Все месяцы</option>
        <option v-for="month in availableMonths" :key="month.value" :value="month.value">
          {{ month.label }}
        </option>
      </select>
    </div>
    <div>
      <label class="block text-xs mb-1">Дата с</label>
      <input
        type="date"
        v-model="dateFrom"
        @change="syncSelectedMonth"
        class="border rounded px-2 py-1 h-8"
      />
    </div>
    <div>
      <label class="block text-xs mb-1">Дата по</label>
      <input
        type="date"
        v-model="dateTo"
        @change="syncSelectedMonth"
        class="border rounded px-2 py-1 h-8"
      />
    </div>
    <div>
      <label class="block text-xs mb-1">Поиск</label>
      <input
        type="text"
        v-model="search"
        placeholder="Описание, категория, комментарий..."
        class="border rounded px-2 py-1 h-8"
      />
    </div>

    <div>
      <label class="block text-xs mb-1">&nbsp;</label>
      <button
        @click="resetFilters"
        class="px-3 py-1 h-8 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors text-xs font-medium"
        title="Сбросить все фильтры"
      >
        🔄 Сброс
      </button>
    </div>

    <div class="ml-auto text-xs text-gray-500">Показано: {{ filtered.length }}</div>
  </div>

  <!-- Кнопки массового удаления и редактирования -->
  <div
    v-if="getSelectedTransactionsCount() > 0"
    class="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg"
  >
    <div class="flex items-center justify-between">
      <div class="flex items-center space-x-4">
        <span class="text-sm font-medium text-blue-800">
          Выбрано: {{ getSelectedTransactionsCount() }} транзакций
        </span>
        <button
          @click="deselectAllTransactions"
          class="text-sm text-blue-600 hover:text-blue-800 underline"
        >
          Снять выделение
        </button>
      </div>
      <div class="flex items-center space-x-2">
        <button
          @click="showBulkEditConfirmation"
          class="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors text-sm"
        >
          ✏️ Редактировать выбранные
        </button>
        <button
          @click="showBulkDeleteConfirmation"
          class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors text-sm"
        >
          Удалить выбранные ({{ getSelectedTransactionsCount() }})
        </button>
      </div>
    </div>
  </div>

  <Table :data="filtered" :key="tableKey">
    <template #header>
      <th class="w-8">
        <input
          type="checkbox"
          :checked="getSelectedTransactionsCount() === filtered.length && filtered.length > 0"
          :indeterminate="
            getSelectedTransactionsCount() > 0 && getSelectedTransactionsCount() < filtered.length
          "
          @change="
            getSelectedTransactionsCount() === filtered.length
              ? deselectAllTransactions()
              : selectAllTransactions()
          "
          class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
        />
      </th>
      <th class="cursor-pointer whitespace-nowrap" @click="setSort('date')">
        Дата
        <span v-if="sortField === 'date'">{{ sortDirection === "asc" ? "▲" : "▼" }}</span>
      </th>
      <th class="cursor-pointer whitespace-nowrap" @click="setSort('bank')">
        Банк
        <span v-if="sortField === 'bank'">{{ sortDirection === "asc" ? "▲" : "▼" }}</span>
      </th>
      <th class="table-description">Описание</th>
      <th class="cursor-pointer whitespace-nowrap" @click="setSort('amount')">
        Сумма
        <span v-if="sortField === 'amount'">{{ sortDirection === "asc" ? "▲" : "▼" }}</span>
      </th>
      <th class="cursor-pointer whitespace-nowrap table-category" @click="setSort('category')">
        Категория
        <span v-if="sortField === 'category'">{{ sortDirection === "asc" ? "▲" : "▼" }}</span>
      </th>
      <th class="table-comment min-w-40 max-w-60">Комментарий</th>
      <th class="whitespace-nowrap w-24">Действия</th>
    </template>
    <template #row="{ row }">
      <td class="w-8">
        <input
          type="checkbox"
          :checked="isTransactionSelected(row)"
          @change="toggleTransactionSelection(getTransactionId(row))"
          class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
        />
      </td>
      <td class="whitespace-nowrap">
        <DateEditor :value="row.date" @update:value="(newDate) => onDateUpdate(row, newDate)" />
      </td>
      <td class="whitespace-nowrap px-4">
        <UniversalSelect
          v-model="row.bank"
          :items="banks"
          placeholder="Выберите банк"
          item-name="банк"
          :allow-add-new="true"
          @update:modelValue="(value) => onEdit(row, 'bank', value, true)"
          @item-added="(newBank) => onBankAdded(newBank)"
          @focus="startEditing"
          @blur="endEditing"
        />
      </td>
      <td
        class="table-description"
        contenteditable
        :title="row.description"
        @focus="startEditing"
        @blur="onEdit(row, 'description', $event.target.innerText, true)"
        @keydown.enter.prevent="$event.target.blur()"
      >
        {{ row.description }}
      </td>
      <td
        :class="row.amount > 0 ? 'text-green-600' : 'text-red-600'"
        contenteditable
        @focus="startEditing"
        @blur="onEdit(row, 'amount', $event.target.innerText, true)"
        @keydown.enter.prevent="$event.target.blur()"
      >
        {{ row.amount > 0 ? "+" : ""
        }}{{
          row.amount.toLocaleString("ru-RU", {
            style: "currency",
            currency: "RUB",
            minimumFractionDigits: 2,
          })
        }}
      </td>
      <td class="table-category">
        <CategorySelect
          v-model="row.category"
          :categories="availableCategories"
          :key="`${row.id || row.date}-${row.description}-${row.amount}-${
            row.category
          }-${tableKey}`"
          @category-added="onCategoryAdded"
          @update:modelValue="(value) => onEdit(row, 'category', value, true)"
          @focus="startEditing"
          @blur="endEditing"
        />
      </td>
      <td
        class="table-comment"
        contenteditable
        :title="row.comment || ''"
        @focus="startEditing"
        @blur="onEdit(row, 'comment', $event.target.innerText, true)"
        @keydown.enter.prevent="$event.target.blur()"
      >
        {{ row.comment || "" }}
      </td>
      <td class="whitespace-nowrap">
        <div class="flex gap-1">
          <button
            @click="copyTransaction(row)"
            class="px-2 py-1 bg-blue-300 text-white rounded hover:bg-blue-500 transition-colors text-xs"
            title="Копировать транзакцию"
          >
            📋
          </button>
          <button
            @click="showDeleteConfirmation(row)"
            class="px-2 py-1 bg-red-300 text-white rounded hover:bg-red-500 transition-colors text-xs"
            title="Удалить транзакцию"
          >
            🗑️
          </button>
        </div>
      </td>
    </template>
  </Table>

  <!-- Итоговая сумма по выбранным фильтрам -->
  <div class="mt-3 flex items-center justify-between text-sm text-gray-700 bg-gray-50 p-3 rounded border">
    <div>Показано: {{ filtered.length }}</div>
    <div>
      Итого по фильтрам:
      <span :class="filteredTotal >= 0 ? 'text-green-700' : 'text-red-700'">
        {{ filteredTotal >= 0 ? '+' : '' }}{{
          filteredTotal.toLocaleString('ru-RU', {
            style: 'currency',
            currency: 'RUB',
            minimumFractionDigits: 0,
          })
        }}
      </span>
    </div>
  </div>

  <!-- Модальное окно подтверждения удаления -->
  <div
    v-if="showDeleteModal"
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    @click="cancelDelete"
  >
    <div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4" @click.stop>
      <div class="p-6">
        <div class="flex items-center mb-4">
          <div class="text-red-500 text-2xl mr-3">⚠️</div>
          <h3 class="text-lg font-semibold text-gray-900">Удалить транзакцию?</h3>
        </div>

        <div class="mb-6">
          <p class="text-gray-600 mb-3">Вы действительно хотите удалить эту транзакцию?</p>
          <div class="bg-gray-50 p-3 rounded border">
            <div class="text-sm">
              <div class="font-medium">{{ transactionToDelete?.description }}</div>
              <div class="text-gray-500">
                {{
                  transactionToDelete?.date
                    ? parseDate(transactionToDelete.date)?.toLocaleDateString()
                    : ""
                }}
                • {{ transactionToDelete?.bank }} •
                <span :class="transactionToDelete?.amount > 0 ? 'text-green-600' : 'text-red-600'">
                  {{ transactionToDelete?.amount > 0 ? "+" : ""
                  }}{{
                    transactionToDelete?.amount?.toLocaleString("ru-RU", {
                      style: "currency",
                      currency: "RUB",
                    })
                  }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="flex space-x-3">
          <button
            @click="cancelDelete"
            class="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Отмена
          </button>
          <button
            @click="deleteTransaction"
            class="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
          >
            Удалить
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Модальное окно подтверждения очистки всех данных -->
  <div
    v-if="showClearAllModal"
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    @click="cancelClearAll"
  >
    <div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4" @click.stop>
      <div class="p-6">
        <div class="flex items-center mb-4">
          <div class="text-red-500 text-2xl mr-3">🗑️</div>
          <h3 class="text-lg font-semibold text-gray-900">Очистить все данные?</h3>
        </div>

        <div class="mb-6">
          <p class="text-gray-600 mb-3">
            Вы действительно хотите удалить ВСЕ данные из базы? Это действие нельзя отменить.
          </p>
          <div class="bg-red-50 p-3 rounded border border-red-200">
            <div class="text-sm text-red-700">
              <div class="font-medium">⚠️ Внимание!</div>
              <div>Все транзакции, категории и настройки будут безвозвратно удалены.</div>
            </div>
          </div>
        </div>

        <div class="flex space-x-3">
          <button
            @click="cancelClearAll"
            class="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Отмена
          </button>
          <button
            @click="clearAllData"
            class="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
          >
            Очистить все
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Модальное окно подтверждения массового удаления -->
  <div
    v-if="showBulkDeleteModal"
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    @click="cancelBulkDelete"
  >
    <div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4" @click.stop>
      <div class="p-6">
        <div class="flex items-center mb-4">
          <div class="text-red-500 text-2xl mr-3">⚠️</div>
          <h3 class="text-lg font-semibold text-gray-900">Удалить выбранные транзакции?</h3>
        </div>

        <div class="mb-6">
          <p class="text-gray-600 mb-3">
            Вы действительно хотите удалить {{ getSelectedTransactionsCount() }} транзакций? Это
            действие нельзя отменить.
          </p>
          <div class="bg-red-50 p-3 rounded border border-red-200">
            <div class="text-sm text-red-700">
              <div class="font-medium">⚠️ Внимание!</div>
              <div>Выбранные транзакции будут безвозвратно удалены.</div>
            </div>
          </div>
        </div>

        <div class="flex space-x-3">
          <button
            @click="cancelBulkDelete"
            class="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Отмена
          </button>
          <button
            @click="deleteSelectedTransactions"
            class="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
          >
            Удалить {{ getSelectedTransactionsCount() }}
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Модальное окно массового редактирования -->
  <div
    v-if="showBulkEditModal"
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    @click="cancelBulkEdit"
  >
    <div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4" @click.stop>
      <div class="p-6">
        <div class="flex items-center mb-4">
          <div class="text-green-500 text-2xl mr-3">✏️</div>
          <h3 class="text-lg font-semibold text-gray-900">Редактировать выбранные транзакции</h3>
        </div>

        <div class="mb-6">
          <p class="text-gray-600 mb-4">
            Будет обновлено <strong>{{ getSelectedTransactionsCount() }}</strong> транзакций.
            Оставьте поле пустым, если не хотите его изменять.
          </p>

          <div class="space-y-4">
            <!-- Описание -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Описание</label>
              <input
                v-model="bulkEditDescription"
                type="text"
                placeholder="Оставить без изменений"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <!-- Банк -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Банк</label>
              <UniversalSelect
                v-model="bulkEditBank"
                :items="banks"
                placeholder="Оставить без изменений"
                item-name="банк"
                :allow-add-new="true"
                @item-added="(newBank) => onBankAdded(newBank)"
              />
            </div>

            <!-- Категория -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Категория</label>
              <CategorySelect
                v-model="bulkEditCategory"
                :categories="availableCategories"
                placeholder="Оставить без изменений"
                @category-added="onCategoryAdded"
              />
            </div>
          </div>
        </div>

        <div class="flex space-x-3">
          <button
            @click="cancelBulkEdit"
            class="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Отмена
          </button>
          <button
            @click="saveBulkEdit"
            class="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
          >
            Применить к {{ getSelectedTransactionsCount() }} транзакциям
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
th {
  user-select: none;
  text-align: left;
}
</style>

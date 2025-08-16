<!-- eslint-disable vue/multi-word-component-names -->
<script setup>
import { ref, computed, nextTick, watch } from "vue";
import Table from "./ui/Table.vue";
import CategorySelect from "./ui/CategorySelect.vue";
import {
  aggregateTransactions,
  filterAndSortTransactions,
  removeDuplicateTransactions,
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
  checkDuplicateTransactions,
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

// Состояние для модальных окон
const showDeleteModal = ref(false);
const transactionToDelete = ref(null);
const showClearAllModal = ref(false);

// Состояние для массового удаления
const selectedTransactions = ref(new Set());
const showBulkDeleteModal = ref(false);

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
    // Проверяем дубликаты в базе данных
    const { uniqueTransactions, duplicateCount, uniqueCount } = await checkDuplicateTransactions(
      newStatement.transactions
    );

    // Создаем новую выписку только с уникальными транзакциями
    const filteredStatement = {
      ...newStatement,
      transactions: uniqueTransactions,
    };

    // Подсчёт новых и дублирующихся транзакций (локально)
    const allTx = aggregateTransactions(statements.value);
    const newTx = filteredStatement.transactions;
    const uniqueNew =
      removeDuplicateTransactions([...allTx, ...newTx]).length -
      removeDuplicateTransactions(allTx).length;
    const localDups = newTx.length - uniqueNew;

    statements.value.push(filteredStatement);

    // Обновляем ключ таблицы для принудительного перерендера
    tableKey.value = tableKey.value + 1;

    // Показываем уведомления
    if (uniqueCount > 0) {
      notify(`Добавлено новых транзакций: ${uniqueCount}`, "success");
    }
    if (duplicateCount > 0) {
      notify(`Дубликатов в БД: ${duplicateCount}`, "warning");
    }
    if (localDups > 0) {
      notify(`Локальных дубликатов: ${localDups}`, "info");
    }
    if (uniqueCount === 0) {
      notify("Все транзакции уже есть в базе данных", "info");
    }
  } catch (error) {
    console.error("Ошибка при проверке дубликатов:", error);
    notify("Ошибка при проверке дубликатов", "error");
  }
}

// Функция для установки дат по умолчанию (от начала года до сегодня)
function setDefaultDates() {
  const today = new Date();
  const startOfYear = new Date(today.getFullYear(), 0, 1); // 1 января текущего года

  dateFrom.value = startOfYear.toISOString().split("T")[0];
  dateTo.value = today.toISOString().split("T")[0];
}

function resetFilters() {
  selectedBank.value = "";
  selectedCategory.value = "";
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
const selectedMonth = ref("");
const search = ref("");
const sortField = ref("date");
const sortDirection = ref("desc");

// Устанавливаем даты по умолчанию при инициализации
setDefaultDates();

// Генерируем список месяцев для селекта
const availableMonths = computed(() => {
  const months = [];
  const today = new Date();
  const currentYear = today.getFullYear();

  // Добавляем месяцы за последние 2 года и следующие 6 месяцев
  for (let year = currentYear - 2; year <= currentYear + 1; year++) {
    for (let month = 0; month < 12; month++) {
      const date = new Date(year, month, 1);
      const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
      const monthLabel = date.toLocaleDateString("ru-RU", {
        year: "numeric",
        month: "long",
      });
      months.push({ key: monthKey, label: monthLabel, date });
    }
  }

  // Сортируем по дате (новые сначала)
  return months.sort((a, b) => b.date - a.date);
});

// Обработчик изменения выбранного месяца
function onMonthChange(monthKey) {
  if (!monthKey) {
    // Сброс фильтра по месяцу
    setDefaultDates();
    selectedMonth.value = "";
    return;
  }

  const [year, month] = monthKey.split("-").map(Number);
  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0); // Последний день месяца

  dateFrom.value = startOfMonth.toISOString().split("T")[0];
  dateTo.value = endOfMonth.toISOString().split("T")[0];
  selectedMonth.value = monthKey;
}

// Синхронизация выбранного месяца с полями дат
function syncSelectedMonth() {
  if (!dateFrom.value || !dateTo.value) {
    selectedMonth.value = "";
    return;
  }

  const fromDate = new Date(dateFrom.value);
  const toDate = new Date(dateTo.value);

  // Проверяем, соответствует ли диапазон дат целому месяцу
  const fromMonth = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
  const toMonth = new Date(toDate.getFullYear(), toDate.getMonth() + 1, 0);

  if (fromDate.getTime() === fromMonth.getTime() && toDate.getTime() === toMonth.getTime()) {
    const monthKey = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(
      2,
      "0"
    )}`;
    selectedMonth.value = monthKey;
  } else {
    selectedMonth.value = "";
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

// Доступные категории для селекта (включая дефолтные)
const availableCategories = computed(() => {
  const defaultCategories = [
    "Продукты",
    "Доставка еды",
    "Кофе",
    "Товары для дома",
    "Кафе и рестораны",
    "Вода",
    "Коты",
    "Кварт.плата",
    "Интернет и телефон",
    "Аптеки",
    "Здоровье",
    "Фитнес",
    "Развлечения",
    "Хобби",
    "Техника",
    "Одежда",
    "Обувь",
    "Аксессуары",
    "Топливо",
    "Машина",
    "Красота",
    "Косметика",
    "Повседневные товары для ухода",
    "Семья",
    "Подарки друзьям",
    "Траты на ком.услуги дома",
    "Недвижимость",
    "Мебель",
    "Ремонт",
    "Экстра траты ЗП Ви",
    "ЗП Лё",
    "Прочие доходы Ви",
    "Прочие доходы Лё",
    "Кэшбэк",
    "% на остаток и вклады",
    "Налоги",
    "Прочее",
  ];

  // Объединяем дефолтные категории с уже существующими в данных и пользовательскими
  const existingCategories = categories.value;
  const allCategories = [
    ...new Set([...defaultCategories, ...existingCategories, ...userCategories.value]),
  ];

  return allCategories.sort();
});

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
    { field: sortField.value, direction: sortDirection.value }
  );

  return arr;
});

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
      // Удаляем дубликаты из загруженных транзакций
      const uniqueTransactions = removeDuplicateTransactions(loadedTransactions);

      if (uniqueTransactions.length < loadedTransactions.length) {
        const duplicateCount = loadedTransactions.length - uniqueTransactions.length;

        // Физически удаляем дубликаты из базы данных
        const seen = new Set();
        const duplicateIds = [];

        for (const transaction of loadedTransactions) {
          const key = [
            transaction.date instanceof Date
              ? transaction.date.toISOString().slice(0, 10)
              : transaction.date,
            transaction.amount,
            (transaction.description || "").replace(/\s+/g, "").toLowerCase(),
            transaction.bank,
            transaction.category || "",
          ].join("|");

          if (seen.has(key)) {
            // Это дубликат, добавляем ID для удаления
            if (transaction.id) {
              duplicateIds.push(transaction.id);
            }
          } else {
            seen.add(key);
          }
        }

        // Удаляем дубликаты из БД
        for (const duplicateId of duplicateIds) {
          await deleteTransactionFromDb(duplicateId);
        }

        notify(`Удалено ${duplicateCount} дубликатов из базы данных`, "info");
      }

      // Группируем транзакции по банку для совместимости с существующим кодом
      const groupedByBank = {};
      uniqueTransactions.forEach((transaction) => {
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
      notify(
        `Загружено ${uniqueTransactions.length} уникальных транзакций из IndexedDB`,
        "success"
      );
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

async function onEdit(row, field, value) {
  // Преобразуем amount к числу, если редактируется сумма
  if (field === "amount") {
    const num = parseFloat(value.replace(/[^\d\-.,]/g, "").replace(",", "."));
    row.amount = isNaN(num) ? 0 : num;
  } else {
    // Для других полей (включая category) обновляем значение
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
      console.error("Ошибка при сохранении изменений:", error);
      notify("Ошибка при сохранении изменений", "error");
    }
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
      <label class="block text-xs mb-1">Месяц</label>
      <select
        v-model="selectedMonth"
        @change="onMonthChange($event.target.value)"
        class="border rounded px-2 py-1 h-8 min-w-32"
      >
        <option value="">Все месяцы</option>
        <option v-for="month in availableMonths" :key="month.key" :value="month.key">
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
        placeholder="Описание, категория..."
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

  <!-- Кнопки массового удаления -->
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
      <button
        @click="showBulkDeleteConfirmation"
        class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors text-sm"
      >
        Удалить выбранные ({{ getSelectedTransactionsCount() }})
      </button>
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
        {{ row.date ? parseDate(row.date)?.toLocaleDateString() : "" }}
      </td>
      <td class="whitespace-nowrap px-4">{{ row.bank }}</td>
      <td
        class="table-description"
        contenteditable
        :title="row.description"
        @blur="onEdit(row, 'description', $event.target.innerText)"
      >
        {{ row.description }}
      </td>
      <td
        :class="row.amount > 0 ? 'text-green-600' : 'text-red-600'"
        contenteditable
        @blur="onEdit(row, 'amount', $event.target.innerText)"
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
          @update:modelValue="(value) => onEdit(row, 'category', value)"
        />
      </td>
      <td
        class="table-comment"
        contenteditable
        :title="row.comment || ''"
        @blur="onEdit(row, 'comment', $event.target.innerText)"
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
</template>

<style scoped>
th {
  user-select: none;
  text-align: left;
}
</style>

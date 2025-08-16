import { set, get, del, keys } from "idb-keyval";

const TRANSACTION_PREFIX = "transaction-";
const CATEGORIES_KEY = "categories";

// Генерация уникального ID для транзакции
function generateTransactionId() {
  return TRANSACTION_PREFIX + Date.now() + "-" + Math.random().toString(36).substr(2, 9);
}

// Нормализация категорий - объединяем "Прочее" и "Прочие операции"
function normalizeCategory(category) {
  if (!category) return "Прочее";

  const normalized = category.trim();

  // Объединяем все варианты "прочие" в "Прочее"
  if (
    normalized === "Прочие операции" ||
    normalized === "Прочие" ||
    normalized === "прочие операции" ||
    normalized === "прочие"
  ) {
    return "Прочее";
  }

  return normalized;
}

// Сохранение отдельной транзакции
export async function saveTransactionToDb(transaction) {
  try {
    // Проверяем, что банк присутствует
    if (!transaction.bank) {
      console.warn("Транзакция без банка:", transaction);
    }

    const transactionId = generateTransactionId();

    // Нормализуем категорию и дату перед сохранением
    const normalizedTransaction = {
      ...transaction,
      category: normalizeCategory(transaction.category),
      // Убеждаемся, что банк сохраняется
      bank: transaction.bank || "Неизвестный банк",
      // Нормализуем дату
      date: transaction.date instanceof Date ? transaction.date.toISOString() : transaction.date,
    };

    // Добавляем ID к транзакции
    const transactionWithId = {
      ...normalizedTransaction,
      id: transactionId,
      createdAt: new Date().toISOString(),
    };

    // Сохраняем только plain-объект (без Proxy, функций и т.д.)
    const plainTransaction = JSON.parse(JSON.stringify(transactionWithId));
    await set(transactionId, plainTransaction);

    return transactionId;
  } catch (error) {
    console.error("Ошибка при сохранении транзакции:", error);
    throw error;
  }
}

// Сохранение массива транзакций
export async function saveTransactionsToDb(transactions) {
  try {
    const savedIds = [];
    for (const transaction of transactions) {
      const id = await saveTransactionToDb(transaction);
      savedIds.push(id);
    }
    return savedIds;
  } catch (error) {
    console.error("Ошибка при сохранении транзакций:", error);
    throw error;
  }
}

// Получение всех транзакций из БД
export async function getAllTransactionsFromDb() {
  try {
    const allKeys = await keys();
    const transactionKeys = allKeys.filter(
      (k) => typeof k === "string" && k.startsWith(TRANSACTION_PREFIX)
    );

    const transactions = [];
    for (const key of transactionKeys) {
      const transaction = await get(key);
      if (transaction) {
        // Восстанавливаем дату из строки в Date объект
        const normalizedTransaction = {
          ...transaction,
          date: transaction.date ? new Date(transaction.date) : null,
        };
        transactions.push(normalizedTransaction);
      }
    }

    return transactions;
  } catch (error) {
    console.error("Ошибка при получении транзакций:", error);
    return [];
  }
}

// Проверка дубликатов транзакций в БД
export async function checkDuplicateTransactions(newTransactions) {
  try {
    const existingTransactions = await getAllTransactionsFromDb();

    const duplicates = [];
    const uniqueTransactions = [];

    for (const newTransaction of newTransactions) {
      const isDuplicate = existingTransactions.some((existing) => {
        // Нормализуем даты для сравнения
        const normalizeDate = (date) => {
          if (date instanceof Date) {
            return date.toISOString().slice(0, 10);
          }
          if (typeof date === "string") {
            return new Date(date).toISOString().slice(0, 10);
          }
          return date;
        };

        const existingDate = normalizeDate(existing.date);
        const newDate = normalizeDate(newTransaction.date);
        const dateMatch = existingDate === newDate;

        const amountMatch = existing.amount === newTransaction.amount;
        const bankMatch = existing.bank === newTransaction.bank;
        const descriptionMatch =
          (existing.description || "").replace(/\s+/g, "").toLowerCase() ===
          (newTransaction.description || "").replace(/\s+/g, "").toLowerCase();
        const categoryMatch = (existing.category || "") === (newTransaction.category || "");

        const isDuplicate =
          dateMatch && amountMatch && bankMatch && descriptionMatch && categoryMatch;

        return isDuplicate;
      });

      if (isDuplicate) {
        duplicates.push(newTransaction);
      } else {
        uniqueTransactions.push(newTransaction);
      }
    }

    return {
      duplicates,
      uniqueTransactions,
      duplicateCount: duplicates.length,
      uniqueCount: uniqueTransactions.length,
    };
  } catch (error) {
    console.error("Ошибка при проверке дубликатов:", error);
    throw error;
  }
}

// Обновление отдельной транзакции
export async function updateTransactionInDb(transactionId, updatedFields) {
  try {
    const existingTransaction = await get(transactionId);
    if (!existingTransaction) {
      throw new Error(`Транзакция с ID ${transactionId} не найдена`);
    }

    // Нормализуем категорию, если она обновляется
    const normalizedFields = { ...updatedFields };
    if (normalizedFields.category !== undefined) {
      normalizedFields.category = normalizeCategory(normalizedFields.category);
    }

    const updatedTransaction = {
      ...existingTransaction,
      ...normalizedFields,
      updatedAt: new Date().toISOString(),
    };

    await set(transactionId, updatedTransaction);
    return updatedTransaction;
  } catch (error) {
    console.error("Ошибка при обновлении транзакции:", error);
    throw error;
  }
}

// Удаление отдельной транзакции
export async function deleteTransactionFromDb(transactionId) {
  try {
    await del(transactionId);
    return true;
  } catch (error) {
    console.error("Ошибка при удалении транзакции:", error);
    throw error;
  }
}

// Удаление всех транзакций
export async function deleteAllTransactionsFromDb() {
  try {
    const allKeys = await keys();
    const transactionKeys = allKeys.filter(
      (k) => typeof k === "string" && k.startsWith(TRANSACTION_PREFIX)
    );

    for (const key of transactionKeys) {
      await del(key);
    }

    return { success: true, deletedCount: transactionKeys.length };
  } catch (error) {
    console.error("Ошибка при удалении всех транзакций:", error);
    throw error;
  }
}

// Функции для работы с категориями
export async function saveCategoriesToDb(categories) {
  try {
    const categoriesData = {
      categories: categories,
      updatedAt: new Date().toISOString(),
      version: "1.0",
    };
    await set(CATEGORIES_KEY, categoriesData);
    return true;
  } catch (error) {
    console.error("Ошибка при сохранении категорий:", error);
    throw error;
  }
}

export async function getCategoriesFromDb() {
  try {
    const categoriesData = await get(CATEGORIES_KEY);
    if (categoriesData && categoriesData.categories) {
      return categoriesData.categories;
    }
    return null;
  } catch (error) {
    console.error("Ошибка при получении категорий:", error);
    return null;
  }
}

export async function addCategoryToDb(newCategory) {
  try {
    const existingCategories = await getCategoriesFromDb();
    let categories = existingCategories || [];

    if (!categories.includes(newCategory)) {
      categories.push(newCategory);
      categories.sort();
      await saveCategoriesToDb(categories);
    }

    return categories;
  } catch (error) {
    console.error("Ошибка при добавлении категории:", error);
    throw error;
  }
}

export async function updateCategoryInDb(oldCategory, newCategory) {
  try {
    const existingCategories = await getCategoriesFromDb();
    if (!existingCategories) return null;

    const index = existingCategories.indexOf(oldCategory);
    if (index !== -1) {
      existingCategories[index] = newCategory;
      existingCategories.sort();
      await saveCategoriesToDb(existingCategories);
    }

    return existingCategories;
  } catch (error) {
    console.error("Ошибка при обновлении категории:", error);
    throw error;
  }
}

export async function deleteCategoryFromDb(categoryToDelete) {
  try {
    const existingCategories = await getCategoriesFromDb();
    if (!existingCategories) return null;

    const filteredCategories = existingCategories.filter((cat) => cat !== categoryToDelete);
    await saveCategoriesToDb(filteredCategories);

    return filteredCategories;
  } catch (error) {
    console.error("Ошибка при удалении категории:", error);
    throw error;
  }
}

// Обновляем функцию экспорта, чтобы включить категории
export async function exportAllDataFromDb() {
  try {
    const allTransactions = await getAllTransactionsFromDb();
    const categories = await getCategoriesFromDb();

    const exportData = {
      version: "2.0", // Обновляем версию для нового формата
      exportedAt: new Date().toISOString(),
      format: "transactions", // Указываем формат данных
      transactions: allTransactions,
      categories: categories || [],
      summary: {
        totalTransactions: allTransactions.length,
        totalCategories: categories ? categories.length : 0,
        banks: [...new Set(allTransactions.map((t) => t.bank))],
        dateRange:
          allTransactions.length > 0
            ? {
                from: new Date(Math.min(...allTransactions.map((t) => new Date(t.date)))),
                to: new Date(Math.max(...allTransactions.map((t) => new Date(t.date)))),
              }
            : null,
      },
    };

    // Создаем файл для скачивания
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `family-budget-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return {
      success: true,
      count: allTransactions.length,
      categoriesCount: categories ? categories.length : 0,
    };
  } catch (error) {
    console.error("Ошибка при экспорте данных:", error);
    throw error;
  }
}

// Функция импорта данных
export async function importDataToDb(jsonData) {
  try {
    const data = typeof jsonData === "string" ? JSON.parse(jsonData) : jsonData;

    if (!data.transactions || !Array.isArray(data.transactions)) {
      throw new Error("Неверный формат файла: отсутствует массив transactions");
    }

    let importedCount = 0;
    for (const transaction of data.transactions) {
      if (transaction) {
        // Удаляем старые ID и метаданные, если они есть
        const {
          id: _id,
          createdAt: _createdAt,
          updatedAt: _updatedAt,
          ...cleanTransaction
        } = transaction;
        // saveTransactionToDb автоматически нормализует категорию
        await saveTransactionToDb(cleanTransaction);
        importedCount++;
      }
    }

    // Восстанавливаем категории, если они есть
    if (data.categories && Array.isArray(data.categories)) {
      await saveCategoriesToDb(data.categories);
    }

    return { success: true, count: importedCount, categoriesRestored: !!data.categories };
  } catch (error) {
    console.error("Ошибка при импорте данных:", error);
    throw error;
  }
}

// Обновляем функцию очистки, чтобы также очистить категории
export async function clearAllDataFromDb() {
  try {
    const allKeys = await keys();
    const transactionKeys = allKeys.filter(
      (k) => typeof k === "string" && k.startsWith(TRANSACTION_PREFIX)
    );

    for (const key of transactionKeys) {
      await del(key);
    }

    // Очищаем категории
    await del(CATEGORIES_KEY);

    return { success: true, deletedCount: transactionKeys.length };
  } catch (error) {
    console.error("Ошибка при очистке базы данных:", error);
    throw error;
  }
}

// Функция для удаления дубликатов из базы данных
export async function removeDuplicateTransactionsFromDb() {
  try {
    const allTransactions = await getAllTransactionsFromDb();

    if (allTransactions.length === 0) {
      return { success: true, removedCount: 0, remainingCount: 0 };
    }

    // Используем ту же логику, что и в removeDuplicateTransactions
    const seen = new Set();
    const uniqueTransactions = [];
    const duplicateIds = [];

    for (const transaction of allTransactions) {
      // Нормализуем даты для сравнения
      const normalizeDate = (date) => {
        if (date instanceof Date) {
          return date.toISOString().slice(0, 10);
        }
        if (typeof date === "string") {
          return new Date(date).toISOString().slice(0, 10);
        }
        return date;
      };

      const transactionDate = normalizeDate(transaction.date);
      const key = [
        transactionDate,
        transaction.amount,
        (transaction.description || "").replace(/\s+/g, "").toLowerCase(),
        transaction.bank,
        transaction.category || "",
      ].join("|");

      if (seen.has(key)) {
        duplicateIds.push(transaction.id);
      } else {
        seen.add(key);
        uniqueTransactions.push(transaction);
      }
    }

    // Удаляем дубликаты из БД
    for (const duplicateId of duplicateIds) {
      await del(duplicateId);
    }

    return {
      success: true,
      removedCount: duplicateIds.length,
      remainingCount: uniqueTransactions.length,
    };
  } catch (error) {
    console.error("Ошибка при удалении дубликатов из БД:", error);
    throw error;
  }
}

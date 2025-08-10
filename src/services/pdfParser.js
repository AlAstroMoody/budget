import * as pdfjsLib from "pdfjs-dist";
import { createBankParser } from "./bankParsers.js";

// Настройка worker для pdfjs (используем локальный файл)
pdfjsLib.GlobalWorkerOptions.workerSrc = "/budget/pdf.worker.min.mjs";

/**
 * Сервис для парсинга PDF файлов с банковскими выписками
 */
export class PdfParser {
  constructor() {
    this.supportedBanks = {
      sberbank: {
        name: "Сбербанк",
        patterns: [
          // Паттерн для PDF выписок Сбербанка
          {
            datePattern: /(\d{2}\.\d{2}\.\d{4})/,
            amountPattern: /([+-]?\d+[,\s]*\d*[,\s]*\d*[,\s]*\d*)/,
            descriptionPattern: /([А-Яа-я\s\d\-.]+)/,
          },
        ],
      },
    };
  }

  /**
   * Определяет формат банка по содержимому PDF
   */
  detectBankFormat(text) {
    const lower = text.toLowerCase();
    // Проверяем признаки Сбербанка
    if (text.includes("Сбербанк") || lower.includes("сбербанк")) {
      return { bankKey: "sberbank", bankName: "Сбербанк" };
    }
    // Проверяем признаки Тинькофф/ТБАНК
    if (lower.includes("тинькофф") || lower.includes("tinkoff") || lower.includes("тбанк")) {
      return { bankKey: "tinkoff", bankName: "Тинькофф" };
    }
    // Проверяем признаки Озон-банка
    if (text.includes("ОЗОН Банк") || lower.includes("ozon")) {
      return { bankKey: "ozon", bankName: "Озон Банк" };
    }
    // Проверяем признаки Альфа-Банка (ищем по всему тексту, включая конец)
    if (lower.includes("альфа-банк") || lower.includes("alfa-bank") || lower.includes("alfabank")) {
      return { bankKey: "alfabank", bankName: "Альфа-Банк" };
    }
    // Можно добавить другие банки
    return null;
  }

  /**
   * Парсит PDF файл и извлекает транзакции
   */
  async parsePdfFile(file) {
    try {
      // Чтение PDF
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      // Извлекаем текст со всех страниц
      let fullText = "";
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item) => item.str).join(" ");
        fullText += pageText + "\n";
      }

      // Определяем формат банка
      const bankFormat = this.detectBankFormat(fullText);
      if (!bankFormat) {
        throw new Error("Не удалось определить формат банковской выписки");
      }

      // Универсальные метаданные (пытаемся извлечь, если есть)
      let account = undefined;
      let owner = undefined;
      let period = undefined;
      // Примеры для Озон-банка, можно доработать для других банков
      const accountMatch = fullText.match(/(№\s*\d{20,})/);
      if (accountMatch) account = accountMatch[0].replace(/[^\d]/g, "");
      const ownerMatch = fullText.match(/Владелец:([^\n]+)/);
      if (ownerMatch) owner = ownerMatch[1].trim();
      const periodMatch = fullText.match(
        /Период выписки:\s*(\d{2}\.\d{2}\.\d{4})\s*[–-]\s*(\d{2}\.\d{2}\.\d{4})/
      );
      if (periodMatch) {
        period = {
          from: this.parseDate(periodMatch[1]),
          to: this.parseDate(periodMatch[2]),
        };
      }

      // Извлекаем транзакции
      const transactions = this.extractTransactions(fullText, bankFormat).map((t) => ({
        date: t.date,
        description: t.description,
        amount: t.amount,
        category: t.category,
        raw: t.raw,
        meta: t.meta,
      }));

      return {
        bank: bankFormat.bankName,
        account,
        owner,
        period,
        transactions,
        rawData: this.getRawData(fullText),
        fileName: file.name,
        parsedAt: new Date(),
      };
    } catch (error) {
      throw new Error(`Ошибка при обработке PDF файла: ${error.message}`);
    }
  }

  /**
   * Извлекает транзакции из текста PDF
   */
  extractTransactions(text, bankFormat) {
    try {
      // Создаем банк-специфичный парсер
      const bankParser = createBankParser(bankFormat.bankKey);

      // Используем банк-специфичный парсер для извлечения транзакций
      const transactions = bankParser.extractTransactions(text);

      // Удаляем дубликаты
      const uniqueTransactions = [];
      for (const transaction of transactions) {
        const isDuplicate = uniqueTransactions.some(
          (t) =>
            t.date?.getTime() === transaction.date?.getTime() &&
            t.description === transaction.description &&
            t.amount === transaction.amount
        );
        if (!isDuplicate) {
          uniqueTransactions.push(transaction);
        }
      }

      return uniqueTransactions;
    } catch (error) {
      console.error(`❌ Ошибка при извлечении транзакций для банка ${bankFormat.bankKey}:`, error);
      return [];
    }
  }

  /**
   * Парсит дату из строки
   */
  parseDate(dateString) {
    try {
      // Проверяем, что строка соответствует формату ДД.ММ.ГГГГ
      if (!/^\d{2}\.\d{2}\.\d{4}$/.test(dateString)) {
        console.warn("Неверный формат даты:", dateString);
        return null;
      }

      const [day, month, year] = dateString.split(".");
      const dayNum = parseInt(day, 10);
      const monthNum = parseInt(month, 10);
      const yearNum = parseInt(year, 10);

      // Проверяем валидность даты
      if (
        dayNum < 1 ||
        dayNum > 31 ||
        monthNum < 1 ||
        monthNum > 12 ||
        yearNum < 1900 ||
        yearNum > 2100
      ) {
        console.warn("Недопустимые значения даты:", dateString);
        return null;
      }

      // Создаем дату (месяц - 1, так как в JS месяцы начинаются с 0)
      const date = new Date(yearNum, monthNum - 1, dayNum);

      // Проверяем, что дата действительно существует (например, 31.02.2024 не существует)
      if (
        date.getDate() !== dayNum ||
        date.getMonth() !== monthNum - 1 ||
        date.getFullYear() !== yearNum
      ) {
        console.warn("Недопустимая дата:", dateString);
        return null;
      }

      return date;
    } catch (error) {
      console.warn("Не удалось распарсить дату:", dateString, error);
      return null;
    }
  }

  /**
   * Парсит сумму из строки
   */
  parseAmount(amountString) {
    try {
      // Убираем все пробелы и символы валюты
      let clean = amountString.replace(/\s/g, "").replace(/₽/g, "");

      // Ищем полное число с разделителями тысяч и десятичными знаками
      // Паттерн: [+-]? цифры (возможно с разделителями тысяч) [,.] две цифры
      const match = clean.match(/[+-]?(\d{1,3}(?:\s\d{3})*(?:,\d{2})?|\d+(?:,\d{2})?)/);

      if (!match) return 0;

      // Убираем разделители тысяч (пробелы) и заменяем запятую на точку
      let num = match[0].replace(/\s/g, "").replace(",", ".");
      return parseFloat(num);
    } catch {
      console.warn("Не удалось распарсить сумму:", amountString);
      return 0;
    }
  }

  /**
   * Определяет категорию транзакции по описанию
   */
  detectCategory(description) {
    const desc = (description || "").toLowerCase();

    if (desc.includes("пенсия пфр")) {
      return "Пенсия";
    }
    if (desc.includes("перевод с карты") || desc.includes("альфа-банк")) {
      return "Переводы";
    }
    // Все варианты "прочие" объединяем в "Прочее"
    if (desc.includes("прочие операции") || desc.includes("прочие") || desc.includes("прочее")) {
      return "Прочее";
    }
    if (desc.includes("продукт") || desc.includes("магнит") || desc.includes("пятерочка")) {
      return "Продукты";
    }
    if (desc.includes("транспорт") || desc.includes("метро") || desc.includes("автобус")) {
      return "Транспорт";
    }
    if (desc.includes("кафе") || desc.includes("ресторан") || desc.includes("еда")) {
      return "Питание";
    }
    if (desc.includes("зарплат") || desc.includes("доход")) {
      return "Доходы";
    }

    return "Прочее";
  }

  /**
   * Улучшает описание транзакции, добавляя дополнительную информацию
   */
  enhanceDescription(text, date, baseDescription) {
    let description = baseDescription.trim();

    // Ищем дополнительную информацию после этой транзакции
    const datePattern = date.replace(/\./g, "\\.");
    const regex = new RegExp(
      `${datePattern}\\s+\\d{2}:\\d{2}\\s+\\d+\\s+${baseDescription.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      )}\\s+[+-]?\\d+[,\\s]*\\d*[,\\s]*\\d*[,\\s]*\\d*\\s*(.+?)(?=\\d{2}\\.\\d{2}\\.\\d{4}|$)`,
      "s"
    );

    const match = text.match(regex);
    if (match && match[1]) {
      const additionalInfo = match[1].trim();
      // Ищем информацию о пенсии или других деталях
      if (additionalInfo.includes("Пенсия ПФР")) {
        description += " (Пенсия ПФР)";
      } else if (additionalInfo.includes("Альфа-банк")) {
        description += " (Альфа-банк)";
      } else if (additionalInfo.includes("Операция по счету")) {
        description += " (Операция по счету)";
      }
    }

    return description;
  }

  /**
   * Проверяет валидность транзакции
   */
  isValidTransaction(transaction) {
    // Проверяем базовые условия
    if (!transaction.date || !transaction.description || transaction.amount === 0) {
      return false;
    }

    // Исключаем служебную информацию
    const desc = transaction.description.toLowerCase();
    const excludePatterns = [
      "действителен до",
      "для проверки подлинности",
      "итого по операциям",
      "остаток на",
      "генеральная лицензия",
      "расшифровка операций",
      "продолжение на следующей странице",
      "дата формирования",
      "пао сбербанк",
      "www.sberbank.ru",
    ];

    // Проверяем, не содержит ли описание служебную информацию
    for (const pattern of excludePatterns) {
      if (desc.includes(pattern)) {
        return false;
      }
    }

    // Проверяем, что описание не слишком короткое и не содержит только цифры
    if (transaction.description.length < 3 || /^\d+$/.test(transaction.description.trim())) {
      return false;
    }

    // Проверяем, что сумма разумная (не слишком большая)
    if (Math.abs(transaction.amount) > 1000000) {
      return false;
    }

    return true;
  }

  /**
   * Возвращает сырые данные для анализа
   */
  getRawData(text) {
    const lines = text.split("\n").filter((line) => line.trim());
    return lines.slice(0, 20).map((line) => [line]); // Первые 20 строк
  }
}

/**
 * Прогоняет все транзакции через detectCategory для унификации категорий
 * @param {Array} transactions
 * @param {PdfParser} parser
 * @returns {Array}
 */
export function normalizeCategories(transactions, parserInstance) {
  if (!Array.isArray(transactions)) return [];
  return transactions.map((t) => ({
    ...t,
    // Не перезаписываем категорию, если она уже установлена пользователем
    category: t.category || parserInstance.detectCategory(t.description),
  }));
}

/**
 * Агрегирует все транзакции из массива выписок в единый массив для таблицы
 * @param {Array} statements - массив выписок (результатов парсера)
 * @returns {Array} - массив всех транзакций с метаданными
 */
export function aggregateTransactions(statements) {
  if (!Array.isArray(statements)) return [];
  const parser = new PdfParser();
  const txs = statements.flatMap((s) =>
    (s.transactions || []).map((t) => ({
      ...t,
      bank: t.bank || s.bank, // Используем банк транзакции, если есть, иначе банк выписки
      account: s.account,
      fileName: s.fileName,
      period: s.period,
      parsedAt: s.parsedAt,
    }))
  );
  return normalizeCategories(txs, parser);
}

/**
 * Фильтрует и сортирует массив транзакций по заданным параметрам
 * @param {Array} transactions - массив транзакций (выход aggregateTransactions)
 * @param {Object} filters - { bank, category, dateFrom, dateTo, search }
 * @param {Object} sort - { field, direction } (direction: 'asc' | 'desc')
 * @returns {Array}
 */
export function filterAndSortTransactions(transactions, filters = {}, sort = {}) {
  let result = Array.isArray(transactions) ? [...transactions] : [];

  // Фильтрация
  if (filters.bank) {
    result = result.filter((t) => t.bank === filters.bank);
  }
  if (filters.category) {
    result = result.filter((t) => t.category === filters.category);
  }
  if (filters.dateFrom) {
    result = result.filter((t) => {
      if (!t.date) return false;
      const transactionDate = t.date instanceof Date ? t.date : new Date(t.date);
      const filterDate =
        filters.dateFrom instanceof Date ? filters.dateFrom : new Date(filters.dateFrom);
      return transactionDate >= filterDate;
    });
  }
  if (filters.dateTo) {
    result = result.filter((t) => {
      if (!t.date) return false;
      const transactionDate = t.date instanceof Date ? t.date : new Date(t.date);
      const filterDate = filters.dateTo instanceof Date ? filters.dateTo : new Date(filters.dateTo);
      return transactionDate <= filterDate;
    });
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(
      (t) =>
        (t.description && t.description.toLowerCase().includes(q)) ||
        (t.category && t.category.toLowerCase().includes(q)) ||
        (t.bank && t.bank.toLowerCase().includes(q))
    );
  }

  // Сортировка
  if (sort.field) {
    result.sort((a, b) => {
      let av = a[sort.field];
      let bv = b[sort.field];
      if (av instanceof Date && bv instanceof Date) {
        av = av.getTime();
        bv = bv.getTime();
      }
      if (typeof av === "string" && typeof bv === "string") {
        av = av.toLowerCase();
        bv = bv.toLowerCase();
      }
      if (av === undefined) return 1;
      if (bv === undefined) return -1;
      if (av < bv) return sort.direction === "desc" ? 1 : -1;
      if (av > bv) return sort.direction === "desc" ? -1 : 1;
      return 0;
    });
  }

  return result;
}

/**
 * Удаляет дубликаты транзакций по дате, сумме, описанию и банку
 * @param {Array} transactions - массив транзакций
 * @returns {Array} - массив без дубликатов
 */
export function removeDuplicateTransactions(transactions) {
  const seen = new Set();
  return transactions.filter((t) => {
    // Ключ: дата (ISO), сумма, описание (без пробелов), банк
    const key = [
      t.date instanceof Date ? t.date.toISOString().slice(0, 10) : t.date,
      t.amount,
      (t.description || "").replace(/\s+/g, "").toLowerCase(),
      t.bank,
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Экспортируем экземпляр
export const pdfParser = new PdfParser();

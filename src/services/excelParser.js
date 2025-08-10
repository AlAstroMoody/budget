import ExcelJS from "exceljs";

/**
 * Сервис для парсинга Excel файлов с банковскими выписками
 */
export class ExcelParser {
  constructor() {
    this.supportedBanks = {
      sberbank: {
        name: "Сбербанк",
        patterns: [
          { date: "A", time: "B", amount: "C", description: "D", balance: "E" },
          { date: "A", description: "B", amount: "C", balance: "D" },
        ],
      },
      tinkoff: {
        name: "Тинькофф",
        patterns: [
          { date: "A", description: "B", amount: "C", category: "D" },
          { date: "A", time: "B", description: "C", amount: "D", category: "E" },
        ],
      },
      alfa: {
        name: "Альфа-Банк",
        patterns: [
          { date: "A", description: "B", income: "C", expense: "D", balance: "E" },
          { date: "A", description: "B", amount: "C", balance: "D" },
          { date: "B", description: "L", amount: "N", category: "F" }, // Исправленный паттерн для Альфа-Банка
        ],
      },
    };
  }

  /**
   * Определяет формат банка по структуре данных
   */
  detectBankFormat(worksheet) {
    // Ищем строку с заголовками таблицы (проверяем первые 20 строк)
    for (let rowNumber = 1; rowNumber <= Math.min(20, worksheet.rowCount); rowNumber++) {
      const row = worksheet.getRow(rowNumber);
      const headers = [];

      row.eachCell((cell, colNumber) => {
        headers[colNumber] = cell.value?.toString().toLowerCase() || "";
      });

      // Проверяем, есть ли в строке релевантные заголовки
      const hasRelevantHeaders = headers.some(
        (header) =>
          header.includes("дата") ||
          header.includes("описание") ||
          header.includes("сумма") ||
          header.includes("приход") ||
          header.includes("расход")
      );

      if (hasRelevantHeaders) {
        // Проверяем паттерны для каждого банка
        for (const [bankKey, bank] of Object.entries(this.supportedBanks)) {
          for (const pattern of bank.patterns) {
            if (this.matchesPattern(headers, pattern)) {
              return { bankKey, pattern, bankName: bank.name, headerRow: rowNumber };
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * Проверяет, соответствует ли заголовок паттерну
   */
  matchesPattern(headers, pattern) {
    const requiredFields = Object.keys(pattern).filter(
      (key) => key !== "time" && key !== "category" && key !== "balance"
    );

    return requiredFields.every((field) => {
      const columnIndex = this.getColumnIndex(pattern[field]);
      const header = headers[columnIndex];
      const isRelevant = this.isRelevantHeader(header, field);

      return header && isRelevant;
    });
  }

  /**
   * Проверяет, является ли заголовок релевантным для поля
   */
  isRelevantHeader(header, field) {
    const headerLower = header.toLowerCase();

    switch (field) {
      case "date":
        return headerLower.includes("дата") || headerLower.includes("date");
      case "description":
        return (
          headerLower.includes("описание") ||
          headerLower.includes("операция") ||
          headerLower.includes("description") ||
          headerLower.includes("transaction")
        );
      case "amount":
        return (
          headerLower.includes("сумма") ||
          headerLower.includes("amount") ||
          headerLower.includes("сумма операции") ||
          headerLower.includes("сумма в валюте счета")
        );
      case "category":
        return headerLower.includes("категория") || headerLower.includes("category");
      case "income":
        return (
          headerLower.includes("приход") ||
          headerLower.includes("доход") ||
          headerLower.includes("income")
        );
      case "expense":
        return headerLower.includes("расход") || headerLower.includes("expense");
      default:
        return true;
    }
  }

  /**
   * Конвертирует буквенное обозначение колонки в индекс
   */
  getColumnIndex(columnLetter) {
    let index = 0;
    for (let i = 0; i < columnLetter.length; i++) {
      index = index * 26 + (columnLetter.charCodeAt(i) - 64);
    }
    return index;
  }

  /**
   * Парсит Excel файл и извлекает транзакции
   */
  async parseExcelFile(file) {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());

      const worksheet = workbook.getWorksheet(1); // Первый лист
      if (!worksheet) {
        throw new Error("Файл не содержит данных");
      }

      // Определяем формат банка
      const bankFormat = this.detectBankFormat(worksheet);
      if (!bankFormat) {
        throw new Error("Не удалось определить формат банковской выписки");
      }

      // Извлекаем транзакции
      const transactions = this.extractTransactions(worksheet, bankFormat);

      // Автоматически определяем банк по содержимому файла
      const detectedBank = this.detectBankFromContent(worksheet);

      if (detectedBank) {
        // Устанавливаем банк для всех транзакций
        transactions.forEach((transaction) => {
          transaction.bank = detectedBank;
        });
      } else {
        // Если банк не определен автоматически, используем название из формата
        transactions.forEach((transaction) => {
          transaction.bank = bankFormat.bankName;
        });
      }

      return {
        bankName: bankFormat.bankName,
        totalTransactions: transactions.length,
        transactions,
        rawData: this.getRawData(worksheet),
      };
    } catch (error) {
      console.error("Ошибка при парсинге Excel файла:", error);
      throw new Error(`Ошибка при обработке файла: ${error.message}`);
    }
  }

  /**
   * Извлекает транзакции из worksheet
   */
  extractTransactions(worksheet, bankFormat) {
    const transactions = [];
    const pattern = bankFormat.pattern;
    const headerRow = bankFormat.headerRow || 1;

    // Начинаем со строки после заголовков
    for (let rowNumber = headerRow + 1; rowNumber <= worksheet.rowCount; rowNumber++) {
      const row = worksheet.getRow(rowNumber);
      const transaction = this.parseRow(row, pattern);

      if (transaction && this.isValidTransaction(transaction)) {
        transactions.push(transaction);
      }
    }

    return transactions;
  }

  /**
   * Парсит строку в транзакцию
   */
  parseRow(row, pattern) {
    const transaction = {};

    for (const [field, column] of Object.entries(pattern)) {
      const columnIndex = this.getColumnIndex(column);
      const cell = row.getCell(columnIndex);

      if (cell.value !== null && cell.value !== undefined) {
        transaction[field] = this.parseCellValue(cell, field);
      }
    }

    // Обрабатываем специальные случаи
    if (transaction.income && transaction.expense) {
      transaction.amount = transaction.income || -transaction.expense;
      delete transaction.income;
      delete transaction.expense;
    }

    return transaction;
  }

  /**
   * Парсит значение ячейки в зависимости от типа поля
   */
  parseCellValue(cell, field) {
    const value = cell.value;

    switch (field) {
      case "date":
        return this.parseDate(value);
      case "amount":
      case "income":
      case "expense":
        return this.parseAmount(value);
      case "description":
        return String(value).trim();
      case "category":
        return String(value).trim();
      case "balance":
        return this.parseAmount(value);
      default:
        return value;
    }
  }

  /**
   * Парсит дату
   */
  parseDate(value) {
    if (value instanceof Date) {
      return value;
    }

    if (typeof value === "string") {
      // Проверяем формат дд.мм.гггг
      if (/^\d{2}\.\d{2}\.\d{4}$/.test(value)) {
        const [day, month, year] = value.split(".");
        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        return date;
      }

      // Попытка парсинга других форматов дат
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }

    if (typeof value === "number") {
      // Excel дата как число
      const date = new Date((value - 25569) * 86400 * 1000);
      return date;
    }

    return null;
  }

  /**
   * Парсит сумму
   */
  parseAmount(value) {
    if (typeof value === "number") {
      return value;
    }

    if (typeof value === "string") {
      // Убираем символы валюты
      let cleanValue = value.replace(/[₽$€]/g, "");

      // Ищем полное число с разделителями тысяч и десятичными знаками
      const match = cleanValue.match(/[+-]?(\d{1,3}(?:\s\d{3})*(?:,\d{2})?|\d+(?:,\d{2})?)/);

      if (!match) {
        console.warn("ExcelParser.parseAmount: не удалось найти число в строке:", value);
        return 0;
      }

      // Убираем разделители тысяч (пробелы) и заменяем запятую на точку
      let num = match[0].replace(/\s/g, "").replace(",", ".");
      const number = parseFloat(num);

      if (isNaN(number)) {
        console.warn("ExcelParser.parseAmount: не удалось распарсить число:", value);
        return 0;
      }

      return number;
    }

    console.warn("ExcelParser.parseAmount: неизвестный тип значения:", typeof value);
    return 0;
  }

  /**
   * Проверяет валидность транзакции
   */
  isValidTransaction(transaction) {
    return (
      transaction.date &&
      transaction.description &&
      transaction.amount !== undefined &&
      transaction.amount !== 0
    );
  }

  /**
   * Автоматически определяет банк по содержимому файла
   */
  detectBankFromContent(worksheet) {
    const bankPatterns = {
      "АЛЬФА-БАНК": "Альфа-Банк",
      "АЛЬФА БАНК": "Альфа-Банк",
      АЛЬФАБАНК: "Альфа-Банк",
      СБЕРБАНК: "Сбербанк",
      "СБЕР БАНК": "Сбербанк",
      ТИНЬКОФФ: "Тинькофф",
      "ТИНЬКОФФ БАНК": "Тинькофф",
    };

    // Проверяем ВСЕ строки файла на наличие названий банков
    for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber++) {
      const row = worksheet.getRow(rowNumber);

      // Используем eachCell для правильного обхода всех ячеек
      row.eachCell((cell, _colNumber) => {
        if (cell.value && typeof cell.value === "string") {
          const cellValue = cell.value.toUpperCase();

          for (const [pattern, bankName] of Object.entries(bankPatterns)) {
            if (cellValue.includes(pattern)) {
              return bankName;
            }
          }
        }
      });
    }

    return null;
  }

  /**
   * Получает сырые данные для отладки
   */
  getRawData(worksheet) {
    const rawData = [];

    for (let rowNumber = 1; rowNumber <= Math.min(25, worksheet.rowCount); rowNumber++) {
      const row = worksheet.getRow(rowNumber);
      const rowData = [];

      row.eachCell((cell, colNumber) => {
        rowData[colNumber] = cell.value;
      });

      rawData.push(rowData);
    }

    return rawData;
  }
}

// Экспортируем экземпляр
export const excelParser = new ExcelParser();

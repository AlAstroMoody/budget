/**
 * Банк-специфичные парсеры для разных форматов выписок
 */

// Базовый класс для парсеров
class BaseBankParser {
  parseAmount(_amountString) {
    throw new Error("Метод parseAmount должен быть переопределен в дочернем классе");
  }

  parseDate(_dateString) {
    throw new Error("Метод parseDate должен быть переопределен в дочернем классе");
  }

  extractTransactions(_text) {
    throw new Error("Метод extractTransactions должен быть переопределен в дочернем классе");
  }
}

// Парсер для Сбербанка
export class SberbankParser extends BaseBankParser {
  parseAmount(amountString) {
    try {
      // Убираем все пробелы и символы валюты
      let clean = amountString.replace(/\s/g, "").replace(/₽/g, "");

      // Для Сбера: +4 164,04 -> 4164.04
      const match = clean.match(/[+-]?(\d+(?:,\d{2})?)/);

      if (!match) {
        return 0;
      }

      // Убираем разделители тысяч (пробелы) и заменяем запятую на точку
      let num = match[0].replace(/\s/g, "").replace(",", ".");

      return parseFloat(num);
    } catch (error) {
      console.error("Ошибка при парсинге суммы Сбера:", amountString, error);
      return 0;
    }
  }

  parseDate(dateString) {
    try {
      // Сбербанк использует формат ДД.ММ.ГГГГ
      if (!/^\d{2}\.\d{2}\.\d{4}$/.test(dateString)) {
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
        return null;
      }

      const date = new Date(yearNum, monthNum - 1, dayNum);

      // Проверяем, что дата действительно существует
      if (
        date.getDate() !== dayNum ||
        date.getMonth() !== monthNum - 1 ||
        date.getFullYear() !== yearNum
      ) {
        return null;
      }

      return date;
    } catch (error) {
      console.warn("Не удалось распарсить дату Сбера:", dateString, error);
      return null;
    }
  }

  extractTransactions(text) {
    const transactions = [];

    // Основной паттерн для поиска транзакций Сбера в тексте
    const sberTransactionPattern =
      /(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})\s+(\d+)\s+(.+?)\s+([+-]?\d{1,3}(?:\s\d{3})*(?:,\d{2})?)\s+(\d{1,3}(?:\s\d{3})*(?:,\d{2})?)/g;

    let match;
    while ((match = sberTransactionPattern.exec(text)) !== null) {
      const [, dateStr, timeStr, code, description, amountStr, balanceStr] = match;

      const date = this.parseDate(dateStr);
      const amount = this.parseAmount(amountStr);

      if (date && amount !== 0) {
        const transaction = {
          date,
          description: description.trim(),
          amount,
          category: this.detectCategory(description),
          bank: "Сбербанк",
          raw: match[0],
          meta: {
            time: timeStr,
            code: code,
            balance: this.parseAmount(balanceStr),
          },
        };
        transactions.push(transaction);
      }
    }

    // Если основной паттерн не сработал, пробуем альтернативные
    if (transactions.length === 0) {
      // Альтернативный паттерн 1: дата + описание + сумма (без времени и кода)
      const altPattern1 = /(\d{2}\.\d{2}\.\d{4})\s+(.+?)\s+([+-]?\d{1,3}(?:\s\d{3})*(?:,\d{2})?)/g;

      let altMatch1;
      while ((altMatch1 = altPattern1.exec(text)) !== null) {
        const [, dateStr, description, amountStr] = altMatch1;

        const date = this.parseDate(dateStr);
        const amount = this.parseAmount(amountStr);

        if (date && amount !== 0 && this.isValidTransactionDescription(description)) {
          const transaction = {
            date,
            description: description.trim(),
            amount,
            category: this.detectCategory(description),
            bank: "Сбербанк",
            raw: altMatch1[0],
            meta: {
              pattern: "alternative1",
            },
          };
          transactions.push(transaction);
        }
      }

      // Альтернативный паттерн 2: дата + время + описание + сумма (без кода и баланса)
      if (transactions.length === 0) {
        const altPattern2 =
          /(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})\s+(.+?)\s+([+-]?\d{1,3}(?:\s\d{3})*(?:,\d{2})?)/g;

        let altMatch2;
        while ((altMatch2 = altPattern2.exec(text)) !== null) {
          const [, dateStr, timeStr, description, amountStr] = altMatch2;

          const date = this.parseDate(dateStr);
          const amount = this.parseAmount(amountStr);

          if (date && amount !== 0 && this.isValidTransactionDescription(description)) {
            const transaction = {
              date,
              description: description.trim(),
              amount,
              category: this.detectCategory(description),
              bank: "Сбербанк",
              raw: altMatch2[0],
              meta: {
                time: timeStr,
                pattern: "alternative2",
              },
            };
            transactions.push(transaction);
          }
        }
      }
    }

    return transactions;
  }

  isValidTransactionDescription(description) {
    if (!description || typeof description !== "string") {
      return false;
    }

    const desc = description.toLowerCase().trim();

    // Исключаем служебную информацию
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
      "альфа-банк",
      "www.alfabank.ru",
      "генеральная лицензия банка россии",
      "страница",
      "итого",
      "баланс на начало",
      "баланс на конец",
      "выписка",
      "период",
      "счет",
      "карта",
      "номер",
      "лицензия",
      "банк россии",
    ];

    // Проверяем, не содержит ли описание служебную информацию
    for (const pattern of excludePatterns) {
      if (desc.includes(pattern)) {
        return false;
      }
    }

    // Проверяем, что описание не слишком короткое и не содержит только цифры
    if (desc.length < 3 || /^\d+$/.test(desc)) {
      return false;
    }

    return true;
  }

  detectCategory(description) {
    const desc = (description || "").toLowerCase();

    if (desc.includes("пенсия пфр")) {
      return "Пенсия";
    }
    if (desc.includes("перевод с карты") || desc.includes("альфа-банк")) {
      return "Переводы";
    }
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
}

// Парсер для Тинькофф
export class TinkoffParser extends BaseBankParser {
  parseAmount(amountString) {
    try {
      // Убираем все пробелы и символы валюты
      let clean = amountString.replace(/\s/g, "").replace(/₽/g, "");

      // Для Тинькофф: +4 164.04 -> 4164.04
      const match = clean.match(/[+-]?(\d+(?:\.\d{2})?)/);

      if (!match) {
        return 0;
      }

      // Убираем разделители тысяч (пробелы)
      let num = match[0].replace(/\s/g, "");

      return parseFloat(num);
    } catch (error) {
      console.error("Ошибка при парсинге суммы Тинькофф:", amountString, error);
      return 0;
    }
  }

  parseDate(dateString) {
    try {
      // Тинькофф может использовать разные форматы
      if (/^\d{2}\.\d{2}\.\d{4}$/.test(dateString)) {
        const [day, month, year] = dateString.split(".");
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      }

      if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        return new Date(dateString);
      }

      return null;
    } catch (error) {
      console.warn("Не удалось распарсить дату Тинькофф:", dateString, error);
      return null;
    }
  }

  extractTransactions(text) {
    const transactions = [];

    // Паттерн для поиска транзакций Тинькофф в тексте
    const tinkoffTransactionPattern =
      /(\d{2}\.\d{2}\.\d{4})\s+\d{2}:\d{2}\s+\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}\s+([+-]?\d[\d\s]*[.,]\d{2})\s*₽\s*[+-]?\d[\d\s]*[.,]\d{2}\s*₽\s*([А-Яа-яA-Za-z0-9 .№()%-]+?)\s+\d{4}/g;

    let match;
    while ((match = tinkoffTransactionPattern.exec(text)) !== null) {
      const [, dateStr, amountStr, description] = match;

      const date = this.parseDate(dateStr);
      const amount = this.parseAmount(amountStr);

      if (date && amount !== 0) {
        const transaction = {
          date,
          description: description.trim(),
          amount,
          category: this.detectCategory(description),
          bank: "Тинькофф",
          raw: match[0],
          meta: {
            bank: "Тинькофф",
          },
        };
        transactions.push(transaction);
      }
    }

    return transactions;
  }

  detectCategory(_description) {
    // Логика определения категории для Тинькофф
    return "Прочее";
  }
}

// Парсер для Озон-банка
export class OzonParser extends BaseBankParser {
  parseAmount(amountString) {
    try {
      // Убираем все пробелы и символы валюты
      let clean = amountString.replace(/\s/g, "").replace(/₽/g, "");

      // Для Озон-банка: +4 164.04 -> 4164.04
      const match = clean.match(/[+-]?(\d+(?:\.\d{2})?)/);

      if (!match) {
        return 0;
      }

      let num = match[0].replace(/\s/g, "");

      return parseFloat(num);
    } catch (error) {
      console.error("Ошибка при парсинге суммы Озон-банка:", amountString, error);
      return 0;
    }
  }

  parseDate(dateString) {
    try {
      // Озон-банк использует формат ДД.ММ.ГГГГ
      if (!/^\d{2}\.\d{2}\.\d{4}$/.test(dateString)) {
        return null;
      }

      const [day, month, year] = dateString.split(".");
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    } catch (error) {
      console.warn("Не удалось распарсить дату Озон-банка:", dateString, error);
      return null;
    }
  }

  extractTransactions(text) {
    const transactions = [];

    // Паттерн для поиска транзакций Озон-банка в тексте
    // Формат: ДАТА ВРЕМЯ НОМЕР ОПИСАНИЕ +/- СУММА ₽
    const ozonTransactionPattern =
      /(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2}:\d{2})\s+(\d+)\s+(.+?)\s+([+-])\s?([\d\s]+[.,]\d{2})\s?₽/g;

    let match;
    while ((match = ozonTransactionPattern.exec(text)) !== null) {
      const [, dateStr, timeStr, number, description, sign, amountStr] = match;

      const date = this.parseDate(dateStr);
      const amount = this.parseAmount(sign + amountStr);

      if (date && amount !== 0) {
        const transaction = {
          date,
          description: description.trim(),
          amount,
          category: this.detectCategory(description),
          bank: "Озон-банк",
          raw: match[0],
          meta: {
            time: timeStr,
            number: number,
            sign: sign,
          },
        };
        transactions.push(transaction);
      }
    }

    return transactions;
  }

  detectCategory(_description) {
    // Логика определения категории для Озон-банка
    return "Прочее";
  }
}

// Парсер для Альфа-банка
export class AlfabankParser extends BaseBankParser {
  parseAmount(amountString) {
    try {
      // Убираем все пробелы и символы валюты
      let clean = amountString.replace(/\s/g, "").replace(/₽/g, "").replace(/RUR/g, "");

      // Для Альфа-банка: ищем число с возможными разделителями тысяч и десятичными знаками
      const match = clean.match(/[+-]?(\d{1,3}(?:\s\d{3})*(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?)/);

      // Если первое регулярное выражение не сработало, пробуем более точное
      if (!match || match[0].length < clean.length) {
        const altMatch = clean.match(/[+-]?\d+(?:[.,]\d{2})?/);
        if (altMatch) {
          const num = altMatch[0].replace(",", ".");
          return parseFloat(num);
        }
      }

      if (!match) {
        return 0;
      }

      // Убираем разделители тысяч (пробелы) и заменяем запятую на точку
      let num = match[0].replace(/\s/g, "").replace(",", ".");
      return parseFloat(num);
    } catch (error) {
      console.error("Ошибка при парсинге суммы Альфа-банка:", amountString, error);
      return 0;
    }
  }

  parseDate(dateString) {
    try {
      // Альфа-банк может использовать разные форматы
      if (/^\d{2}\.\d{2}\.\d{4}$/.test(dateString)) {
        const [day, month, year] = dateString.split(".");
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      }

      return null;
    } catch (error) {
      console.warn("Не удалось распарсить дату Альфа-банка:", dateString, error);
      return null;
    }
  }

  extractTransactions(text) {
    const transactions = [];

    // Паттерн для формата PDF Альфа-банка: ДАТА КОД ОПИСАНИЕ СУММА RUR
    const alfaPattern =
      /(\d{2}\.\d{2}\.\d{4})\s+([A-Z0-9_]+)\s+(.+?)\s+([+-]?\d[\d\s]*[.,]\d{2})\s*RUR/g;

    let match;
    while ((match = alfaPattern.exec(text)) !== null) {
      const [, dateStr, code, description, amountStr] = match;

      const date = this.parseDate(dateStr);
      const amount = this.parseAmount(amountStr);

      if (date && amount !== 0) {
        // Добавляем код операции в описание для уникальности
        let enhancedDescription = description.trim();
        if (code) {
          enhancedDescription = `[${code}] ${enhancedDescription}`;
        }

        const transaction = {
          date,
          description: enhancedDescription,
          amount,
          category: this.detectCategory(description), // Используем оригинальное описание для категории
          bank: "Альфа-банк",
          raw: match[0],
          meta: {
            bank: "Альфа-банк",
            code: code,
          },
        };
        transactions.push(transaction);
      }
    }

    return transactions;
  }

  detectCategory(description) {
    const desc = (description || "").toLowerCase();

    if (desc.includes("пенсия пфр")) {
      return "Пенсия";
    }
    if (desc.includes("перевод с карты") || desc.includes("альфа-банк")) {
      return "Переводы";
    }
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
}

// Фабрика для создания парсеров
export function createBankParser(bankKey) {
  switch (bankKey) {
    case "sberbank":
      return new SberbankParser();
    case "tinkoff":
      return new TinkoffParser();
    case "ozon":
      return new OzonParser();
    case "alfabank":
      return new AlfabankParser();
    default:
      throw new Error(`Неизвестный банк: ${bankKey}`);
  }
}

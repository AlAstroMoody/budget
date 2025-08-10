/**
 * Универсальный парсер файлов банковских выписок
 * Автоматически определяет тип файла и использует соответствующий парсер
 */
export class FileParser {
  constructor() {
    this.parsers = {};
  }

  /**
   * Динамически загружает парсер по требованию
   */
  async loadParser(fileType) {
    if (this.parsers[fileType]) {
      return this.parsers[fileType];
    }

    try {
      if (fileType === "excel") {
        const { excelParser } = await import("./excelParser");
        this.parsers.excel = excelParser;
        return excelParser;
      } else if (fileType === "pdf") {
        const { pdfParser } = await import("./pdfParser");
        this.parsers.pdf = pdfParser;
        return pdfParser;
      }
    } catch (error) {
      console.error(`Ошибка загрузки парсера ${fileType}:`, error);
      throw new Error(`Не удалось загрузить парсер для ${fileType}`);
    }
  }

  /**
   * Определяет тип файла по расширению и содержимому
   */
  detectFileType(file) {
    const fileName = file.name.toLowerCase();

    // Определяем по расширению
    if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
      return "excel";
    }

    if (fileName.endsWith(".pdf")) {
      return "pdf";
    }

    // Если расширение не распознано, пробуем определить по MIME типу
    if (file.type) {
      if (file.type.includes("spreadsheet") || file.type.includes("excel")) {
        return "excel";
      }
      if (file.type === "application/pdf") {
        return "pdf";
      }
    }

    throw new Error(
      "Неподдерживаемый тип файла. Поддерживаются Excel (.xlsx, .xls) и PDF (.pdf) файлы"
    );
  }

  /**
   * Парсит файл, автоматически определяя его тип
   */
  async parseFile(file) {
    try {
      console.log("🔍 Определение типа файла:", file.name);

      const fileType = this.detectFileType(file);

      // Динамически загружаем парсер
      const parser = await this.loadParser(fileType);

      // Вызываем соответствующий метод парсера
      if (fileType === "excel") {
        return await parser.parseExcelFile(file);
      } else if (fileType === "pdf") {
        return await parser.parsePdfFile(file);
      }
    } catch (error) {
      console.error("Ошибка при парсинге файла:", error);
      throw error;
    }
  }

  /**
   * Возвращает список поддерживаемых форматов
   */
  getSupportedFormats() {
    return [
      { name: "Excel файлы", extensions: [".xlsx", ".xls"], type: "excel" },
      { name: "PDF файлы", extensions: [".pdf"], type: "pdf" },
    ];
  }

  /**
   * Возвращает строку с поддерживаемыми расширениями для input accept
   */
  getAcceptString() {
    const formats = this.getSupportedFormats();
    return formats.map((format) => format.extensions.join(",")).join(",");
  }
}

// Экспортируем экземпляр
export const fileParser = new FileParser();

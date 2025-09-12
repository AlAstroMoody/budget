<script setup>
import { ref, computed, onMounted } from "vue";
import { fileParser } from "@/services/fileParser";

const props = defineProps({
  accept: {
    type: String,
    default: fileParser.getAcceptString(),
  },
  maxSize: {
    type: Number,
    default: 10 * 1024 * 1024, // 10MB
  },
  selectedBank: {
    type: String,
    default: null,
  },
});

const emit = defineEmits(["file-parsed", "error"]);

const isDragOver = ref(false);
const isProcessing = ref(false);
const parsedData = ref(null);
const error = ref(null);
const fileInput = ref(null);

// Очищаем input файла при монтировании
onMounted(() => {
  if (fileInput.value) {
    fileInput.value.value = "";
  }
});

const dragOverClass = computed(() => ({
  "border-blue-500 bg-blue-50": isDragOver.value,
  "border-gray-300 bg-white": !isDragOver.value,
}));

const handleDragOver = (e) => {
  e.preventDefault();
  isDragOver.value = true;
};

const handleDragLeave = (e) => {
  e.preventDefault();
  isDragOver.value = false;
};

const handleDrop = async (e) => {
  e.preventDefault();
  isDragOver.value = false;

  const files = Array.from(e.dataTransfer.files);
  if (files.length > 0) {
    await processFiles(files);
  }
};

const handleFileSelect = async (e) => {
  const files = Array.from(e.target.files);
  if (files.length > 0) {
    await processFiles(files);
  }
};

const processFiles = async (files) => {
  try {
    isProcessing.value = true;
    error.value = null;
    parsedData.value = null;

    const results = [];
    const errors = [];

    // Обрабатываем каждый файл
    for (const file of files) {
      try {
        // Проверяем размер файла
        if (file.size > props.maxSize) {
          throw new Error(
            `Файл ${file.name} слишком большой. Максимальный размер: ${
              props.maxSize / 1024 / 1024
            }MB`
          );
        }

        // Проверяем тип файла
        const supportedFormats = fileParser.getSupportedFormats();
        const isSupported = supportedFormats.some((format) =>
          format.extensions.some((ext) => file.name.toLowerCase().endsWith(ext))
        );

        if (!isSupported) {
          const extensions = supportedFormats.map((f) => f.extensions.join(", ")).join(", ");
          throw new Error(`Файл ${file.name}: поддерживаются только файлы: ${extensions}`);
        }

        // Парсим файл с указанным банком
        const result = await fileParser.parseFile(file, props.selectedBank);
        results.push(result);
      } catch (err) {
        console.error(`❌ Ошибка в обработке файла ${file.name}:`, err);
        errors.push({ file: file.name, error: err.message });
      }
    }

    // Если есть ошибки, показываем их
    if (errors.length > 0) {
      const errorMessage = errors.map((e) => `${e.file}: ${e.error}`).join("\n");
      error.value = `Ошибки обработки:\n${errorMessage}`;
      emit("error", errorMessage);
    }

    // Если есть успешные результаты, показываем их
    if (results.length > 0) {
      if (results.length === 1) {
        parsedData.value = results[0];

        emit("file-parsed", results[0]);
      } else {
        // Объединяем результаты нескольких файлов
        const combinedResult = combineResults(results);
        parsedData.value = combinedResult;

        emit("file-parsed", combinedResult);
      }
    }
  } catch (err) {
    console.error("❌ Общая ошибка в processFiles:", err);
    error.value = err.message;
    emit("error", err.message);
  } finally {
    isProcessing.value = false;
  }
};

const combineResults = (results) => {
  // Объединяем транзакции из всех файлов
  const allTransactions = [];
  const allRawData = [];
  let totalTransactions = 0;

  // Собираем все уникальные банки
  const uniqueBanks = [...new Set(results.map((r) => r.bankName).filter(Boolean))];
  const bankName = uniqueBanks.length > 0 ? uniqueBanks.join(", ") : "Неизвестный банк";

  for (const result of results) {
    if (result.transactions) {
      // Добавляем банк к транзакциям, если его нет
      const transactionsWithBank = result.transactions.map((transaction) => ({
        ...transaction,
        bank: transaction.bank || result.bank,
      }));

      allTransactions.push(...transactionsWithBank);
      totalTransactions += result.totalTransactions || 0;
    }
    if (result.rawData) {
      allRawData.push(...result.rawData);
    }
  }

  return {
    bankName,
    totalTransactions,
    transactions: allTransactions,
    rawData: allRawData,
    sourceFiles: results.length,
  };
};

const reset = () => {
  parsedData.value = null;
  error.value = null;
};
</script>

<template>
  <div class="space-y-3">
    <!-- Загрузка файла -->
    <div
      :class="[
        'border-2 border-dashed rounded-lg p-6 text-center transition-colors',
        dragOverClass,
      ]"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
    >
      <div v-if="!isProcessing && !parsedData" class="space-y-3">
        <div class="text-4xl text-gray-400">📄</div>
        <div>
          <h3 class="text-base font-medium text-gray-900 mb-2">Загрузите банковскую выписку</h3>
          <p class="text-sm text-gray-600 mb-3">
            <span v-if="selectedBank">
              Выбран банк: <strong>{{ selectedBank }}</strong>
            </span>
            <span v-else class="text-red-600"> ⚠️ Сначала выберите банк выше </span>
          </p>
          <input
            type="file"
            :accept="accept"
            multiple
            :disabled="!selectedBank"
            class="hidden"
            @change="handleFileSelect"
            id="file-upload"
            autocomplete="off"
            ref="fileInput"
          />
          <label
            for="file-upload"
            :class="[
              'inline-flex items-center px-4 py-2 rounded-lg transition-colors font-medium text-sm shadow-md',
              selectedBank
                ? 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed',
            ]"
          >
            📁 {{ selectedBank ? "Выбрать файлы" : "Сначала выберите банк" }}
          </label>
        </div>
        <p class="text-xs text-gray-500">
          Поддерживаются Excel (.xlsx, .xls) и PDF (.pdf) файлы до {{ maxSize / 1024 / 1024 }}MB
        </p>
      </div>

      <!-- Обработка -->
      <div v-if="isProcessing" class="space-y-3">
        <div class="text-4xl text-blue-500">⏳</div>
        <h3 class="text-base font-medium text-gray-900">Обрабатываем файл...</h3>
        <p class="text-sm text-gray-600">Пожалуйста, подождите</p>
      </div>
    </div>

    <!-- Ошибка -->
    <div v-if="error" class="bg-red-50 border border-red-200 rounded-lg p-3">
      <div class="flex">
        <div class="text-red-500 text-lg mr-2">⚠️</div>
        <div>
          <h3 class="text-sm font-medium text-red-800">Ошибка обработки</h3>
          <p class="text-xs text-red-700 mt-0.5">{{ error }}</p>
        </div>
      </div>
    </div>

    <!-- Результат парсинга -->
    <div v-if="parsedData" class="bg-green-50 border border-green-200 rounded-lg p-3">
      <div class="flex justify-between items-start">
        <div class="flex">
          <div class="text-green-500 text-lg mr-2">✅</div>
          <div>
            <h3 class="text-sm font-medium text-green-800">Файл успешно обработан</h3>
            <p class="text-xs text-green-700 mt-0.5">
              <span v-if="parsedData.sourceFiles > 1">
                Файлов: {{ parsedData.sourceFiles }} |
              </span>
              Банк: {{ parsedData.bankName }} | Транзакций: {{ parsedData.totalTransactions }}
            </p>
          </div>
        </div>
        <button
          @click="reset"
          class="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium text-sm"
        >
          🔄 Загрузить другой файл
        </button>
      </div>
    </div>
  </div>
</template>

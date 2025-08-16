<template>
  <div class="relative" ref="dropdownRef">
    <!-- Основной селект -->
    <div
      @click="handleToggle"
      class="flex items-center justify-between w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      :class="{ 'border-blue-500 ring-2 ring-blue-500': isOpen }"
    >
      <span class="truncate">{{ modelValue || "Выберите категорию" }}</span>
      <svg
        class="w-4 h-4 text-gray-400 transition-transform"
        :class="{ 'rotate-180': isOpen }"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </div>

    <!-- Выпадающий список -->
    <div
      v-if="isOpen"
      class="absolute z-[9999] w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto"
      style="min-width: 280px; width: max-content; top: 100%"
    >
      <!-- Поиск -->
      <div class="sticky top-0 bg-white border-b border-gray-200 p-2">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Поиск категории..."
          class="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          @click.stop
        />
      </div>

      <!-- Список категорий -->
      <div class="py-1">
        <div
          v-for="category in filteredCategories"
          :key="category"
          @click="selectCategory(category)"
          class="px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 hover:text-blue-700 break-words"
          :class="{ 'bg-blue-100 text-blue-700': modelValue === category }"
        >
          {{ category }}
        </div>

        <!-- Если ничего не найдено -->
        <div
          v-if="filteredCategories.length === 0 && searchQuery.value"
          class="px-3 py-2 text-sm text-gray-500"
        >
          Категория не найдена. Введите новую категорию ниже.
        </div>
      </div>

      <!-- Добавление новой категории -->
      <div class="border-t border-gray-200 p-2">
        <div class="flex space-x-2">
          <input
            v-model="newCategory"
            type="text"
            placeholder="Новая категория..."
            class="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            @click.stop
            @keyup.enter="addNewCategory"
          />
          <button
            @click="addNewCategory"
            :disabled="!newCategory.trim()"
            class="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            +
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { useDropdown } from "../../composables/useDropdown.js";

const props = defineProps({
  modelValue: {
    type: String,
    default: "",
  },
  categories: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(["update:modelValue", "category-added"]);

const { isOpen, dropdownRef, toggle, close } = useDropdown();
const searchQuery = ref("");
const newCategory = ref("");

// Фильтрация категорий по поиску
const filteredCategories = computed(() => {
  let categories = props.categories;

  // Если есть поисковый запрос, фильтруем по нему
  if (searchQuery.value) {
    categories = categories.filter((category) =>
      category.toLowerCase().includes(searchQuery.value.toLowerCase())
    );
  }

  return categories;
});

// Выбор категории
function selectCategory(category) {
  emit("update:modelValue", category);
  close();
  searchQuery.value = "";
}

// Очистка полей при открытии/закрытии
function handleToggle() {
  toggle();
  if (isOpen.value) {
    searchQuery.value = "";
    newCategory.value = "";
  }
}

// Добавление новой категории
function addNewCategory() {
  const category = newCategory.value.trim();
  if (category && !props.categories.includes(category)) {
    emit("category-added", category);
    emit("update:modelValue", category);
    close();
    newCategory.value = "";
    searchQuery.value = "";
  } else if (category && props.categories.includes(category)) {
    // Если категория уже существует, просто выбираем её
    emit("update:modelValue", category);
    close();
    newCategory.value = "";
    searchQuery.value = "";
  }
}

// Обработчик глобального события обновления категорий
function handleCategoriesUpdate() {
  // Категории уже обновлены через props, просто очищаем поиск
  searchQuery.value = "";
  newCategory.value = "";
}
</script>

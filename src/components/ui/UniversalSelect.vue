<template>
  <div class="relative" ref="dropdownRef">
    <!-- Основной селект -->
    <div
      @click="handleToggle"
      class="flex items-center justify-between w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      :class="{ 'border-blue-500 ring-2 ring-blue-500': isOpen }"
    >
      <span class="truncate">{{ modelValue || placeholder }}</span>
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
          :placeholder="`Поиск ${itemName}...`"
          class="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          @click.stop
        />
      </div>

      <!-- Список элементов -->
      <div class="py-1">
        <div
          v-for="item in filteredItems"
          :key="item"
          @click="selectItem(item)"
          class="px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 hover:text-blue-700 break-words"
          :class="{ 'bg-blue-100 text-blue-700': modelValue === item }"
        >
          {{ item }}
        </div>

        <!-- Если ничего не найдено -->
        <div
          v-if="filteredItems.length === 0 && searchQuery.value"
          class="px-3 py-2 text-sm text-gray-500"
        >
          {{ itemName }} не найден. Введите новый {{ itemName }} ниже.
        </div>
      </div>

      <!-- Добавление нового элемента (только для категорий) -->
      <div v-if="allowAddNew" class="border-t border-gray-200 p-2">
        <div class="flex space-x-2">
          <input
            v-model="newItem"
            type="text"
            :placeholder="`Новый ${itemName}...`"
            class="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            @click.stop
            @keyup.enter="addNewItem"
          />
          <button
            @click="addNewItem"
            :disabled="!newItem.trim()"
            class="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors shadow-sm"
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
  items: {
    type: Array,
    default: () => [],
  },
  placeholder: {
    type: String,
    default: "Выберите элемент",
  },
  itemName: {
    type: String,
    default: "элемент",
  },
  allowAddNew: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits(["update:modelValue", "item-added"]);

const { isOpen, dropdownRef, toggle, close } = useDropdown();
const searchQuery = ref("");
const newItem = ref("");

// Фильтрация элементов по поиску
const filteredItems = computed(() => {
  let items = props.items;

  // Если есть поисковый запрос, фильтруем по нему
  if (searchQuery.value) {
    items = items.filter((item) => item.toLowerCase().includes(searchQuery.value.toLowerCase()));
  }

  return items;
});

// Выбор элемента
function selectItem(item) {
  emit("update:modelValue", item);
  close();
  searchQuery.value = "";
}

// Очистка полей при открытии/закрытии
function handleToggle() {
  toggle();
  if (isOpen.value) {
    searchQuery.value = "";
    newItem.value = "";
  }
}

// Добавление нового элемента
function addNewItem() {
  const item = newItem.value.trim();
  if (item && !props.items.includes(item)) {
    emit("item-added", item);
    emit("update:modelValue", item);
    close();
    newItem.value = "";
    searchQuery.value = "";
  } else if (item && props.items.includes(item)) {
    // Если элемент уже существует, просто выбираем его
    emit("update:modelValue", item);
    close();
    newItem.value = "";
    searchQuery.value = "";
  }
}
</script>


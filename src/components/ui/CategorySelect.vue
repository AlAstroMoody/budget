<template>
  <UniversalSelect
    :model-value="modelValue"
    :items="categories"
    placeholder="Выберите категорию"
    item-name="категория"
    :allow-add-new="true"
    @update:model-value="(value) => emit('update:modelValue', value)"
    @item-added="handleCategoryAdded"
  />
</template>

<script setup>
import UniversalSelect from "./UniversalSelect.vue";

defineProps({
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

// Обработчик добавления новой категории
function handleCategoryAdded(newCategory) {
  emit("category-added", newCategory);
}
</script>

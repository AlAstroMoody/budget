<script setup>
defineProps({
  data: {
    type: Array,
    default: () => [],
  },
  striped: {
    type: Boolean,
    default: false,
  },
  hover: {
    type: Boolean,
    default: true,
  },
});
</script>

<template>
  <div class="w-full">
    <table class="w-full caption-bottom text-sm">
      <thead class="border-b bg-gray-50">
        <tr>
          <slot name="header" />
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-200 min-h-[200px]">
        <tr
          v-for="(row, index) in data"
          :key="row.id || `${row.date}-${row.description}-${row.amount}-${index}`"
          :class="[
            hover && 'hover:bg-gray-50 transition-colors',
            striped && index % 2 === 1 && 'bg-gray-50',
          ]"
        >
          <slot name="row" :row="row" :index="index" />
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
td,
th {
  padding: 0.75rem 1.25rem;
}

/* Столбец описания — делаем уже */
td.table-description,
th.table-description {
  max-width: 120px;
  width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Столбец категории — делаем шире */
td.table-category,
th.table-category {
  min-width: 320px;
  width: 320px;
  position: relative;
}

/* Столбец комментария — делаем шире и разрешаем перенос текста */
td.table-comment,
th.table-comment {
  min-width: 350px;
  width: 350px;
  white-space: normal;
  word-wrap: break-word;
  max-width: 350px;
}

/* Общие стили для всех ячеек */
td {
  vertical-align: top;
}

/* Стили для заголовков */
th {
  font-weight: 600;
  color: #374151;
  background-color: #f9fafb;
}
</style>

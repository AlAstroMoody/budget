<script setup>
import { ref } from "vue";

const props = defineProps({
  selectedBank: {
    type: String,
    default: null,
  },
});

const emit = defineEmits(["bank-selected"]);

const banks = [
  { key: "sberbank", name: "Сбербанк", icon: "🏦" },
  { key: "alfabank", name: "Альфа-Банк", icon: "🏛️" },
  { key: "tinkoff", name: "Тинькофф", icon: "💳" },
  { key: "ozon", name: "Озон Банк", icon: "🛒" },
];

const selectedBank = ref(props.selectedBank);

const selectBank = (bankKey) => {
  selectedBank.value = bankKey;
  emit("bank-selected", bankKey);
};
</script>

<template>
  <div class="space-y-3">
    <h3 class="text-base font-medium text-gray-900">Выберите банк</h3>
    <div class="grid grid-cols-2 gap-2">
      <button
        v-for="bank in banks"
        :key="bank.key"
        @click="selectBank(bank.key)"
        :class="[
          'flex items-center justify-center p-3 rounded-lg border-2 transition-all',
          selectedBank === bank.key
            ? 'border-blue-500 bg-blue-50 text-blue-700'
            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
        ]"
      >
        <div class="text-center">
          <div class="text-2xl mb-1">{{ bank.icon }}</div>
          <div class="text-sm font-medium">{{ bank.name }}</div>
        </div>
      </button>
    </div>
  </div>
</template>

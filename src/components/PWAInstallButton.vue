<template>
  <div
    v-if="isShow"
    class="fixed bottom-4 right-4 z-50 flex gap-2 rounded-lg bg-blue-600 p-3 text-white shadow-lg"
  >
    <button
      class="rounded-md bg-white px-3 py-1 text-sm font-medium text-blue-600 hover:bg-gray-100 transition-colors"
      @click="installPWA"
    >
      📱 Установить
    </button>
    <button
      class="rounded-md bg-gray-600 px-3 py-1 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
      @click="isShow = false"
    >
      ✕
    </button>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";

const isShow = ref(false);
const installEvent = ref(null);

async function hideComponent() {
  if ("getInstalledRelatedApps" in navigator) {
    try {
      const relatedApps = await navigator.getInstalledRelatedApps();
      const PWAisInstalled = relatedApps.length > 0;
      if (PWAisInstalled) {
        isShow.value = false;
      }
    } catch {
      // Игнорируем ошибки
    }
  }
}

function installPWA() {
  if (!installEvent.value) return;

  installEvent.value.prompt();
  installEvent.value.userChoice.then(() => {
    isShow.value = false;
  });
}

onMounted(() => {
  hideComponent();
});

// Слушаем событие beforeinstallprompt
window.addEventListener("beforeinstallprompt", (e) => {
  // Сохраняем событие для использования позже
  installEvent.value = e;
  // Показываем кнопку установки
  isShow.value = true;
});

// Слушаем успешную установку
window.addEventListener("appinstalled", () => {
  isShow.value = false;
});
</script>

<style scoped>
/* Скрываем кнопку если приложение уже установлено */
@media (display-mode: standalone), (display-mode: window-controls-overlay) {
  .pwa-install-button {
    display: none;
  }
}
</style>

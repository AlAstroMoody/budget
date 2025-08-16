import { ref, onMounted, onUnmounted, nextTick } from "vue";

export function useDropdown() {
  const isOpen = ref(false);
  const dropdownRef = ref(null);

  // Закрытие при клике вне элемента
  function handleClickOutside(event) {
    // Проверяем, что dropdownRef существует и клик был вне элемента
    if (dropdownRef.value && !dropdownRef.value.contains(event.target)) {
      isOpen.value = false;
    }
  }

  // Переключение состояния
  function toggle() {
    isOpen.value = !isOpen.value;
  }

  // Открытие
  function open() {
    isOpen.value = true;
  }

  // Закрытие
  function close() {
    isOpen.value = false;
  }

  // Обработчики событий
  onMounted(() => {
    // Добавляем обработчик с задержкой, чтобы DOM успел обновиться
    nextTick(() => {
      document.addEventListener("mousedown", handleClickOutside);
    });
  });

  onUnmounted(() => {
    document.removeEventListener("mousedown", handleClickOutside);
  });

  return {
    isOpen,
    dropdownRef,
    toggle,
    open,
    close,
  };
}

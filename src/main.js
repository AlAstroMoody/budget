import "@unocss/reset/tailwind.css";
import "uno.css";
import "./assets/main.css";

import { createApp } from "vue";
import App from "./App.vue";

// Импортируем наши UI компоненты
import { Button, Card, Input, Table, FileUpload } from "@/components/ui";

// Регистрация Service Worker для PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/budget/sw.js").catch(() => {
      // Service Worker не зарегистрирован
    });
  });
}

const app = createApp(App);

// Глобальная регистрация наших компонентов
app.component("Button", Button);
app.component("Card", Card);
app.component("Input", Input);
app.component("Table", Table);
app.component("FileUpload", FileUpload);

app.mount("#app");

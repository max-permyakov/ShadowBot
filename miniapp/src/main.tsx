import { createRoot } from "react-dom/client";
import { AppRoot } from "@telegram-apps/telegram-ui";
import "@telegram-apps/telegram-ui/dist/styles.css";
import "./styles.css";
import { App } from "./App";
import { setupTelegram, forceDarkTheme } from "./telegram";

setupTelegram();
// Гарантируем тёмную палитру до первой отрисовки
forceDarkTheme();

createRoot(document.getElementById("root")!).render(
  <AppRoot appearance="dark" platform="base">
    <App />
  </AppRoot>,
);

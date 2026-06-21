import { createApp } from "vue";
import { createPinia } from "pinia";
import ElementPlus from "element-plus";
import * as ElementPlusIconsVue from "@element-plus/icons-vue";
import "element-plus/dist/index.css";
import "./assets/main.css";
import App from "./App.vue";
import DesktopLyrics from "./components/DesktopLyrics.vue";

// Multi-window routing: check query parameters to see which shell to render
const urlParams = new URLSearchParams(window.location.search);
const isLyricsWindow = urlParams.get("window") === "lyrics";

const app = createApp(isLyricsWindow ? DesktopLyrics : App);

// Register icons globally
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component);
}

app.use(createPinia());
app.use(ElementPlus);
app.mount("#app");

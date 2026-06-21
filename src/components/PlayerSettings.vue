<script setup lang="ts">
import { useSettingsStore, Language, ThemeMode, ThemeColor } from "../stores/settingsStore";
import { Back } from "@element-plus/icons-vue";

const emit = defineEmits<{
  (e: "change-view", view: string): void;
}>();

const settingsStore = useSettingsStore();

const languages = [
  { label: "中文", value: "zh" as Language },
  { label: "English", value: "en" as Language },
];

const themeModes = [
  { label: "light", key: "light" as ThemeMode },
  { label: "dark", key: "dark" as ThemeMode },
];

const colorThemes = [
  { name: "themeIndigo", value: "indigo" as ThemeColor, hex: "#6366f1" },
  { name: "themeGreen", value: "green" as ThemeColor, hex: "#1db954" },
  { name: "themeRed", value: "red" as ThemeColor, hex: "#fc3c44" },
  { name: "themeBlue", value: "blue" as ThemeColor, hex: "#0ea5e9" },
  { name: "themeOrange", value: "orange" as ThemeColor, hex: "#f97316" },
  { name: "themePink", value: "pink" as ThemeColor, hex: "#ec4899" },
];
</script>

<template>
  <div class="settings-panel-container">
    <!-- Header -->
    <div class="settings-header">
      <button class="icon-btn back-btn" @click="emit('change-view', 'library')">
        <el-icon><Back /></el-icon>
        <span>{{ settingsStore.t("back") }}</span>
      </button>
      <h1 class="settings-title">{{ settingsStore.t("settings") }}</h1>
    </div>

    <!-- Scrollable content -->
    <div class="settings-content">
      <!-- Section 1: Language -->
      <div class="settings-section">
        <h3 class="section-title">{{ settingsStore.t("language") }}</h3>
        <div class="section-control">
          <el-radio-group 
            v-model="settingsStore.language" 
            @change="(val: any) => settingsStore.setLanguage(val as Language)"
          >
            <el-radio-button 
              v-for="lang in languages" 
              :key="lang.value" 
              :value="lang.value"
            >
              {{ lang.label }}
            </el-radio-button>
          </el-radio-group>
        </div>
      </div>

      <!-- Section 2: Theme Mode -->
      <div class="settings-section">
        <h3 class="section-title">{{ settingsStore.t("themeMode") }}</h3>
        <div class="section-control">
          <el-radio-group 
            v-model="settingsStore.themeMode" 
            @change="(val: any) => settingsStore.setThemeMode(val as ThemeMode)"
          >
            <el-radio-button 
              v-for="mode in themeModes" 
              :key="mode.key" 
              :value="mode.key"
            >
              {{ settingsStore.t(mode.key) }}
            </el-radio-button>
          </el-radio-group>
        </div>
      </div>

      <!-- Section 3: Desktop Lyrics Toggle -->
      <div class="settings-section">
        <h3 class="section-title">{{ settingsStore.t("desktopLyrics") }}</h3>
        <div class="section-control">
          <el-switch
            v-model="settingsStore.showDesktopLyrics"
            @change="(val: any) => settingsStore.setDesktopLyrics(val)"
            active-color="var(--primary-color)"
          />
        </div>
      </div>

      <!-- Section 4: Theme Accent Color -->
      <div class="settings-section">
        <h3 class="section-title">{{ settingsStore.t("themeColor") }}</h3>
        <div class="section-control">
          <div class="color-picker-grid">
            <button
              v-for="theme in colorThemes"
              :key="theme.value"
              class="color-dot-btn"
              :class="{ active: settingsStore.themeColor === theme.value }"
              :style="{ backgroundColor: theme.hex }"
              @click="settingsStore.setThemeColor(theme.value)"
              :title="settingsStore.t(theme.name)"
            >
              <div class="color-dot-inner"></div>
            </button>
          </div>
          <div class="active-color-name">
            {{ settingsStore.t("theme" + settingsStore.themeColor.charAt(0).toUpperCase() + settingsStore.themeColor.slice(1)) }}
          </div>
        </div>
      </div>

      <!-- Footer Info -->
      <div class="settings-footer-info">
        <div class="info-row">
          <span class="info-label">{{ settingsStore.t("appVersion") }}:</span>
          <span class="info-value">v1.0.0</span>
        </div>
        <div class="info-row">
          <span class="info-label">Framework:</span>
          <span class="info-value">Tauri v2 + Vue 3</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-panel-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
  color: var(--text-primary);
}

.settings-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 32px;
}

.back-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: var(--text-secondary);
}

.back-btn:hover {
  color: var(--primary-color);
}

.settings-title {
  font-size: 24px;
  font-weight: 700;
}

.settings-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
  background-color: var(--panel-bg);
  border: 1px solid var(--border-color);
  padding: 32px;
  border-radius: 12px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.05);
  transition: background-color 0.2s, border-color 0.2s;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 20px;
  transition: border-color 0.2s;
}

.settings-section:last-of-type {
  border-bottom: none;
  padding-bottom: 0;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.section-control {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Color theme dots grid */
.color-picker-grid {
  display: flex;
  gap: 14px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 4px;
}

.color-dot-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s, border-color 0.2s;
  outline: none;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

.color-dot-btn:hover {
  transform: scale(1.15);
}

.color-dot-btn.active {
  border-color: var(--text-primary);
  transform: scale(1.1);
}

.color-dot-inner {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: #ffffff;
  opacity: 0;
  transition: opacity 0.2s;
}

.color-dot-btn.active .color-dot-inner {
  opacity: 1;
}

.active-color-name {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 600;
  margin-top: 4px;
}

.settings-footer-info {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background-color: var(--bg-color);
  padding: 16px;
  border-radius: 8px;
  transition: background-color 0.2s;
}

.info-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
}

.info-label {
  color: var(--text-secondary);
}

.info-value {
  color: var(--text-primary);
  font-weight: 600;
}
</style>

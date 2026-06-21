<script setup lang="ts">
import { usePlayerStore } from "../stores/playerStore";
import { useSettingsStore } from "../stores/settingsStore";
import { 
  Menu,
  Headset, 
  Star, 
  Clock, 
  FolderAdd, 
  DocumentAdd,
  Delete,
  Setting
} from "@element-plus/icons-vue";

const playerStore = usePlayerStore();
const settingsStore = useSettingsStore();
</script>

<template>
  <div class="sidebar">
    <!-- Menu Sections -->
    <div class="menu-group">
      <div class="group-title">
        {{ settingsStore.language === 'zh' ? '我的音乐' : 'My Music' }}
      </div>
      
      <div 
        class="menu-item" 
        :class="{ active: playerStore.activeView === 'library' }" 
        @click="playerStore.activeView = 'library'"
      >
        <el-icon class="menu-icon"><Menu /></el-icon>
        <span class="menu-label">{{ settingsStore.t("library") }}</span>
        <span class="badge" v-if="playerStore.queue.length > 0">
          {{ playerStore.queue.length }}
        </span>
      </div>

      <div 
        class="menu-item" 
        :class="{ active: playerStore.activeView === 'now-playing' }" 
        @click="playerStore.activeView = 'now-playing'"
      >
        <el-icon class="menu-icon"><Headset /></el-icon>
        <span class="menu-label">{{ settingsStore.t("nowPlaying") }}</span>
        <span class="pulse-icon-wrapper" v-if="playerStore.isPlaying">
          <span class="pulse-dot"></span>
        </span>
      </div>

      <div 
        class="menu-item" 
        :class="{ active: playerStore.activeView === 'favorites' }" 
        @click="playerStore.activeView = 'favorites'"
      >
        <el-icon class="menu-icon"><Star /></el-icon>
        <span class="menu-label">{{ settingsStore.t("favorites") }}</span>
        <span class="badge favorites-badge" v-if="playerStore.favorites.length > 0">
          {{ playerStore.favorites.length }}
        </span>
      </div>

      <div 
        class="menu-item" 
        :class="{ active: playerStore.activeView === 'history' }" 
        @click="playerStore.activeView = 'history'"
      >
        <el-icon class="menu-icon"><Clock /></el-icon>
        <span class="menu-label">{{ settingsStore.t("history") }}</span>
      </div>

      <div 
        class="menu-item" 
        :class="{ active: playerStore.activeView === 'settings' }" 
        @click="playerStore.activeView = 'settings'"
      >
        <el-icon class="menu-icon"><Setting /></el-icon>
        <span class="menu-label">{{ settingsStore.t("settings") }}</span>
      </div>
    </div>

    <!-- Actions Section -->
    <div class="actions-group">
      <div class="group-title">
        {{ settingsStore.language === 'zh' ? '导入操作' : 'Import Actions' }}
      </div>
      
      <button class="action-btn" @click="playerStore.importFiles">
        <el-icon><DocumentAdd /></el-icon>
        <span>{{ settingsStore.t("importFiles") }}</span>
      </button>

      <button class="action-btn" @click="playerStore.importFolder">
        <el-icon><FolderAdd /></el-icon>
        <span>{{ settingsStore.t("importFolder") }}</span>
      </button>

      <div class="divider"></div>

      <button 
        class="action-btn danger-btn" 
        @click="playerStore.clearQueue" 
        :disabled="playerStore.queue.length === 0"
      >
        <el-icon><Delete /></el-icon>
        <span>{{ settingsStore.t("clearLibrary") }}</span>
      </button>
    </div>

    <!-- Footer Status -->
    <div class="sidebar-footer">
      <div class="app-version">{{ settingsStore.t("appVersion") }}: v1.0.0</div>
      <div class="engine-status">{{ settingsStore.t("engineActive") }}</div>
    </div>
  </div>
</template>

<style scoped>
.sidebar {
  width: 230px;
  height: 100%;
  background-color: var(--panel-bg);
  border-right: 1px solid var(--border-color);
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  transition: background-color 0.2s, border-color 0.2s;
}

.menu-group, .actions-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 24px;
}

.group-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 1px;
  padding-left: 12px;
  margin-bottom: 8px;
}

.menu-item {
  height: 40px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  border-radius: 8px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.menu-item:hover {
  background-color: var(--panel-bg-hover);
  color: var(--text-primary);
}

.menu-item.active {
  background-color: var(--panel-bg-active);
  color: var(--primary-color);
  font-weight: 600;
}

.menu-item.active::before {
  content: "";
  position: absolute;
  left: 0;
  top: 10px;
  bottom: 10px;
  width: 3px;
  background: var(--primary-gradient);
  border-radius: 0 4px 4px 0;
}

.menu-icon {
  font-size: 16px;
  margin-right: 12px;
}

.menu-label {
  font-size: 13px;
  flex-grow: 1;
}

.badge {
  font-size: 10px;
  background-color: var(--slider-runnable-bg);
  color: var(--text-secondary);
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 600;
}

.menu-item.active .badge {
  background-color: var(--primary-color);
  color: #ffffff;
  box-shadow: 0 0 6px var(--primary-color);
}

.favorites-badge {
  background-color: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}

.menu-item.active .favorites-badge {
  background-color: #f59e0b;
  color: #ffffff;
}

.action-btn {
  height: 38px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background-color: transparent;
  color: var(--text-primary);
  font-size: 12.5px;
  cursor: pointer;
  transition: all 0.2s ease;
  width: 100%;
}

.action-btn:hover:not(:disabled) {
  border-color: var(--primary-color);
  background-color: var(--panel-bg-hover);
  transform: translateY(-1px);
}

.action-btn:active:not(:disabled) {
  transform: translateY(0);
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.danger-btn {
  color: #f43f5e;
  border-color: rgba(244, 63, 94, 0.2);
}

.danger-btn:hover:not(:disabled) {
  border-color: #f43f5e;
  background-color: rgba(244, 63, 94, 0.08) !important;
}

.divider {
  height: 1px;
  background-color: var(--border-color);
  margin: 6px 0;
}

.sidebar-footer {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-left: 12px;
}

.app-version {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 600;
}

.engine-status {
  font-size: 10px;
  color: #10b981; /* Emerald green */
  display: flex;
  align-items: center;
  gap: 4px;
}

.engine-status::before {
  content: "";
  display: inline-block;
  width: 6px;
  height: 6px;
  background-color: #10b981;
  border-radius: 50%;
  box-shadow: 0 0 4px #10b981;
}

.pulse-icon-wrapper {
  display: flex;
  align-items: center;
  margin-left: auto;
  padding-right: 4px;
}

.pulse-dot {
  width: 7px;
  height: 7px;
  background-color: #10b981;
  border-radius: 50%;
  box-shadow: 0 0 6px #10b981;
  animation: pulseAnimation 1.4s infinite alternate;
}

@keyframes pulseAnimation {
  0% {
    transform: scale(0.8);
    box-shadow: 0 0 4px rgba(16, 185, 129, 0.4);
  }
  100% {
    transform: scale(1.2);
    box-shadow: 0 0 8px rgba(16, 185, 129, 0.8);
  }
}
</style>

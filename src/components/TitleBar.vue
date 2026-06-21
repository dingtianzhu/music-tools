<script setup lang="ts">
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Headset, SemiSelect, FullScreen, Close } from "@element-plus/icons-vue";

const appWindow = getCurrentWindow();

const startDrag = async (e: MouseEvent) => {
  // Only drag on left click
  if (e.button === 0) {
    await appWindow.startDragging();
  }
};

const minimize = async () => {
  await appWindow.minimize();
};

const toggleMaximize = async () => {
  await appWindow.toggleMaximize();
};

const close = async () => {
  await appWindow.close();
};
</script>

<template>
  <div class="titlebar" @mousedown="startDrag">
    <div class="logo">
      <el-icon class="logo-icon"><Headset /></el-icon>
      <span class="logo-text">Harmony Desktop</span>
    </div>
    
    <div class="window-controls" @mousedown.stop>
      <button class="control-btn min" @click="minimize" title="Minimize">
        <el-icon><SemiSelect /></el-icon>
      </button>
      <button class="control-btn max" @click="toggleMaximize" title="Maximize">
        <el-icon><FullScreen /></el-icon>
      </button>
      <button class="control-btn close" @click="close" title="Close">
        <el-icon><Close /></el-icon>
      </button>
    </div>
  </div>
</template>

<style scoped>
.titlebar {
  height: var(--titlebar-height);
  background-color: var(--panel-bg);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 12px;
  position: relative;
  z-index: 9999;
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
  pointer-events: none; /* Let clicks pass through to drag */
}

.logo-icon {
  font-size: 16px;
  color: var(--primary-color);
  filter: drop-shadow(0 0 4px var(--primary-color));
}

.logo-text {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.5px;
}

.window-controls {
  display: flex;
  align-items: center;
  height: 100%;
}

.control-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  width: 46px;
  height: var(--titlebar-height);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.2s, color 0.2s;
  outline: none;
}

.control-btn:hover {
  background-color: var(--panel-bg-hover);
  color: var(--text-primary);
}

.control-btn.close:hover {
  background-color: #f43f5e;
  color: #ffffff;
}

.control-btn:active {
  filter: brightness(0.8);
}

.control-btn el-icon {
  font-size: 14px;
}
</style>

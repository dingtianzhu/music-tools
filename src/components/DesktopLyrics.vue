<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSettingsStore } from "../stores/settingsStore";

const settingsStore = useSettingsStore();
const lyricText = ref("Harmony Desktop");
let unlistenLyric: (() => void) | null = null;
const appWindow = getCurrentWindow();

const startDrag = async (e: MouseEvent) => {
  // Drag the window when left-clicking anywhere on the container
  if (e.button === 0) {
    await appWindow.startDragging();
  }
};

const hideWindow = async () => {
  // Sync the switch in settings store
  await settingsStore.setDesktopLyrics(false);
};

onMounted(async () => {
  // Apply visual theme class (so we get the correct primary glows)
  settingsStore.applyThemeToDOM();

  try {
    // Listen to synced lyric events emitted from the main window
    const unlisten = await listen<string>("update-lyric", (event) => {
      lyricText.value = event.payload || "Harmony Desktop";
    });
    unlistenLyric = () => {
      unlisten();
    };
  } catch (e) {
    console.error("Failed to setup desktop lyrics listener:", e);
  }
});

onUnmounted(() => {
  if (unlistenLyric) {
    unlistenLyric();
  }
});
</script>

<template>
  <div class="desktop-lyrics-container" @mousedown="startDrag">
    <!-- Close button shown on hover -->
    <button class="close-lyric-btn" @click.stop="hideWindow" title="隐藏桌面歌词">
      ×
    </button>
    
    <!-- Large styled synced lyric text -->
    <div class="lyric-text-display">
      {{ lyricText }}
    </div>
  </div>
</template>

<style scoped>
.desktop-lyrics-container {
  height: 100vh;
  width: 100vw;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(8, 8, 10, 0.01); /* almost invisible backdrop */
  border-radius: 8px;
  padding: 0 40px;
  position: relative;
  overflow: hidden;
  transition: background-color 0.25s, border 0.25s;
  border: 1px solid transparent;
}

.desktop-lyrics-container:hover {
  background-color: rgba(8, 8, 10, 0.7); /* dark overlay on hover to reposition */
  border: 1px solid var(--border-color);
}

.lyric-text-display {
  font-size: 26px;
  font-weight: 800;
  color: #ffffff;
  text-align: center;
  letter-spacing: 1.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
  cursor: move;
  /* Thick black text shadow + custom colored glow for readability on any desktop background */
  text-shadow: 
    -1.5px -1.5px 0 #000,  
     1.5px -1.5px 0 #000,
    -1.5px  1.5px 0 #000,
     1.5px  1.5px 0 #000,
     0px 0px 8px var(--primary-color),
     0px 0px 14px var(--primary-color);
}

.close-lyric-btn {
  position: absolute;
  top: 6px;
  right: 12px;
  background: transparent;
  border: none;
  color: #ffffff;
  font-size: 20px;
  font-weight: 300;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s, color 0.2s;
  outline: none;
  z-index: 10;
}

.desktop-lyrics-container:hover .close-lyric-btn {
  opacity: 0.6;
}

.close-lyric-btn:hover {
  opacity: 1 !important;
  color: #f43f5e;
}
</style>

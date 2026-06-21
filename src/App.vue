<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { usePlayerStore } from "./stores/playerStore";
import { useSettingsStore } from "./stores/settingsStore";
import TitleBar from "./components/TitleBar.vue";
import Sidebar from "./components/Sidebar.vue";
import PlayerMain from "./components/PlayerMain.vue";
import PlayerBar from "./components/PlayerBar.vue";

const playerStore = usePlayerStore();
const settingsStore = useSettingsStore();
const activeView = ref("library");
const showVisualizer = ref(true);

const changeView = (view: string) => {
  activeView.value = view;
};

const toggleVisualizer = () => {
  showVisualizer.value = !showVisualizer.value;
};

// Global Hotkeys: Space to Play/Pause
const handleKeyDown = (e: KeyboardEvent) => {
  // Check if focus is in input or textarea
  if (e.code === "Space") {
    const activeEl = document.activeElement;
    if (activeEl) {
      const tag = activeEl.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea") {
        return; // Don't intercept typing spaces
      }
    }
    e.preventDefault();
    playerStore.togglePlay();
  }
};

onMounted(() => {
  playerStore.init();
  settingsStore.applyThemeToDOM();
  window.addEventListener("keydown", handleKeyDown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeyDown);
});
</script>

<template>
  <div class="app-container">
    <!-- Custom Draggable Draggable TitleBar -->
    <TitleBar />

    <!-- Core Content Pane -->
    <div class="main-content">
      <Sidebar 
        :active-view="activeView" 
        @change-view="changeView" 
      />
      <PlayerMain 
        :active-view="activeView" 
        :show-visualizer="showVisualizer" 
        @change-view="changeView"
      />
    </div>

    <!-- Playback Footer -->
    <PlayerBar 
      :active-view="activeView" 
      :show-visualizer="showVisualizer"
      @toggle-visualizer="toggleVisualizer" 
      @change-view="changeView"
    />
  </div>
</template>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background-color: var(--bg-color);
}

.main-content {
  display: flex;
  flex-direction: row;
  flex-grow: 1;
  overflow: hidden;
  position: relative;
}
</style>
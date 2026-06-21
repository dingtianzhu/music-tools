<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { usePlayerStore } from "./stores/playerStore";
import { useSettingsStore } from "./stores/settingsStore";
import { AudioService } from "./services/audioService";
import { listen } from "@tauri-apps/api/event";
import TitleBar from "./components/TitleBar.vue";
import Sidebar from "./components/Sidebar.vue";
import PlayerMain from "./components/PlayerMain.vue";
import PlayerBar from "./components/PlayerBar.vue";
import { 
  FullScreen,
  Back,
  DArrowLeft,
  DArrowRight,
  VideoPlay,
  VideoPause,
  RefreshRight,
  SetUp,
  Mute
} from "@element-plus/icons-vue";

const playerStore = usePlayerStore();
const settingsStore = useSettingsStore();
const audioService = AudioService.getInstance();
const showVisualizer = ref(true);
const globalVideoContainerRef = ref<HTMLElement | null>(null);

const toggleVisualizer = () => {
  showVisualizer.value = !showVisualizer.value;
};

// Format duration
const formatDuration = (seconds: number) => {
  if (isNaN(seconds) || seconds === Infinity || !seconds) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
};

// Immersive Overlay Controls fade system for MV
const showVideoControls = ref(true);
const isHoveringVideoControls = ref(false);
let videoControlsTimer: any = null;

const resetVideoControlsTimer = () => {
  showVideoControls.value = true;
  if (videoControlsTimer) clearTimeout(videoControlsTimer);
  videoControlsTimer = setTimeout(() => {
    if (!isHoveringVideoControls.value && playerStore.activeView === 'now-playing' && playerStore.playbackMode === 'mv') {
      showVideoControls.value = false;
    }
  }, 2500);
};

const keepVideoControlsVisible = () => {
  isHoveringVideoControls.value = true;
  showVideoControls.value = true;
  if (videoControlsTimer) clearTimeout(videoControlsTimer);
};

const startVideoControlsFadeTimer = () => {
  isHoveringVideoControls.value = false;
  resetVideoControlsTimer();
};

const handleVideoMouseMove = () => {
  if (playerStore.activeView === "now-playing" && playerStore.playbackMode === 'mv') {
    resetVideoControlsTimer();
  }
};

const requestVideoFullscreen = () => {
  const video = audioService.getMediaElement();
  if (video) {
    video.requestFullscreen().catch((err) => {
      console.error("Error attempting to enable fullscreen:", err);
    });
  }
};

// Overlay play bar helpers
const toggleLoopModeGlobal = () => {
  if (playerStore.loopMode === "list") {
    playerStore.setLoopMode("single");
  } else if (playerStore.loopMode === "single") {
    playerStore.setLoopMode("shuffle");
  } else {
    playerStore.setLoopMode("list");
  }
};

const loopModeColorGlobal = computed(() => {
  return playerStore.loopMode !== "list" ? "var(--primary-color)" : "#ffffff";
});

const loopModeTitleGlobal = computed(() => {
  if (playerStore.loopMode === "list") return settingsStore.language === 'zh' ? '列表循环' : 'Repeat List';
  if (playerStore.loopMode === "single") return settingsStore.language === 'zh' ? '单曲循环' : 'Repeat Single';
  return settingsStore.language === 'zh' ? '随机播放' : 'Shuffle Play';
});

const toggleMuteGlobal = () => {
  if (playerStore.volume > 0) {
    (window as any)._lastVolume = playerStore.volume;
    playerStore.setVolume(0);
  } else {
    playerStore.setVolume((window as any)._lastVolume || 0.5);
  }
};

// Keyboard listener for switching modes
const handleMainKeyDown = (e: KeyboardEvent) => {
  // Check spacebar first
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

  // Switch playback mode with arrow keys in Now Playing
  if (playerStore.activeView !== 'now-playing') return;
  const track = playerStore.currentTrack;
  if (track && playerStore.isVideo(track.path)) {
    if (e.key === "ArrowLeft") {
      playerStore.playbackMode = "mv";
      resetVideoControlsTimer();
    } else if (e.key === "ArrowRight") {
      playerStore.playbackMode = "lyrics";
      resetVideoControlsTimer();
    }
  }
};

// Swipe / Drag detection to switch modes in App (for MV viewport overlay)
let startDragX = 0;
let startDragY = 0;

const handleVideoSwipeStart = (e: TouchEvent | MouseEvent) => {
  if (playerStore.activeView !== 'now-playing' || !playerStore.currentTrack || !playerStore.isVideo(playerStore.currentTrack.path)) return;
  startDragX = 'touches' in e ? e.touches[0].clientX : e.clientX;
  startDragY = 'touches' in e ? e.touches[0].clientY : e.clientY;
};

const handleVideoSwipeEnd = (e: TouchEvent | MouseEvent) => {
  if (playerStore.activeView !== 'now-playing' || !playerStore.currentTrack || !playerStore.isVideo(playerStore.currentTrack.path)) return;
  const endDragX = 'changedTouches' in e ? e.changedTouches[0].clientX : e.clientX;
  const endDragY = 'changedTouches' in e ? e.changedTouches[0].clientY : e.clientY;
  
  const diffX = startDragX - endDragX;
  const diffY = startDragY - endDragY;
  
  // Left swipe switches to lyrics, right swipe switches to MV
  if (Math.abs(diffX) > 60 && Math.abs(diffY) < 50) {
    if (diffX > 0) {
      playerStore.playbackMode = 'lyrics';
    } else {
      playerStore.playbackMode = 'mv';
    }
    resetVideoControlsTimer();
  }
};

let unlistenClosedFn: (() => void) | null = null;
let unlistenHiddenFn: (() => void) | null = null;

onMounted(async () => {
  playerStore.init();
  settingsStore.applyThemeToDOM();
  window.addEventListener("keydown", handleMainKeyDown);

  try {
    const unlistenClosed = await listen("desktop-lyrics-closed", () => {
      settingsStore.showDesktopLyrics = false;
      localStorage.setItem("showDesktopLyrics", "false");
    });
    unlistenClosedFn = unlistenClosed;

    const unlistenHidden = await listen("main-window-hidden", () => {
      if (playerStore.isPlaying) {
        settingsStore.setDesktopLyrics(true);
      }
    });
    unlistenHiddenFn = unlistenHidden;
  } catch (e) {
    console.error("Failed to setup Tauri event listeners in App:", e);
  }

  // Mount the video element into the global hidden container
  if (globalVideoContainerRef.value) {
    const video = audioService.getMediaElement();
    globalVideoContainerRef.value.appendChild(video);
    video.style.display = "block";
    video.style.width = "100%";
    video.style.height = "100%";
    video.style.objectFit = "contain";
    video.controls = false;

    // Auto-capture MV frame when video loads
    video.addEventListener("loadeddata", () => {
      if (playerStore.currentTrack && !playerStore.currentTrack.cover && playerStore.isVideo(playerStore.currentTrack.path)) {
        try {
          const canvas = document.createElement("canvas");
          const scale = Math.min(1, 320 / video.videoWidth);
          canvas.width = video.videoWidth * scale;
          canvas.height = video.videoHeight * scale;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
            playerStore.currentTrack.cover = dataUrl;
            playerStore.saveQueueToStorage();
          }
        } catch (e) {
          console.warn("Failed to generate MV thumbnail screenshot globally:", e);
        }
      }
    });

    // Double click video to toggle fullscreen
    const toggleFullscreen = () => {
      if (!document.fullscreenElement) {
        video.requestFullscreen().catch((err) => {
          console.error("Error attempting to enable fullscreen:", err);
        });
      } else {
        document.exitFullscreen();
      }
    };
    video.addEventListener("dblclick", toggleFullscreen);
  }
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleMainKeyDown);
  if (videoControlsTimer) clearTimeout(videoControlsTimer);
  if (unlistenClosedFn) unlistenClosedFn();
  if (unlistenHiddenFn) unlistenHiddenFn();
});
</script>

<template>
  <div class="app-container">
    <!-- Custom Draggable Draggable TitleBar -->
    <TitleBar />

    <!-- Core Content Pane -->
    <div class="main-content">
      <Sidebar />
      <PlayerMain 
        :show-visualizer="showVisualizer" 
      />
    </div>

    <!-- Playback Footer -->
    <PlayerBar 
      :show-visualizer="showVisualizer"
      @toggle-visualizer="toggleVisualizer" 
    />

    <!-- Global Video Container for uninterrupted playback -->
    <div 
      ref="globalVideoContainerRef"
      id="global-video-container" 
      :class="{ 
        'visible-mv': playerStore.activeView === 'now-playing' && playerStore.playbackMode === 'mv' && playerStore.currentTrack && playerStore.isVideo(playerStore.currentTrack.path)
      }"
      @mousemove="handleVideoMouseMove"
      @mousedown="handleVideoSwipeStart"
      @mouseup="handleVideoSwipeEnd"
      @touchstart="handleVideoSwipeStart"
      @touchend="handleVideoSwipeEnd"
    >
      <!-- Floating Controls Overlay on Hover -->
      <div 
        class="now-playing-controls-overlay"
        :class="{ visible: showVideoControls }"
        @mouseenter="keepVideoControlsVisible"
        @mouseleave="startVideoControlsFadeTimer"
      >
        <!-- Top bar controls -->
        <div class="controls-top-bar">
          <button class="overlay-back-btn" @click="playerStore.activeView = 'library'" title="返回曲库">
            <el-icon><Back /></el-icon>
            <span>{{ settingsStore.language === 'zh' ? '返回曲库' : 'Back' }}</span>
          </button>

          <!-- Toggle View Tabs (MV / Lyrics) -->
          <div 
            class="mode-segment-tabs"
            v-if="playerStore.currentTrack && playerStore.isVideo(playerStore.currentTrack.path)"
          >
            <button 
              class="tab-btn" 
              :class="{ active: playerStore.playbackMode === 'mv' }"
              @click="playerStore.playbackMode = 'mv'"
            >
              MV
            </button>
            <button 
              class="tab-btn" 
              :class="{ active: playerStore.playbackMode === 'lyrics' }"
              @click="playerStore.playbackMode = 'lyrics'"
            >
              {{ settingsStore.language === 'zh' ? '歌词' : 'Lyrics' }}
            </button>
          </div>
        </div>

        <!-- Bottom bar controls -->
        <div class="controls-bottom-bar" @mousedown.stop @mouseup.stop @touchstart.stop @touchend.stop>
          <!-- Timeline slider -->
          <div class="overlay-timeline">
            <span class="time-lbl">{{ formatDuration(playerStore.currentTime) }}</span>
            <el-slider 
              v-model="playerStore.currentTime" 
              :max="playerStore.duration || 100" 
              :format-tooltip="formatDuration"
              @change="playerStore.seek"
              class="overlay-slider"
            />
            <span class="time-lbl">{{ formatDuration(playerStore.duration) }}</span>
          </div>

          <!-- Play controllers -->
          <div class="overlay-control-row">
            <div class="track-details-left" v-if="playerStore.currentTrack">
              <span class="track-title" :title="playerStore.currentTrack.title">{{ playerStore.currentTrack.title }}</span>
              <span class="track-artist">{{ playerStore.currentTrack.artist }}</span>
            </div>

            <div class="play-buttons-center">
              <!-- Loop Mode -->
              <button class="overlay-icon-btn" @click="toggleLoopModeGlobal" :title="loopModeTitleGlobal">
                <el-icon :style="{ color: loopModeColorGlobal }"><RefreshRight /></el-icon>
              </button>

              <!-- Prev -->
              <button class="overlay-icon-btn" @click="playerStore.prev" title="上一首">
                <el-icon><DArrowLeft /></el-icon>
              </button>

              <!-- Play/Pause -->
              <button class="overlay-play-pause-btn" @click="playerStore.togglePlay" title="播放/暂停">
                <el-icon v-if="playerStore.isPlaying"><VideoPause /></el-icon>
                <el-icon v-else><VideoPlay /></el-icon>
              </button>

              <!-- Next -->
              <button class="overlay-icon-btn" @click="playerStore.next" title="下一首">
                <el-icon><DArrowRight /></el-icon>
              </button>
              
              <!-- Fullscreen video button -->
              <button 
                class="overlay-icon-btn" 
                @click="requestVideoFullscreen" 
                title="全屏"
              >
                <el-icon><FullScreen /></el-icon>
              </button>
            </div>

            <!-- Volume control right -->
            <div class="volume-control-right">
              <button class="overlay-icon-btn" @click="toggleMuteGlobal">
                <el-icon><SetUp v-if="playerStore.volume > 0" /><Mute v-else /></el-icon>
              </button>
              <el-slider 
                v-model="playerStore.volume" 
                :max="1" 
                :step="0.01" 
                @input="playerStore.setVolume"
                :show-tooltip="false"
                class="overlay-volume-slider"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
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
  position: relative;
}

.main-content {
  display: flex;
  flex-direction: row;
  flex-grow: 1;
  overflow: hidden;
  position: relative;
}

/* Hidden global video element by default */
#global-video-container {
  position: fixed;
  top: 0;
  left: -9999px;
  width: 1px;
  height: 1px;
  opacity: 0.001;
  pointer-events: none;
  z-index: -1;
  background-color: transparent;
  overflow: hidden;
}

/* Widescreen MV display over PlayerMain content area */
#global-video-container.visible-mv {
  position: absolute;
  top: var(--titlebar-height, 48px); /* Height of titlebar */
  left: 230px; /* Width of sidebar */
  right: 0;
  bottom: 90px; /* Height of PlayerBar */
  width: calc(100% - 230px);
  height: calc(100% - var(--titlebar-height, 48px) - 90px);
  background-color: #000000;
  z-index: 1000;
  opacity: 1;
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Controls overlay styles inside global video container */
.now-playing-controls-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 11;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s ease;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.now-playing-controls-overlay.visible {
  opacity: 1;
}

.controls-top-bar {
  width: 100%;
  padding: 16px 32px;
  background: rgba(8, 8, 10, 0.65) !important;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  justify-content: space-between;
  align-items: center;
  pointer-events: auto;
}

.overlay-back-btn {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #ffffff;
  padding: 8px 16px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
  cursor: pointer;
  transition: all 0.2s;
  backdrop-filter: blur(10px);
}

.overlay-back-btn:hover {
  background-color: var(--primary-color);
  border-color: var(--primary-color);
  box-shadow: 0 0 10px var(--primary-color);
}

.mode-segment-tabs {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 3px;
  border-radius: 20px;
  display: flex;
  backdrop-filter: blur(10px);
}

.mode-segment-tabs .tab-btn {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  padding: 6px 18px;
  font-size: 12.5px;
  font-weight: 600;
  border-radius: 17px;
  cursor: pointer;
  transition: all 0.25s;
}

.mode-segment-tabs .tab-btn.active {
  background: var(--primary-gradient);
  color: #ffffff;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.4);
}

.controls-bottom-bar {
  width: 100%;
  padding: 24px 32px;
  background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 60%, transparent 100%);
  display: flex;
  flex-direction: column;
  gap: 12px;
  pointer-events: auto;
}

.overlay-timeline {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
}

.overlay-slider {
  flex-grow: 1;
}

.time-lbl {
  color: rgba(255, 255, 255, 0.6);
  font-size: 11px;
  font-family: monospace;
  width: 40px;
  text-align: center;
}

.overlay-control-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.track-details-left {
  width: 25%;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.track-details-left .track-title {
  color: #ffffff;
  font-size: 15px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-details-left .track-artist {
  color: var(--primary-color);
  font-size: 12.5px;
  font-weight: 600;
}

.play-buttons-center {
  display: flex;
  align-items: center;
  gap: 20px;
}

.overlay-icon-btn {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  font-size: 20px;
  cursor: pointer;
  transition: color 0.2s, transform 0.2s;
  display: flex;
  align-items: center;
}

.overlay-icon-btn:hover {
  color: var(--primary-color);
  transform: scale(1.08);
}

.overlay-play-pause-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--primary-gradient);
  border: none;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 10px rgba(99, 102, 241, 0.4);
}

.overlay-play-pause-btn:hover {
  transform: scale(1.08);
  box-shadow: 0 4px 14px rgba(99, 102, 241, 0.6);
}

.volume-control-right {
  width: 25%;
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: flex-end;
}

.overlay-volume-slider {
  width: 90px;
}
</style>
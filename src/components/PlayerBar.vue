<script setup lang="ts">
import { computed } from "vue";
import { usePlayerStore } from "../stores/playerStore";
import { useSettingsStore } from "../stores/settingsStore";
import { 
  VideoPlay, 
  VideoPause, 
  DArrowLeft, 
  DArrowRight, 
  Star, 
  StarFilled,
  Mute,
  Microphone,
  Memo,
  SetUp,
  RefreshRight,
  Menu,
  Monitor
} from "@element-plus/icons-vue";

defineProps<{
  showVisualizer: boolean;
}>();

const emit = defineEmits<{
  (e: "toggle-visualizer"): void;
}>();

const playerStore = usePlayerStore();
const settingsStore = useSettingsStore();

// Format time from seconds to mm:ss
const formatTime = (seconds: number) => {
  if (isNaN(seconds) || seconds === Infinity || !seconds) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
};

const currentTrack = computed(() => playerStore.currentTrack);

const toggleMute = () => {
  if (playerStore.volume > 0) {
    // Store current volume to restore later
    (window as any)._lastVolume = playerStore.volume;
    playerStore.setVolume(0);
  } else {
    playerStore.setVolume((window as any)._lastVolume || 0.5);
  }
};

const toggleLoopMode = () => {
  if (playerStore.loopMode === "list") {
    playerStore.setLoopMode("single");
  } else if (playerStore.loopMode === "single") {
    playerStore.setLoopMode("shuffle");
  } else {
    playerStore.setLoopMode("list");
  }
};

// Compute visual status for loop mode button
const loopModeIconColor = computed(() => {
  return playerStore.loopMode !== "list" ? "var(--primary-color)" : "var(--text-secondary)";
});

const loopModeTitle = computed(() => {
  if (playerStore.loopMode === "list") return settingsStore.language === 'zh' ? '列表循环' : 'Repeat List';
  if (playerStore.loopMode === "single") return settingsStore.language === 'zh' ? '单曲循环' : 'Repeat Single';
  return settingsStore.language === 'zh' ? '随机播放' : 'Shuffle Play';
});

const toggleNowPlayingView = () => {
  if (!currentTrack.value) return;
  if (playerStore.activeView === "now-playing") {
    playerStore.activeView = playerStore.previousView;
  } else {
    playerStore.activeView = "now-playing";
  }
};
</script>

<template>
  <div class="player-bar">
    <!-- Top Progress Bar (Full Width) -->
    <div class="player-bar-progress" @mousedown.stop>
      <el-slider 
        v-model="playerStore.currentTime" 
        :max="playerStore.duration || 100" 
        :format-tooltip="formatTime"
        @change="playerStore.seek"
        :disabled="playerStore.queue.length === 0"
        :show-tooltip="true"
        class="progress-slider"
      />
    </div>

    <!-- Left: Song Info -->
    <div class="song-info" :class="{ 'clickable': currentTrack }" @click="toggleNowPlayingView">
      <div class="cover-wrapper" :class="{ playing: playerStore.isPlaying && currentTrack }">
        <img 
          v-if="currentTrack?.cover" 
          :src="currentTrack.cover" 
          alt="Cover" 
          class="cover-art"
        />
        <div v-else class="cover-placeholder">
          <el-icon><Menu /></el-icon>
        </div>
      </div>
      <div class="metadata" v-if="currentTrack">
        <div class="title-scroller">
          <div class="title" :title="currentTrack.title">{{ currentTrack.title }}</div>
        </div>
        <div class="artist" :title="currentTrack.artist">{{ currentTrack.artist }}</div>
      </div>
      <div class="metadata-placeholder" v-else>
        <div class="no-track">{{ settingsStore.t("noTrack") }}</div>
      </div>
      
      <button 
        v-if="currentTrack"
        class="icon-btn fav-btn" 
        @click="playerStore.toggleFavorite(currentTrack.path)"
        :title="currentTrack.favorite ? (settingsStore.language === 'zh' ? '取消收藏' : 'Remove from favorites') : (settingsStore.language === 'zh' ? '添加收藏' : 'Add to favorites')"
      >
        <el-icon v-if="currentTrack.favorite" class="favorited"><StarFilled /></el-icon>
        <el-icon v-else><Star /></el-icon>
      </button>
    </div>

    <!-- Center: Play Controls & Timeline -->
    <div class="controls-section">
      <div class="buttons">
        <!-- Loop Mode -->
        <button 
          class="icon-btn control-btn" 
          @click="toggleLoopMode" 
          :title="loopModeTitle"
        >
          <el-icon :style="{ color: loopModeIconColor }"><RefreshRight /></el-icon>
          <span class="loop-indicator" v-if="playerStore.loopMode === 'single'">1</span>
          <span class="loop-indicator shuffle" v-else-if="playerStore.loopMode === 'shuffle'">S</span>
        </button>

        <!-- Previous -->
        <button 
          class="icon-btn control-btn" 
          @click="playerStore.prev" 
          :disabled="playerStore.queue.length === 0"
          :title="settingsStore.language === 'zh' ? '上一首' : 'Previous Track'"
        >
          <el-icon><DArrowLeft /></el-icon>
        </button>

        <!-- Play/Pause (Circular) -->
        <button 
          class="play-pause-btn" 
          @click="playerStore.togglePlay" 
          :disabled="playerStore.queue.length === 0"
          :title="playerStore.isPlaying ? (settingsStore.language === 'zh' ? '暂停' : 'Pause') : (settingsStore.language === 'zh' ? '播放' : 'Play')"
        >
          <el-icon v-if="playerStore.isPlaying"><VideoPause /></el-icon>
          <el-icon v-else><VideoPlay /></el-icon>
        </button>

        <!-- Next -->
        <button 
          class="icon-btn control-btn" 
          @click="playerStore.next" 
          :disabled="playerStore.queue.length === 0"
          :title="settingsStore.language === 'zh' ? '下一首' : 'Next Track'"
        >
          <el-icon><DArrowRight /></el-icon>
        </button>

        <!-- Toggle View / Visualizer -->
        <button 
          class="icon-btn control-btn" 
          :class="{ active: showVisualizer }"
          @click="emit('toggle-visualizer')" 
          :title="settingsStore.language === 'zh' ? '切换频谱/歌词' : 'Toggle Visualizer / Lyrics'"
        >
          <el-icon><Microphone /></el-icon>
        </button>
      </div>

      <!-- Centered Time Display -->
      <div class="time-display">
        <span>{{ formatTime(playerStore.currentTime) }}</span>
        <span class="divider">/</span>
        <span>{{ formatTime(playerStore.duration) }}</span>
      </div>
    </div>

    <!-- Right: Volume & Extra Actions -->
    <div class="volume-section">
      <!-- Desktop Lyrics Toggle -->
      <button 
        class="icon-btn" 
        :class="{ active: settingsStore.showDesktopLyrics }"
        @click="settingsStore.setDesktopLyrics(!settingsStore.showDesktopLyrics)"
        :title="settingsStore.t('desktopLyrics')"
      >
        <el-icon><Monitor /></el-icon>
      </button>

      <!-- Lyrics View Toggle -->
      <button 
        class="icon-btn" 
        :class="{ active: playerStore.activeView === 'now-playing' }"
        @click="playerStore.activeView = playerStore.activeView === 'now-playing' ? 'library' : 'now-playing'"
        :title="settingsStore.language === 'zh' ? '显示歌词面板' : 'View Fullscreen Lyrics'"
      >
        <el-icon><Memo /></el-icon>
      </button>

      <div class="volume-control">
        <button class="icon-btn" @click="toggleMute" :title="settingsStore.language === 'zh' ? '静音/取消静音' : 'Mute/Unmute'">
          <el-icon><SetUp v-if="playerStore.volume > 0" /><Mute v-else /></el-icon>
        </button>
        <el-slider 
          v-model="playerStore.volume" 
          :max="1" 
          :step="0.01" 
          @input="playerStore.setVolume"
          :show-tooltip="false"
          class="volume-slider"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.player-bar {
  height: 90px;
  background-color: var(--panel-bg);
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24px;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.05);
  transition: background-color 0.2s, border-color 0.2s;
  position: relative;
}

/* Left: Song Info */
.song-info {
  display: flex;
  align-items: center;
  width: 250px;
}

.cover-wrapper {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  overflow: hidden;
  background-color: var(--slider-runnable-bg);
  border: 1px solid var(--border-color);
  margin-right: 14px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.5s ease;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

.cover-wrapper.playing {
  transform: scale(1.04);
  border-color: var(--primary-color);
  box-shadow: 0 0 12px var(--active-glow);
}

.cover-art {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-placeholder {
  color: var(--text-muted);
  font-size: 24px;
}

.metadata {
  max-width: 140px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.title-scroller {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.artist {
  font-size: 11px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.metadata-placeholder {
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 500;
}

.fav-btn {
  margin-left: 12px;
  font-size: 16px;
}

.favorited {
  color: #f59e0b; /* Amber */
  filter: drop-shadow(0 0 4px rgba(245, 158, 11, 0.4));
}

/* Center: Controls Section */
.controls-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex-grow: 1;
  max-width: 480px;
  padding: 0 12px;
}

.buttons {
  display: flex;
  align-items: center;
  gap: 16px;
}

.control-btn {
  font-size: 18px;
  position: relative;
}

.control-btn.active {
  color: var(--primary-color);
  filter: drop-shadow(0 0 4px var(--primary-color));
}

.loop-indicator {
  position: absolute;
  top: -2px;
  right: -2px;
  font-size: 8px;
  font-weight: 900;
  background-color: var(--primary-color);
  color: #ffffff;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: scale(0.9);
}

.loop-indicator.shuffle {
  background-color: #a855f7;
}

.play-pause-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--primary-gradient);
  border: none;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  cursor: pointer;
  box-shadow: 0 4px 10px rgba(99, 102, 241, 0.3);
  transition: transform 0.2s, box-shadow 0.2s;
  outline: none;
}

.play-pause-btn:hover:not(:disabled) {
  transform: scale(1.08);
  box-shadow: 0 4px 14px rgba(99, 102, 241, 0.5);
}

.play-pause-btn:active:not(:disabled) {
  transform: scale(0.95);
}

.play-pause-btn:disabled {
  opacity: 0.5;
  background: var(--slider-runnable-bg);
  box-shadow: none;
  cursor: not-allowed;
}

.timeline {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.time-label {
  font-size: 11px;
  color: var(--text-secondary);
  font-family: monospace;
  width: 36px;
  text-align: center;
}

.slider {
  flex-grow: 1;
}

/* Right: Volume Section */
.volume-section {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 250px;
  justify-content: flex-end;
}

.volume-control {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 120px;
}

.volume-slider {
  flex-grow: 1;
}

button.icon-btn.active {
  color: var(--primary-color);
  filter: drop-shadow(0 0 4px var(--primary-color));
}

.song-info.clickable {
  cursor: pointer;
  border-radius: 8px;
  padding: 4px;
  margin: -4px;
  transition: background-color 0.2s;
}

.song-info.clickable:hover {
  background-color: var(--panel-bg-hover);
}

.song-info.clickable:hover .cover-wrapper {
  transform: scale(1.04);
  border-color: var(--primary-color);
  box-shadow: 0 0 10px var(--active-glow);
}

.song-info.clickable:hover .title {
  color: var(--primary-color);
}

/* Full-width top progress bar */
.player-bar-progress {
  position: absolute;
  top: -8px; /* Center perfectly on the top border of the player bar */
  left: 0;
  right: 0;
  height: 16px;
  z-index: 100;
  cursor: pointer;
}

.player-bar-progress :deep(.el-slider) {
  height: 16px;
  margin: 0;
  padding: 0;
}

.player-bar-progress :deep(.el-slider__runway) {
  height: 2px !important;
  margin: 7px 0 !important;
  border-radius: 0;
  background-color: var(--border-color) !important;
  transition: height 0.2s, background-color 0.2s;
}

.player-bar-progress :deep(.el-slider__bar) {
  height: 2px !important;
  border-radius: 0;
  transition: height 0.2s;
}

.player-bar-progress :deep(.el-slider__button-wrapper) {
  top: -9px !important;
  width: 20px;
  height: 20px;
}

.player-bar-progress :deep(.el-slider__button) {
  border: 2px solid var(--primary-color) !important;
  background-color: #ffffff !important;
  width: 10px !important;
  height: 10px !important;
  opacity: 0;
  transform: scale(0.8);
  transition: opacity 0.15s, transform 0.15s;
}

/* Expand track and reveal handle on hover */
.player-bar-progress:hover :deep(.el-slider__runway),
.player-bar-progress:hover :deep(.el-slider__bar) {
  height: 4px !important;
}

.player-bar-progress:hover :deep(.el-slider__button) {
  opacity: 1;
  transform: scale(1.1);
}

/* Centered time display */
.time-display {
  font-size: 11px;
  color: var(--text-secondary);
  font-family: monospace;
  display: flex;
  align-items: center;
  gap: 4px;
  user-select: none;
  font-weight: 500;
  height: 16px;
}

.time-display .divider {
  color: var(--text-muted);
  margin: 0 2px;
}
</style>

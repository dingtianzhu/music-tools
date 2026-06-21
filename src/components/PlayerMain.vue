<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { usePlayerStore, Track } from "../stores/playerStore";
import { useSettingsStore } from "../stores/settingsStore";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { 
  Search, 
  CaretRight, 
  Delete, 
  Star, 
  StarFilled,
  FolderOpened,
  Headset,
  Microphone,
  Back,
  DArrowLeft,
  DArrowRight,
  VideoPlay,
  VideoPause,
  RefreshRight,
  SetUp,
  Mute
} from "@element-plus/icons-vue";
import Visualizer from "./Visualizer.vue";
import PlayerSettings from "./PlayerSettings.vue";

defineProps<{
  showVisualizer: boolean;
}>();

const playerStore = usePlayerStore();
const settingsStore = useSettingsStore();

const searchQuery = ref("");
const lyricsContainerRef = ref<HTMLElement | null>(null);
const isDraggingOver = ref(false);
let unlistenDragDrop: (() => void) | null = null;

// Jump directly to play MV from library list
const playMVDirect = (track: Track) => {
  const index = playerStore.queue.findIndex(t => t.path === track.path);
  if (index !== -1) {
    playerStore.playTrack(index);
    playerStore.playbackMode = 'mv';
  }
};

// Seek to a specific lyric time
const seekToLyric = (seconds: number) => {
  playerStore.seek(seconds);
};

// Immersive Overlay Controls fade system
const showControlsOverlay = ref(true);
const isHoveringControls = ref(false);
let controlsTimer: any = null;

const resetControlsTimer = () => {
  showControlsOverlay.value = true;
  if (controlsTimer) clearTimeout(controlsTimer);
  controlsTimer = setTimeout(() => {
    if (!isHoveringControls.value && playerStore.activeView === 'now-playing') {
      showControlsOverlay.value = false;
    }
  }, 2500);
};

const keepControlsVisible = () => {
  isHoveringControls.value = true;
  showControlsOverlay.value = true;
  if (controlsTimer) clearTimeout(controlsTimer);
};

const startControlsFadeTimer = () => {
  isHoveringControls.value = false;
  resetControlsTimer();
};

const handleMouseMove = () => {
  if (playerStore.activeView === "now-playing") {
    resetControlsTimer();
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

// Swipe / Drag detection to switch modes
let startDragX = 0;
let startDragY = 0;

const handleSwipeStart = (e: TouchEvent | MouseEvent) => {
  if (playerStore.activeView !== 'now-playing' || !playerStore.currentTrack || !playerStore.isVideo(playerStore.currentTrack.path)) return;
  startDragX = 'touches' in e ? e.touches[0].clientX : e.clientX;
  startDragY = 'touches' in e ? e.touches[0].clientY : e.clientY;
};

const handleSwipeEnd = (e: TouchEvent | MouseEvent) => {
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
    resetControlsTimer();
  }
};

// Format duration
const formatDuration = (seconds: number) => {
  if (isNaN(seconds) || seconds === Infinity || !seconds) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
};

// Compute filtered tracks based on active view and search query
const displayedTracks = computed(() => {
  let list: Track[] = [];
  if (playerStore.activeView === "library") {
    list = playerStore.queue;
  } else if (playerStore.activeView === "favorites") {
    list = playerStore.queue.filter(t => t.favorite);
  } else if (playerStore.activeView === "history") {
    list = playerStore.history
      .map(path => playerStore.queue.find(t => t.path === path))
      .filter((t): t is Track => !!t);
  }
  
  if (!searchQuery.value.trim()) return list;
  
  const query = searchQuery.value.toLowerCase();
  return list.filter(t => 
    t.title.toLowerCase().includes(query) || 
    t.artist.toLowerCase().includes(query) || 
    t.album.toLowerCase().includes(query)
  );
});

// Row double click handler
const handleRowDblClick = (row: Track) => {
  const index = playerStore.queue.findIndex(t => t.path === row.path);
  if (index !== -1) {
    playerStore.playTrack(index);
  }
};

const playTrackDirect = (track: Track) => {
  const index = playerStore.queue.findIndex(t => t.path === track.path);
  if (index !== -1) {
    playerStore.playTrack(index);
  }
};

const removeTrackDirect = (track: Track) => {
  const index = playerStore.queue.findIndex(t => t.path === track.path);
  if (index !== -1) {
    playerStore.removeTrack(index);
  }
};

// Auto scroll lyrics watcher
watch(() => playerStore.currentLyricsIndex, (newIndex) => {
  if (playerStore.activeView !== "now-playing") return;
  
  setTimeout(() => {
    if (lyricsContainerRef.value) {
      if (newIndex === -1 || newIndex === 0) {
        lyricsContainerRef.value.scrollTo({
          top: 0,
          behavior: "smooth"
        });
      } else {
        const activeLine = lyricsContainerRef.value.querySelector(".lyric-line.active");
        if (activeLine) {
          activeLine.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }
      }
    }
  }, 50);
});

// Watch view or playback mode change to trigger scroll
watch([() => playerStore.activeView, () => playerStore.playbackMode], ([newView, newMode]) => {
  if (newView === "now-playing" && (newMode === "lyrics" || !playerStore.isVideo(playerStore.currentTrack?.path)) && playerStore.currentLyricsIndex !== -1) {
    setTimeout(() => {
      if (lyricsContainerRef.value) {
        const activeLine = lyricsContainerRef.value.querySelector(".lyric-line.active");
        if (activeLine) {
          activeLine.scrollIntoView({ behavior: "auto", block: "center" });
        }
      }
    }, 150);
  }
});

// Set up listeners
onMounted(async () => {
  window.addEventListener("mousemove", handleMouseMove);

  try {
    const webview = getCurrentWebview();
    const unlisten = await webview.onDragDropEvent((event) => {
      if (event.payload.type === "enter" || event.payload.type === "over") {
        isDraggingOver.value = true;
      } else if (event.payload.type === "drop") {
        isDraggingOver.value = false;
        playerStore.addFilesToQueue(event.payload.paths);
      } else if (event.payload.type === "leave") {
        isDraggingOver.value = false;
      }
    });
    unlistenDragDrop = () => {
      unlisten();
    };
  } catch (e) {
    console.error("Failed to setup drag and drop listener:", e);
  }
});

onUnmounted(() => {
  window.removeEventListener("mousemove", handleMouseMove);
  if (controlsTimer) clearTimeout(controlsTimer);
  if (unlistenDragDrop) {
    unlistenDragDrop();
  }
});
</script>

<template>
  <div class="player-main" :class="{ 'drag-over': isDraggingOver }">
    <!-- Drag & Drop overlay -->
    <div class="drag-overlay" v-if="isDraggingOver">
      <el-icon class="drag-icon"><FolderOpened /></el-icon>
      <div class="drag-text">
        {{ settingsStore.language === 'zh' ? '将音乐或视频拖拽至此处导入' : 'Drop music or video files here to import' }}
      </div>
      <div class="drag-sub">
        {{ settingsStore.language === 'zh' ? '支持常见格式: MP3, WAV, FLAC, MP4, WEBM, MKV' : 'Supports MP3, WAV, FLAC, MP4, WEBM, MKV' }}
      </div>
    </div>

    <!-- Now Playing View (Full Screen Page) -->
    <div 
      class="now-playing-page" 
      v-if="playerStore.activeView === 'now-playing'"
      @mousedown="handleSwipeStart"
      @mouseup="handleSwipeEnd"
      @touchstart="handleSwipeStart"
      @touchend="handleSwipeEnd"
    >
      <!-- Blurred Background (Only for Audio files or when in Lyrics Mode) -->
      <div 
        v-if="playerStore.currentTrack && (playerStore.playbackMode === 'lyrics' || !playerStore.isVideo(playerStore.currentTrack.path))"
        class="now-playing-bg"
        :style="{ backgroundImage: playerStore.currentTrack.cover ? `url(${playerStore.currentTrack.cover})` : '' }"
      ></div>

      <!-- Live Visualizer Canvas as Background (Only in Lyrics Mode) -->
      <div 
        v-if="showVisualizer && (playerStore.playbackMode === 'lyrics' || !playerStore.isVideo(playerStore.currentTrack?.path))"
        class="lyrics-visualizer-bg"
      >
        <Visualizer />
      </div>

      <!-- Content Container -->
      <div class="now-playing-content">
        <!-- Lyrics Mode / Widescreen lyrics panel -->
        <div 
          v-if="playerStore.playbackMode === 'lyrics' || !playerStore.isVideo(playerStore.currentTrack?.path)"
          class="fullscreen-lyrics-container"
        >
          <!-- Centered Scrolling Lyrics -->
          <div 
            ref="lyricsContainerRef" 
            class="lyrics-scroll-container full-width-lyrics"
          >
            <div v-if="playerStore.activeLyrics.length > 0" class="lyrics-list">
              <div 
                v-for="(line, idx) in playerStore.activeLyrics" 
                :key="idx" 
                class="lyric-line"
                :class="{ active: playerStore.currentLyricsIndex === idx }"
                @click="seekToLyric(line.time)"
              >
                {{ line.text }}
              </div>
            </div>
            <div v-else class="lyrics-empty">
              <el-icon class="empty-icon"><Microphone /></el-icon>
              <p>{{ settingsStore.t("noLyrics") }}</p>
              <p class="empty-hint">{{ settingsStore.t("lyricsHint") }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- 3. Floating Overlay Controls (Fade in/out on hover/mouse move) -->
      <div 
        class="now-playing-controls-overlay"
        :class="{ visible: showControlsOverlay }"
        @mouseenter="keepControlsVisible"
        @mouseleave="startControlsFadeTimer"
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
        <div class="controls-bottom-bar">
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

    <!-- Settings Panel View -->
    <div class="settings-view" v-else-if="playerStore.activeView === 'settings'">
      <PlayerSettings />
    </div>

    <!-- Standard Library List View -->
    <div class="list-view" v-else>
      <div class="list-header">
        <h1 class="view-title">
          <span v-if="playerStore.activeView === 'library'">{{ settingsStore.t("library") }}</span>
          <span v-else-if="playerStore.activeView === 'favorites'">{{ settingsStore.t("favorites") }}</span>
          <span v-else-if="playerStore.activeView === 'history'">{{ settingsStore.t("history") }}</span>
        </h1>
        
        <!-- Search bar -->
        <div class="search-bar" v-if="playerStore.queue.length > 0">
          <el-input
            v-model="searchQuery"
            :placeholder="settingsStore.t('searchPlaceholder')"
            :prefix-icon="Search"
            clearable
            class="custom-search"
          />
        </div>
      </div>

      <!-- Main Songs Table -->
      <div class="table-container" v-if="displayedTracks.length > 0">
        <el-table 
          :data="displayedTracks" 
          style="width: 100%"
          @row-dblclick="handleRowDblClick"
          row-class-name="song-row"
          class="mac-style-table"
        >
          <!-- Play indicator -->
          <el-table-column width="55" align="center">
            <template #default="scope">
              <button 
                v-if="playerStore.currentIndex >= 0 && playerStore.queue[playerStore.currentIndex]?.path === scope.row.path"
                class="play-indicator-btn active-song"
                @click="playerStore.togglePlay"
              >
                <span class="pulse-bar" :class="{ paused: !playerStore.isPlaying }"></span>
                <span class="pulse-bar bar-2" :class="{ paused: !playerStore.isPlaying }"></span>
                <span class="pulse-bar bar-3" :class="{ paused: !playerStore.isPlaying }"></span>
              </button>
              <button 
                v-else
                class="play-indicator-btn row-play-btn"
                @click="playTrackDirect(scope.row)"
                :title="settingsStore.t('playHint')"
              >
                <el-icon><CaretRight /></el-icon>
              </button>
            </template>
          </el-table-column>

          <!-- Song Title & Artist -->
          <el-table-column :label="settingsStore.t('title')" min-width="250">
            <template #default="scope">
              <div class="cell-song-meta">
                <img 
                  v-if="scope.row.cover" 
                  :src="scope.row.cover" 
                  alt="Cover" 
                  class="table-cover"
                />
                <div v-else class="table-cover-placeholder">
                  <el-icon><Headset /></el-icon>
                </div>
                <div class="meta-text">
                  <div 
                    class="song-title" 
                    :class="{ 'active-title': playerStore.currentIndex >= 0 && playerStore.queue[playerStore.currentIndex]?.path === scope.row.path }"
                  >
                    {{ scope.row.title }}
                  </div>
                  <div class="song-artist">
                    {{ scope.row.artist }}
                  </div>
                </div>
              </div>
            </template>
          </el-table-column>

          <!-- MV Column -->
          <el-table-column label="MV" width="80" align="center">
            <template #default="scope">
              <div 
                v-if="playerStore.isVideo(scope.row.path)"
                class="mv-badge clickable-mv-badge"
                @click.stop="playMVDirect(scope.row)"
                :title="settingsStore.language === 'zh' ? '点击播放 MV' : 'Play MV'"
              >
                <el-icon><VideoPlay /></el-icon>
                <span>MV</span>
              </div>
              <span v-else class="mv-placeholder">-</span>
            </template>
          </el-table-column>

          <!-- Duration -->
          <el-table-column :label="settingsStore.t('duration')" width="80" align="center">
            <template #default="scope">
              <span class="duration-text">{{ formatDuration(scope.row.duration) }}</span>
            </template>
          </el-table-column>

          <!-- Actions -->
          <el-table-column width="100" align="center">
            <template #default="scope">
              <div class="row-actions">
                <!-- Favorite -->
                <button 
                  class="icon-btn" 
                  @click.stop="playerStore.toggleFavorite(scope.row.path)"
                >
                  <el-icon v-if="scope.row.favorite" class="favorited"><StarFilled /></el-icon>
                  <el-icon v-else><Star /></el-icon>
                </button>
                
                <!-- Remove -->
                <button 
                  class="icon-btn remove-btn" 
                  @click.stop="removeTrackDirect(scope.row)"
                  :title="settingsStore.t('removeHint')"
                >
                  <el-icon><Delete /></el-icon>
                </button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- Empty state when no tracks exist -->
      <div class="empty-state" v-else>
        <el-icon class="empty-icon"><FolderOpened /></el-icon>
        <h2>{{ settingsStore.t("emptyStateTitle") }}</h2>
        <p>{{ settingsStore.t("emptyStateText") }}</p>
        <div class="import-hints">
          <span>{{ settingsStore.t("supportedFormats") }}:</span>
          <span class="format-tag">.mp3</span>
          <span class="format-tag">.wav</span>
          <span class="format-tag">.flac</span>
          <span class="format-tag">.mp4</span>
          <span class="format-tag">.mkv</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.player-main {
  flex-grow: 1;
  background-color: var(--bg-color);
  padding: 24px;
  overflow-y: auto;
  position: relative;
  height: 100%;
  transition: background-color 0.2s;
}

.player-main.drag-over {
  border: 2px dashed var(--primary-color);
  background-color: rgba(99, 102, 241, 0.04);
}

/* Drag overlay */
.drag-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(8, 8, 10, 0.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 100;
  pointer-events: none; /* Let events pass */
  border-radius: 8px;
}

.drag-icon {
  font-size: 64px;
  color: var(--primary-color);
  margin-bottom: 16px;
  animation: bounce 1.5s infinite;
}

.drag-text {
  font-size: 18px;
  font-weight: 600;
  color: #ffffff;
  margin-bottom: 8px;
}

.drag-sub {
  font-size: 13px;
  color: var(--text-secondary);
}

/* Header styling */
.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.view-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
}

.custom-search :deep(.el-input__wrapper) {
  background-color: var(--panel-bg) !important;
  box-shadow: none !important;
  border: 1px solid var(--border-color) !important;
  border-radius: 20px !important;
  transition: border-color 0.2s;
}

.custom-search :deep(.el-input__inner) {
  color: var(--text-primary) !important;
}

/* Table container styling - macOS borderless panel look */
.table-container {
  border-radius: 12px;
  background-color: var(--panel-bg);
  border: 1px solid var(--border-color);
  overflow: hidden;
  transition: background-color 0.2s, border-color 0.2s;
  padding: 8px;
}

/* Custom Element Plus Table Styling for macOS style */
.mac-style-table {
  --el-table-border-color: transparent !important;
  --el-table-header-bg-color: transparent !important;
  --el-table-row-hover-bg-color: var(--panel-bg-hover) !important;
  background-color: transparent !important;
}

.mac-style-table :deep(tr) {
  background-color: transparent !important;
}

.mac-style-table :deep(th.el-table__cell) {
  background-color: transparent !important;
  border-bottom: 1px solid var(--border-color) !important;
  color: var(--text-muted) !important;
  font-size: 11.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 10px 0 !important;
}

.mac-style-table :deep(td.el-table__cell) {
  border-bottom: 1px solid rgba(0, 0, 0, 0.02) !important;
  padding: 8px 0 !important;
}

.dark .mac-style-table :deep(td.el-table__cell) {
  border-bottom: 1px solid rgba(255, 255, 255, 0.03) !important;
}

.mac-style-table :deep(.song-row) {
  transition: background-color 0.25s ease, transform 0.15s ease;
  border-radius: 8px;
}

/* Play indicator animation */
.play-indicator-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  outline: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.row-play-btn {
  display: none;
}

.song-row:hover .row-play-btn {
  display: flex;
  color: var(--primary-color);
}

.song-row:hover .pulse-bar {
  display: none;
}

/* Active animated bars for playing status */
.active-song {
  display: flex;
  gap: 3px;
  align-items: flex-end;
  height: 14px;
  justify-content: center;
}

.pulse-bar {
  display: block;
  width: 3px;
  height: 100%;
  background-color: var(--primary-color);
  animation: bounceBar 1.2s ease-in-out infinite alternate;
}

.pulse-bar.bar-2 {
  animation-delay: 0.2s;
}

.pulse-bar.bar-3 {
  animation-delay: 0.4s;
}

.pulse-bar.paused {
  animation-play-state: paused;
  height: 4px;
}

.cell-song-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}

.table-cover {
  width: 38px;
  height: 38px;
  border-radius: 6px;
  object-fit: cover;
  border: 1px solid var(--border-color);
  flex-shrink: 0;
}

.table-cover-placeholder {
  width: 38px;
  height: 38px;
  border-radius: 6px;
  background-color: var(--slider-runnable-bg);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  flex-shrink: 0;
}

.meta-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.song-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
}

.song-title.active-title {
  color: var(--primary-color);
  text-shadow: 0 0 10px var(--active-glow);
}

.song-artist {
  font-size: 11.5px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
  margin-top: 2px;
}

/* Dedicated MV Column badge styling */
.mv-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 10px;
  font-weight: 800;
  color: var(--primary-color);
  background-color: rgba(99, 102, 241, 0.08);
  border: 1px solid rgba(99, 102, 241, 0.25);
  cursor: pointer;
  transition: all 0.25s ease;
  user-select: none;
  width: fit-content;
}

.dark .mv-badge {
  background-color: rgba(99, 102, 241, 0.15);
  border: 1px solid var(--primary-color);
}

.mv-badge:hover {
  background-color: var(--primary-color);
  border-color: var(--primary-color);
  color: #ffffff;
  box-shadow: 0 0 8px var(--primary-color);
}

.mv-badge .el-icon {
  font-size: 12px;
}

.mv-placeholder {
  color: var(--text-muted);
  font-size: 12px;
  opacity: 0.5;
}

.duration-text {
  font-size: 12px;
  color: var(--text-secondary);
  font-family: monospace;
}

.row-actions {
  display: flex;
  gap: 8px;
  justify-content: center;
  align-items: center;
}

.row-actions button.icon-btn {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.row-actions button.icon-btn:hover {
  background-color: rgba(0, 0, 0, 0.05);
  color: var(--text-primary);
}

.dark .row-actions button.icon-btn:hover {
  background-color: rgba(255, 255, 255, 0.08);
}

.favorited {
  color: #f59e0b;
}

.remove-btn:hover {
  color: #f43f5e !important;
}

/* Empty state */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 0;
  color: var(--text-secondary);
  text-align: center;
}

.empty-icon {
  font-size: 56px;
  color: var(--text-muted);
  margin-bottom: 18px;
}

.empty-state h2 {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.empty-state p {
  font-size: 13px;
  max-width: 380px;
  line-height: 1.5;
  margin-bottom: 20px;
}

.import-hints {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
}

.format-tag {
  background-color: var(--panel-bg);
  border: 1px solid var(--border-color);
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--text-secondary);
  font-family: monospace;
}

/* Lyrics view screen */
.lyrics-view {
  display: flex;
  height: 100%;
  gap: 24px;
}

.visual-panel {
  flex: 4;
  display: flex;
  flex-direction: column;
  gap: 24px;
  height: 100%;
  justify-content: space-between;
}

.lyrics-cover-wrapper {
  width: 220px;
  height: 220px;
  border-radius: 50%; /* Rotating Vinyl/CD look */
  overflow: hidden;
  border: 6px solid var(--border-color);
  flex-shrink: 0;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
  transition: border-color 0.2s;
}

.lyrics-cover-wrapper.spinning {
  animation: spin 16s linear infinite;
}

.lyrics-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.lyrics-cover-placeholder {
  width: 100%;
  height: 100%;
  background-color: var(--slider-runnable-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 64px;
}

/* Large video viewport for MV */
.large-mv-video-viewport {
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 12px;
  overflow: hidden;
  background-color: #000000;
  border: 1px solid var(--border-color);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
  transition: border-color 0.2s;
  flex-shrink: 0;
}

/* Audio cover wrapper section centering */
.audio-cover-section {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 12px 0;
  flex-grow: 1;
}

/* Track Metadata Card */
.lyrics-meta-card {
  background-color: var(--panel-bg);
  border: 1px solid var(--border-color);
  padding: 16px 20px;
  border-radius: 12px;
  transition: background-color 0.2s, border-color 0.2s;
  flex-shrink: 0;
}

.lyrics-meta-card.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 14px;
  padding: 24px;
}

.lyrics-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow: hidden;
}

.lyrics-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lyrics-artist {
  font-size: 14px;
  color: var(--primary-color);
  font-weight: 600;
}

.lyrics-album {
  font-size: 12px;
  color: var(--text-secondary);
}

.video-indicator, .table-video-indicator {
  font-size: 9px;
  font-weight: 800;
  color: var(--primary-color);
  background-color: rgba(99, 102, 241, 0.15);
  border: 1px solid var(--primary-color);
  padding: 1px 4px;
  border-radius: 3px;
  width: fit-content;
  margin-top: 4px;
}

.table-video-indicator {
  margin-top: 0;
  display: inline-block;
  vertical-align: middle;
}

.visualizer-wrapper {
  flex-grow: 1;
  min-height: 250px;
}

/* Lyrics panel scrolling */
.lyrics-panel {
  flex: 6;
  background-color: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  height: 100%;
  transition: background-color 0.2s, border-color 0.2s;
}

.lyrics-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 20px;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 12px;
}

.close-lyrics {
  color: var(--primary-color);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  background: none;
  border: none;
  cursor: pointer;
}

.lyrics-scroll-container {
  flex-grow: 1;
  overflow-y: auto;
  padding: 20px 0;
  mask-image: linear-gradient(to bottom, transparent 0%, white 15%, white 85%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, white 15%, white 85%, transparent 100%);
}

.lyrics-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 120px 0; /* Add padding to top and bottom to center lyrics */
}

.lyric-line {
  font-size: 16px;
  font-weight: 500;
  color: var(--text-muted);
  text-align: center;
  transition: all 0.3s ease;
  line-height: 1.5;
  cursor: pointer;
}

.lyric-line.active {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  text-shadow: 0 0 16px var(--primary-color), 0 0 4px rgba(255, 255, 255, 0.5);
}

.lyrics-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-secondary);
  text-align: center;
  padding: 24px;
}

.lyrics-empty .empty-icon {
  font-size: 40px;
  color: var(--text-muted);
  margin-bottom: 12px;
}

.lyrics-empty p {
  font-size: 13px;
  margin-bottom: 8px;
}

.empty-hint {
  font-size: 11px !important;
  color: var(--text-muted) !important;
  max-width: 280px;
  line-height: 1.4;
}

/* Animations */
@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

@keyframes bounceBar {
  0% { height: 20%; }
  100% { height: 100%; }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Blurred cover background */
.now-playing-bg {
  position: absolute;
  top: -24px;
  left: -24px;
  right: -24px;
  bottom: -24px;
  background-size: cover;
  background-position: center;
  filter: blur(60px) brightness(0.25);
  opacity: 0.5;
  z-index: 0;
  pointer-events: none;
  transition: background-image 0.6s ease;
}

/* Ensure child panels render above the background */
.visual-panel, .lyrics-panel {
  position: relative;
  z-index: 2;
}

/* MV Viewport Wrapper & Overlay */
.video-viewport-wrapper {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
  transition: border-color 0.2s;
  flex-shrink: 0;
}

.video-viewport-wrapper:hover .video-overlay-controls {
  opacity: 1;
}

.video-overlay-controls {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.55) 0%, transparent 40%, transparent 60%, rgba(0, 0, 0, 0.4) 100%);
  display: flex;
  justify-content: flex-end;
  align-items: flex-end;
  padding: 14px;
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.fullscreen-overlay-btn {
  background: rgba(8, 8, 10, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #ffffff;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  pointer-events: auto;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.fullscreen-overlay-btn:hover {
  background: var(--primary-color);
  transform: scale(1.15);
  box-shadow: 0 0 12px var(--primary-color);
}

/* Full page Now Playing view */
.now-playing-page {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #08080a;
  z-index: 500;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  user-select: none;
}

.now-playing-content {
  flex-grow: 1;
  width: 100%;
  height: 100%;
  position: relative;
  z-index: 1;
}

/* Fullscreen MV mode */
.fullscreen-mv-container {
  width: 100%;
  height: 100%;
  background-color: #000000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.fullscreen-video-element {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Fullscreen Lyrics Mode Layout */
.fullscreen-lyrics-container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 80px 40px 120px 40px;
  box-sizing: border-box;
}

.full-width-lyrics {
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
  height: 85%;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
}

/* Spectrum Canvas beating under lyrics */
.lyrics-visualizer-bg {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 320px;
  width: 100%;
  opacity: 0.35;
  z-index: 0;
  pointer-events: none;
}

/* Immersive controls overlay */
.now-playing-controls-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10;
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
  padding: 32px 40px;
  background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 60%, transparent 100%);
  display: flex;
  flex-direction: column;
  gap: 16px;
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
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: var(--primary-gradient);
  border: none;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
}

.overlay-play-pause-btn:hover {
  transform: scale(1.08);
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.6);
}

.volume-control-right {
  width: 25%;
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: flex-end;
}

.overlay-volume-slider {
  width: 100px;
}

/* Clickable MV tag in library list */
.clickable-mv-tag {
  cursor: pointer;
  transition: all 0.25s ease;
}

.clickable-mv-tag:hover {
  background-color: var(--primary-color) !important;
  color: #ffffff !important;
  box-shadow: 0 0 8px var(--primary-color);
}
</style>

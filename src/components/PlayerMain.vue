<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { usePlayerStore, Track } from "../stores/playerStore";
import { useSettingsStore } from "../stores/settingsStore";
import { AudioService } from "../services/audioService";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { 
  Search, 
  CaretRight, 
  Delete, 
  Star, 
  StarFilled,
  FolderOpened,
  Headset,
  Microphone
} from "@element-plus/icons-vue";
import Visualizer from "./Visualizer.vue";
import PlayerSettings from "./PlayerSettings.vue";

const props = defineProps<{
  activeView: string;
  showVisualizer: boolean;
}>();

const emit = defineEmits<{
  (e: "change-view", view: string): void;
}>();

const playerStore = usePlayerStore();
const settingsStore = useSettingsStore();
const audioService = AudioService.getInstance();

const searchQuery = ref("");
const lyricsContainerRef = ref<HTMLElement | null>(null);
const videoContainerRef = ref<HTMLElement | null>(null);
const isDraggingOver = ref(false);
let unlistenDragDrop: (() => void) | null = null;

// Format duration
const formatDuration = (seconds: number) => {
  if (isNaN(seconds) || seconds === Infinity || !seconds) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
};

// Check if a path corresponds to a video file
const isVideo = (path: string | undefined): boolean => {
  if (!path) return false;
  const ext = path.split('.').pop()?.toLowerCase();
  return ["mp4", "webm", "mkv", "avi"].includes(ext || "");
};

// Compute filtered tracks based on active view and search query
const displayedTracks = computed(() => {
  let list: Track[] = [];
  if (props.activeView === "library") {
    list = playerStore.queue;
  } else if (props.activeView === "favorites") {
    list = playerStore.queue.filter(t => t.favorite);
  } else if (props.activeView === "history") {
    // Resolve full track details for recently played list
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
  if (props.activeView !== "lyrics" || newIndex === -1) return;
  
  setTimeout(() => {
    if (lyricsContainerRef.value) {
      const activeLine = lyricsContainerRef.value.querySelector(".lyric-line.active");
      if (activeLine) {
        activeLine.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    }
  }, 50);
});

// Watch view change to trigger scroll
watch(() => props.activeView, (newView) => {
  if (newView === "lyrics" && playerStore.currentLyricsIndex !== -1) {
    setTimeout(() => {
      if (lyricsContainerRef.value) {
        const activeLine = lyricsContainerRef.value.querySelector(".lyric-line.active");
        if (activeLine) {
          activeLine.scrollIntoView({ behavior: "auto", block: "center" });
        }
      }
    }, 100);
  }
});

// Capture a video screenshot frame to use as cover art
const captureVideoFrame = () => {
  const video = audioService.getMediaElement();
  if (video.readyState < 2) return; // Ensure video frame is decodable
  
  if (playerStore.currentTrack && !playerStore.currentTrack.cover) {
    try {
      const canvas = document.createElement("canvas");
      // Scale down image resolution for optimized storage in localStorage
      const scale = Math.min(1, 320 / video.videoWidth);
      canvas.width = video.videoWidth * scale;
      canvas.height = video.videoHeight * scale;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        
        // Save dynamically captured screenshot as track cover art
        playerStore.currentTrack.cover = dataUrl;
        playerStore.saveQueueToStorage();
      }
    } catch (e) {
      console.warn("Failed to generate MV thumbnail screenshot:", e);
    }
  }
};

// Detach the video element from DOM to play background audio safely
const detachVideo = () => {
  const video = audioService.getMediaElement();
  video.removeEventListener("loadeddata", captureVideoFrame);
  if (video.parentNode) {
    video.parentNode.removeChild(video);
  }
  video.style.display = "none";
};

// Mount the video node inside our MV viewport container
const mountVideoElement = () => {
  if (playerStore.currentTrack && isVideo(playerStore.currentTrack.path)) {
    setTimeout(() => {
      if (videoContainerRef.value) {
        const video = audioService.getMediaElement();
        videoContainerRef.value.appendChild(video);
        video.style.display = "block";
        video.style.width = "100%";
        video.style.height = "100%";
        video.style.objectFit = "contain";
        video.controls = false;
        
        // Grab thumbnail when loaded
        video.addEventListener("loadeddata", captureVideoFrame);
      }
    }, 100);
  } else {
    detachVideo();
  }
};

// Monitor track changes and active views to toggle MV video viewport mounting
watch([() => playerStore.currentTrack, () => props.activeView], () => {
  if (props.activeView === "lyrics") {
    mountVideoElement();
  } else {
    detachVideo();
  }
}, { immediate: true });

// Set up native Tauri file drag drop listener
onMounted(async () => {
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
  detachVideo();
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

    <!-- Lyrics / Visualizer View -->
    <div class="lyrics-view" v-if="activeView === 'lyrics'">
      <!-- Left side: Cover & Spectrum Visualizer -->
      <div class="visual-panel">
        <div class="lyrics-track-info" v-if="playerStore.currentTrack">
          <!-- Dynamic MV Viewport (Only rendered when video is loaded) -->
          <div 
            v-show="isVideo(playerStore.currentTrack.path)"
            ref="videoContainerRef"
            class="lyrics-video-viewport"
          ></div>

          <!-- Album Art Cover Wrapper (Rendered when it is a normal audio track) -->
          <div 
            v-show="!isVideo(playerStore.currentTrack.path)"
            class="lyrics-cover-wrapper" 
            :class="{ spinning: playerStore.isPlaying }"
          >
            <img 
              v-if="playerStore.currentTrack.cover" 
              :src="playerStore.currentTrack.cover" 
              alt="Cover" 
              class="lyrics-cover"
            />
            <div v-else class="lyrics-cover-placeholder">
              <el-icon><Headset /></el-icon>
            </div>
          </div>
          <div class="lyrics-meta">
            <h2 class="lyrics-title">{{ playerStore.currentTrack.title }}</h2>
            <p class="lyrics-artist">{{ playerStore.currentTrack.artist }}</p>
            <p class="lyrics-album" v-if="playerStore.currentTrack.album">{{ playerStore.currentTrack.album }}</p>
            <span class="video-indicator" v-if="isVideo(playerStore.currentTrack.path)">MV</span>
          </div>
        </div>
        
        <!-- Live Visualizer Canvas inside Lyrics -->
        <div class="visualizer-wrapper">
          <Visualizer />
        </div>
      </div>

      <!-- Right side: Synced Scrolling Lyrics -->
      <div class="lyrics-panel">
        <div class="lyrics-header">
          <span>{{ settingsStore.t("lyricsReader") }}</span>
          <button class="icon-btn close-lyrics" @click="emit('change-view', 'library')">
            {{ settingsStore.t("closeLyrics") }}
          </button>
        </div>
        <div 
          ref="lyricsContainerRef" 
          class="lyrics-scroll-container"
        >
          <div v-if="playerStore.activeLyrics.length > 0" class="lyrics-list">
            <div 
              v-for="(line, idx) in playerStore.activeLyrics" 
              :key="idx" 
              class="lyric-line"
              :class="{ active: playerStore.currentLyricsIndex === idx }"
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

    <!-- Settings Panel View -->
    <div class="settings-view" v-else-if="activeView === 'settings'">
      <PlayerSettings @change-view="emit('change-view', $event)" />
    </div>

    <!-- Standard Library List View -->
    <div class="list-view" v-else>
      <div class="list-header">
        <h1 class="view-title">
          <span v-if="activeView === 'library'">{{ settingsStore.t("library") }}</span>
          <span v-else-if="activeView === 'favorites'">{{ settingsStore.t("favorites") }}</span>
          <span v-else-if="activeView === 'history'">{{ settingsStore.t("history") }}</span>
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
          <el-table-column :label="settingsStore.t('title')">
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
                    <span class="table-video-indicator" v-if="isVideo(scope.row.path)">MV</span>
                  </div>
                </div>
              </div>
            </template>
          </el-table-column>

          <!-- Album Name -->
          <el-table-column prop="album" :label="settingsStore.t('album')" min-width="120" />

          <!-- Duration -->
          <el-table-column :label="settingsStore.t('duration')" width="100" align="center">
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

/* Table container styling */
.table-container {
  border-radius: 12px;
  background-color: var(--panel-bg);
  border: 1px solid var(--border-color);
  overflow: hidden;
  transition: background-color 0.2s, border-color 0.2s;
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
}

.table-cover {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  object-fit: cover;
  border: 1px solid var(--border-color);
}

.table-cover-placeholder {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  background-color: var(--slider-runnable-bg);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.meta-text {
  display: flex;
  flex-direction: column;
}

.song-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.song-title.active-title {
  color: var(--primary-color);
  text-shadow: 0 0 10px var(--active-glow);
}

.song-artist {
  font-size: 11px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
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
}

.favorited {
  color: #f59e0b;
}

.remove-btn:hover {
  color: #f43f5e;
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

.lyrics-track-info {
  display: flex;
  gap: 20px;
  align-items: center;
  background-color: var(--panel-bg);
  border: 1px solid var(--border-color);
  padding: 20px;
  border-radius: 12px;
  transition: background-color 0.2s, border-color 0.2s;
}

.lyrics-cover-wrapper {
  width: 100px;
  height: 100px;
  border-radius: 50%; /* Rotating Vinyl/CD look */
  overflow: hidden;
  border: 4px solid var(--border-color);
  flex-shrink: 0;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2);
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
  font-size: 36px;
}

/* Large video viewport for MV */
.lyrics-video-viewport {
  width: 180px;
  height: 110px;
  border-radius: 8px;
  overflow: hidden;
  background-color: #000000;
  border: 2px solid var(--border-color);
  flex-shrink: 0;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
  transition: border-color 0.2s;
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
</style>

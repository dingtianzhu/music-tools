import { defineStore } from "pinia";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { emit } from "@tauri-apps/api/event";
import { AudioService } from "../services/audioService";
import { parseLrc, LyricLine } from "../utils/lrcParser";

const audioService = AudioService.getInstance();

export interface Track {
  path: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  cover: string | null;
  favorite: boolean;
}

export const usePlayerStore = defineStore("player", {
  state: () => ({
    queue: [] as Track[],
    currentIndex: -1,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: parseFloat(localStorage.getItem("volume") || "0.5"),
    loopMode: (localStorage.getItem("loopMode") || "list") as "list" | "single" | "shuffle",
    favorites: JSON.parse(localStorage.getItem("favorites") || "[]") as string[],
    history: JSON.parse(localStorage.getItem("history") || "[]") as string[],
    activeLyrics: [] as LyricLine[],
    currentLyricsIndex: -1,
    isInitialized: false,
    activeView: "library", // Global routing view state
    previousView: "library",
    playbackMode: "mv" as "mv" | "lyrics",
  }),

  getters: {
    currentTrack(): Track | null {
      if (this.currentIndex >= 0 && this.currentIndex < this.queue.length) {
        return this.queue[this.currentIndex];
      }
      return null;
    },
  },

  actions: {
    init() {
      if (this.isInitialized) return;

      // Track previous view state
      this.$subscribe((_mutation, state) => {
        if (state.activeView !== "now-playing") {
          state.previousView = state.activeView;
        }
      });

      // Set initial volume
      audioService.setVolume(this.volume);

      // Listen to audio engine events
      audioService.onTimeUpdate((time) => {
        this.currentTime = time;
        this.updateLyricsIndex();
      });

      audioService.onDurationChange((dur) => {
        this.duration = dur;
        // Update duration in active track if it was 0 or incorrect
        if (this.currentTrack && (this.currentTrack.duration === 0 || !this.currentTrack.duration)) {
          this.currentTrack.duration = dur;
        }
      });

      audioService.onEnded(() => {
        this.handleTrackEnded();
      });

      // Load queue from localStorage if saved
      const savedQueue = localStorage.getItem("queue");
      if (savedQueue) {
        try {
          this.queue = JSON.parse(savedQueue);
          // Set favorites status properly
          this.queue.forEach(track => {
            track.favorite = this.favorites.includes(track.path);
          });
        } catch (e) {
          console.error("Failed to parse saved queue", e);
        }
      }

      const savedIndex = parseInt(localStorage.getItem("currentIndex") || "-1", 10);
      if (savedIndex >= 0 && savedIndex < this.queue.length) {
        this.currentIndex = savedIndex;
        // Pre-load track without playing
        const track = this.queue[this.currentIndex];
        this.playbackMode = this.isVideo(track.path) ? "mv" : "lyrics";
        const assetUrl = convertFileSrc(track.path);
        audioService.load(assetUrl);
        this.loadLyrics(track.path);
      }

      this.isInitialized = true;
    },

    saveQueueToStorage() {
      localStorage.setItem("queue", JSON.stringify(this.queue));
    },

    saveCurrentIndexToStorage() {
      localStorage.setItem("currentIndex", this.currentIndex.toString());
    },

    async playTrack(index: number) {
      if (index < 0 || index >= this.queue.length) return;

      this.currentIndex = index;
      this.saveCurrentIndexToStorage();
      const track = this.queue[index];

      // Add to history
      this.addToHistory(track.path);

      // Automatically redirect to the Now Playing page when a track starts playing
      this.activeView = "now-playing";
      this.playbackMode = this.isVideo(track.path) ? "mv" : "lyrics";

      try {
        const assetUrl = convertFileSrc(track.path);
        audioService.load(assetUrl);
        await audioService.play();
        this.isPlaying = true;
        this.currentTime = 0;
        this.duration = track.duration;

        // Load lyrics
        await this.loadLyrics(track.path);
      } catch (e) {
        console.error("Error playing track", e);
        this.isPlaying = false;
      }
    },

    async togglePlay() {
      if (this.queue.length === 0) return;

      if (this.currentIndex === -1) {
        await this.playTrack(0);
        return;
      }

      if (this.isPlaying) {
        audioService.pause();
        this.isPlaying = false;
      } else {
        try {
          await audioService.play();
          this.isPlaying = true;
        } catch (e) {
          console.error("Playback failed to resume", e);
        }
      }
    },

    next() {
      if (this.queue.length === 0) return;

      if (this.loopMode === "shuffle") {
        const randomIndex = Math.floor(Math.random() * this.queue.length);
        this.playTrack(randomIndex);
      } else {
        const nextIndex = (this.currentIndex + 1) % this.queue.length;
        this.playTrack(nextIndex);
      }
    },

    prev() {
      if (this.queue.length === 0) return;

      if (this.loopMode === "shuffle") {
        const randomIndex = Math.floor(Math.random() * this.queue.length);
        this.playTrack(randomIndex);
      } else {
        const prevIndex = (this.currentIndex - 1 + this.queue.length) % this.queue.length;
        this.playTrack(prevIndex);
      }
    },

    handleTrackEnded() {
      if (this.loopMode === "single") {
        // Replay current
        this.playTrack(this.currentIndex);
      } else {
        // Next song
        this.next();
      }
    },

    seek(time: number) {
      audioService.seek(time);
      this.currentTime = time;
    },

    setVolume(vol: number) {
      this.volume = vol;
      audioService.setVolume(vol);
      localStorage.setItem("volume", vol.toString());
    },

    setLoopMode(mode: "list" | "single" | "shuffle") {
      this.loopMode = mode;
      localStorage.setItem("loopMode", mode);
    },

    toggleFavorite(path: string) {
      const index = this.favorites.indexOf(path);
      if (index > -1) {
        this.favorites.splice(index, 1);
      } else {
        this.favorites.push(path);
      }
      localStorage.setItem("favorites", JSON.stringify(this.favorites));

      // Update in queue
      const track = this.queue.find(t => t.path === path);
      if (track) {
        track.favorite = !track.favorite;
        this.saveQueueToStorage();
      }
    },

    addToHistory(path: string) {
      // Remove if exists to push to front
      const idx = this.history.indexOf(path);
      if (idx > -1) {
        this.history.splice(idx, 1);
      }
      this.history.unshift(path);
      // Keep history max 50
      if (this.history.length > 50) {
        this.history.pop();
      }
      localStorage.setItem("history", JSON.stringify(this.history));
    },

    clearQueue() {
      this.queue = [];
      this.currentIndex = -1;
      this.isPlaying = false;
      this.currentTime = 0;
      this.duration = 0;
      this.activeLyrics = [];
      this.currentLyricsIndex = -1;
      audioService.pause();
      this.saveQueueToStorage();
      this.saveCurrentIndexToStorage();
      emit("update-lyric", "");
    },

    removeTrack(index: number) {
      if (index < 0 || index >= this.queue.length) return;

      const isCurrent = index === this.currentIndex;
      this.queue.splice(index, 1);

      if (this.queue.length === 0) {
        this.clearQueue();
        return;
      }

      if (isCurrent) {
        // Play next or stay
        const newIndex = index >= this.queue.length ? 0 : index;
        this.playTrack(newIndex);
      } else if (index < this.currentIndex) {
        this.currentIndex--;
        this.saveCurrentIndexToStorage();
      }

      this.saveQueueToStorage();
    },

    // File selection methods
    async importFiles() {
      try {
        const selected = await open({
          multiple: true,
          filters: [{ name: "Media Files", extensions: ["mp3", "wav", "flac", "mp4", "webm", "mkv"] }]
        });

        if (selected) {
          const paths = Array.isArray(selected) ? selected : [selected];
          await this.addFilesToQueue(paths);
        }
      } catch (e) {
        console.error("Failed to select files:", e);
      }
    },

    async importFolder() {
      try {
        const selected = await open({
          directory: true,
          multiple: false
        });

        if (selected && typeof selected === "string") {
          // Call rust scan_directory
          const metadataList = await invoke<any[]>("scan_directory", { path: selected });
          if (metadataList && metadataList.length > 0) {
            const tracks: Track[] = metadataList.map(meta => ({
              path: meta.path,
              title: meta.title || "Unknown Title",
              artist: meta.artist || "Unknown Artist",
              album: meta.album || "Unknown Album",
              duration: meta.duration || 0,
              cover: meta.cover || null,
              favorite: this.favorites.includes(meta.path),
            }));

            // Filter out tracks already in the queue to avoid duplicates
            const existingPaths = new Set(this.queue.map(t => t.path));
            const newTracks = tracks.filter(t => !existingPaths.has(t.path));

            if (newTracks.length > 0) {
              this.queue.push(...newTracks);
              this.saveQueueToStorage();
            }
          }
        }
      } catch (e) {
        console.error("Failed to import folder:", e);
      }
    },

    async addFilesToQueue(paths: string[]) {
      if (paths.length === 0) return;

      // Filter out files already in queue
      const existingPaths = new Set(this.queue.map(t => t.path));
      const filteredPaths = paths.filter(p => !existingPaths.has(p));

      if (filteredPaths.length === 0) return;

      try {
        // Call Rust to parse metadata for these new paths
        const metadataList = await invoke<any[]>("get_audio_metadata_list", { paths: filteredPaths });
        if (metadataList && metadataList.length > 0) {
          const tracks: Track[] = metadataList.map(meta => ({
            path: meta.path,
            title: meta.title || "Unknown Title",
            artist: meta.artist || "Unknown Artist",
            album: meta.album || "Unknown Album",
            duration: meta.duration || 0,
            cover: meta.cover || null,
            favorite: this.favorites.includes(meta.path),
          }));

          this.queue.push(...tracks);
          this.saveQueueToStorage();
        }
      } catch (e) {
        console.error("Error reading file metadata:", e);
      }
    },

    // Lyrics loader helper using Rust command
    async loadLyrics(filePath: string) {
      this.activeLyrics = [];
      this.currentLyricsIndex = -1;

      try {
        const text = await invoke<string | null>("read_lyrics", { path: filePath });
        if (text) {
          this.activeLyrics = parseLrc(text);
        }
      } catch (e) {
        console.warn("Could not read lyrics file via Rust for path:", filePath, e);
      }

      // If no lyrics found, broadcast the track details to the desktop overlay
      if (this.activeLyrics.length === 0) {
        const titleText = this.currentTrack ? `${this.currentTrack.title} - ${this.currentTrack.artist}` : "";
        emit("update-lyric", titleText);
      }
    },

    updateLyricsIndex() {
      if (this.activeLyrics.length === 0) {
        const titleText = this.currentTrack ? `${this.currentTrack.title} - ${this.currentTrack.artist}` : "";
        emit("update-lyric", titleText);
        return;
      }

      let activeIndex = -1;
      const time = this.currentTime;

      for (let i = 0; i < this.activeLyrics.length; i++) {
        if (time >= this.activeLyrics[i].time) {
          activeIndex = i;
        } else {
          break;
        }
      }

      if (this.currentLyricsIndex !== activeIndex) {
        this.currentLyricsIndex = activeIndex;
        const text = activeIndex !== -1 ? this.activeLyrics[activeIndex].text : "";
        emit("update-lyric", text);
      }
    },

    // Helper to check if a track path corresponds to a video file
    isVideo(path: string | undefined): boolean {
      if (!path) return false;
      const ext = path.split('.').pop()?.toLowerCase();
      return ["mp4", "webm", "mkv", "avi"].includes(ext || "");
    }
  },
});

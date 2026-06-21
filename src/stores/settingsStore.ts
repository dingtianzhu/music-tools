import { defineStore } from "pinia";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export type Language = "zh" | "en";
export type ThemeMode = "light" | "dark";
export type ThemeColor = "indigo" | "green" | "red" | "blue" | "orange" | "pink";

const translations: Record<Language, Record<string, string>> = {
  zh: {
    library: "全部音轨",
    favorites: "我的收藏",
    history: "最近播放",
    nowPlaying: "正在播放",
    importFiles: "导入文件",
    importFolder: "导入文件夹",
    clearLibrary: "清空曲库",
    settings: "应用设置",
    language: "界面语言",
    themeMode: "主题模式",
    themeColor: "主题色",
    light: "亮色模式",
    dark: "暗色模式",
    searchPlaceholder: "搜索歌曲、歌手或专辑...",
    noTrack: "暂无播放曲目",
    emptyStateTitle: "曲库空空如也",
    emptyStateText: "拖拽音频文件到此处，或点击侧边栏按钮导入文件或文件夹。",
    supportedFormats: "支持格式",
    lyricsReader: "歌词面板",
    noLyrics: "未找到本地歌词 (.lrc)",
    lyricsHint: "将同名且以 .lrc 结尾的歌词文件放在音乐文件旁即可自动同步加载。",
    closeLyrics: "返回列表",
    save: "保存",
    cancel: "取消",
    volume: "音量",
    appVersion: "版本",
    engineActive: "音频引擎已激活",
    playlistEmpty: "列表为空",
    lyricsTitle: "歌词播放器",
    themeIndigo: "经典靛蓝 (Indigo)",
    themeGreen: "经典暗绿 (Spotify Green)",
    themeRed: "苹果红 (Apple Red)",
    themeBlue: "深海蓝 (Deep Sea Blue)",
    themeOrange: "日落橘 (Sunset Orange)",
    themePink: "樱花粉 (Sakura Pink)",
    back: "返回",
    title: "标题",
    album: "专辑",
    duration: "时长",
    removeHint: "从列表移除",
    playHint: "播放",
    noLyricsFound: "暂无歌词",
    desktopLyrics: "桌面歌词",
    mvPlayer: "MV 播放器"
  },
  en: {
    library: "All Tracks",
    favorites: "Favorites",
    history: "Recently Played",
    nowPlaying: "Now Playing",
    importFiles: "Import Files",
    importFolder: "Import Folder",
    clearLibrary: "Clear Library",
    settings: "Settings",
    language: "Language",
    themeMode: "Theme Mode",
    themeColor: "Theme Color",
    light: "Light Mode",
    dark: "Dark Mode",
    searchPlaceholder: "Search title, artist...",
    noTrack: "No Track Playing",
    emptyStateTitle: "No tracks available",
    emptyStateText: "Drag and drop local audio files here, or use the sidebar buttons to import files/folders.",
    supportedFormats: "Supported Formats",
    lyricsReader: "Lyrics Reader",
    noLyrics: "No lyrics found (.lrc)",
    lyricsHint: "Place a .lrc file next to your music file with the exact same name to load lyrics automatically.",
    closeLyrics: "Back to List",
    save: "Save",
    cancel: "Cancel",
    volume: "Volume",
    appVersion: "Version",
    engineActive: "Web Audio API Active",
    playlistEmpty: "Playlist is empty",
    lyricsTitle: "Lyrics Panel",
    themeIndigo: "Classic Indigo (Indigo)",
    themeGreen: "Spotify Green (Spotify Green)",
    themeRed: "Apple Red (Apple Red)",
    themeBlue: "Deep Sea Blue (Deep Sea Blue)",
    themeOrange: "Sunset Orange (Sunset Orange)",
    themePink: "Sakura Pink (Sakura Pink)",
    back: "Back",
    title: "Title",
    album: "Album",
    duration: "Duration",
    removeHint: "Remove from list",
    playHint: "Play",
    noLyricsFound: "No lyrics",
    desktopLyrics: "Desktop Lyrics",
    mvPlayer: "MV Player"
  }
};

export const useSettingsStore = defineStore("settings", {
  state: () => ({
    language: (localStorage.getItem("lang") || "zh") as Language,
    themeMode: (localStorage.getItem("themeMode") || "light") as ThemeMode,
    themeColor: (localStorage.getItem("themeColor") || "indigo") as ThemeColor,
    showDesktopLyrics: localStorage.getItem("showDesktopLyrics") === "true",
  }),

  actions: {
    setLanguage(lang: Language) {
      this.language = lang;
      localStorage.setItem("lang", lang);
    },

    setThemeMode(mode: ThemeMode) {
      this.themeMode = mode;
      localStorage.setItem("themeMode", mode);
      this.applyThemeToDOM();
    },

    setThemeColor(color: ThemeColor) {
      this.themeColor = color;
      localStorage.setItem("themeColor", color);
      this.applyThemeToDOM();
    },

    async setDesktopLyrics(show: boolean) {
      this.showDesktopLyrics = show;
      localStorage.setItem("showDesktopLyrics", show.toString());

      try {
        const win = await WebviewWindow.getByLabel("lyrics");
        if (win) {
          if (show) {
            await win.show();
            await win.setAlwaysOnTop(true);
          } else {
            await win.hide();
          }
        }
      } catch (e) {
        console.error("Failed to show/hide lyrics window:", e);
      }
    },

    applyThemeToDOM() {
      const root = document.documentElement;
      root.setAttribute("data-theme", this.themeMode);
      root.setAttribute("data-color", this.themeColor);
    },

    // Translation helper
    t(key: string): string {
      const dict = translations[this.language];
      return dict[key] || key;
    }
  }
});

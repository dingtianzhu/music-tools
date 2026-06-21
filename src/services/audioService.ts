export class AudioService {
  private static instance: AudioService;
  private audio: HTMLVideoElement;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private isInitialized = false;

  private onTimeUpdateCallback: ((time: number) => void) | null = null;
  private onEndedCallback: (() => void) | null = null;
  private onDurationChangeCallback: ((duration: number) => void) | null = null;

  private constructor() {
    // Using a video element instead of an audio element enables MV playback support,
    // while maintaining identical HTMLMediaElement functionality for music-only tracks.
    this.audio = document.createElement("video");
    this.audio.crossOrigin = "anonymous";

    // Bind event listeners
    this.audio.addEventListener("timeupdate", () => {
      if (this.onTimeUpdateCallback) {
        this.onTimeUpdateCallback(this.audio.currentTime);
      }
    });

    this.audio.addEventListener("ended", () => {
      if (this.onEndedCallback) {
        this.onEndedCallback();
      }
    });

    this.audio.addEventListener("durationchange", () => {
      if (this.onDurationChangeCallback) {
        this.onDurationChangeCallback(this.audio.duration);
      }
    });
  }

  public static getInstance(): AudioService {
    if (!AudioService.instance) {
      AudioService.instance = new AudioService();
    }
    return AudioService.instance;
  }

  /**
   * Initializes the Web Audio API components. Must be called after a user gesture.
   */
  public initAudioContext(): void {
    if (this.isInitialized) return;

    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtxClass();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256; // 128 data points

      // Connect the HTMLVideoElement to the Web Audio graph
      this.sourceNode = this.audioContext.createMediaElementSource(this.audio);
      this.sourceNode.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);

      this.isInitialized = true;
      console.log("AudioContext and AnalyserNode successfully initialized.");
    } catch (e) {
      console.error("Failed to initialize Web Audio API:", e);
    }
  }

  public load(url: string): void {
    this.audio.src = url;
    this.audio.load();
  }

  public async play(): Promise<void> {
    this.initAudioContext();
    if (this.audioContext && this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
    return this.audio.play();
  }

  public pause(): void {
    this.audio.pause();
  }

  public seek(time: number): void {
    this.audio.currentTime = time;
  }

  public setVolume(volume: number): void {
    this.audio.volume = Math.max(0, Math.min(1, volume));
  }

  public getByteFrequencyData(): Uint8Array {
    if (!this.analyser) {
      return new Uint8Array(0);
    }
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteFrequencyData(dataArray);
    return dataArray;
  }

  public getMediaElement(): HTMLVideoElement {
    return this.audio;
  }

  // Event bindings
  public onTimeUpdate(callback: (time: number) => void): void {
    this.onTimeUpdateCallback = callback;
  }

  public onEnded(callback: () => void): void {
    this.onEndedCallback = callback;
  }

  public onDurationChange(callback: (duration: number) => void): void {
    this.onDurationChangeCallback = callback;
  }

  public get duration(): number {
    return this.audio.duration || 0;
  }

  public get currentTime(): number {
    return this.audio.currentTime || 0;
  }
}

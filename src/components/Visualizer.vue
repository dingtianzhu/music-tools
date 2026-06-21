<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { AudioService } from "../services/audioService";
import { usePlayerStore } from "../stores/playerStore";

const canvasRef = ref<HTMLCanvasElement | null>(null);
const audioService = AudioService.getInstance();
const playerStore = usePlayerStore();
let animationFrameId = 0;

// Peak trackers for falling-dot effect
const peaks: number[] = [];
const peakHoldTimes: number[] = [];
const DECAY_RATE = 1.5;
const HOLD_FRAMES = 30;

const draw = () => {
  animationFrameId = requestAnimationFrame(draw);
  
  const canvas = canvasRef.value;
  if (!canvas) return;
  
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  
  // Dynamic resize check
  if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
  }

  const width = canvas.width;
  const height = canvas.height;
  
  // Clear canvas with a very soft semi-transparent black to create a motion-blur trail
  ctx.fillStyle = "rgba(8, 8, 10, 0.25)";
  ctx.fillRect(0, 0, width, height);

  // If no music is playing, generate some idle wave simulation
  const data = audioService.getByteFrequencyData();
  const bufferLength = data.length;
  const bars = Math.min(64, bufferLength); // Limit bars for cleaner look

  if (bufferLength === 0) {
    // Draw horizontal line when idle
    ctx.strokeStyle = "rgba(99, 102, 241, 0.2)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    return;
  }

  // Draw visualizer
  const barGap = 4;
  const barWidth = (width / (bars * 2)) - barGap; // Mirror layout width calculations
  const center = width / 2;

  for (let i = 0; i < bars; i++) {
    // Scale value based on frequency index (boost treble/mids display since bass naturally dominates)
    const factor = 0.5 + (i / bars) * 0.8;
    let val = data[i] * factor;

    // Scale to canvas height (cap at 95% of height)
    let barHeight = (val / 255) * height * 0.85;
    
    // Add minor idle float if playing but quiet
    if (playerStore.isPlaying && barHeight < 4) {
      barHeight = 4 + Math.sin(Date.now() * 0.01 + i) * 2;
    }

    // Update peaks
    if (peaks[i] === undefined || barHeight > peaks[i]) {
      peaks[i] = barHeight;
      peakHoldTimes[i] = HOLD_FRAMES;
    } else {
      if (peakHoldTimes[i] > 0) {
        peakHoldTimes[i]--;
      } else {
        peaks[i] = Math.max(0, peaks[i] - DECAY_RATE);
      }
    }

    // Draw Symmetrical/Mirrored Bars (growing from center out, or normal left-to-right)
    // We will do a double-sided mirrored layout: center to left, center to right
    const leftX = center - (i * (barWidth + barGap)) - barWidth;
    const rightX = center + (i * (barWidth + barGap));
    
    if (leftX < 0 || rightX > width) break;

    // Create gradient
    const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
    gradient.addColorStop(0, "rgba(99, 102, 241, 0.8)"); // Indigo
    gradient.addColorStop(0.5, "rgba(168, 85, 247, 0.85)"); // Purple
    gradient.addColorStop(1, "rgba(236, 72, 153, 0.95)"); // Pink/Rose

    ctx.fillStyle = gradient;

    // Draw left and right bars (growing upwards from bottom)
    const rectY = height - barHeight;
    ctx.fillRect(leftX, rectY, barWidth, barHeight);
    ctx.fillRect(rightX, rectY, barWidth, barHeight);

    // Draw falling peak dots
    const peakY = height - peaks[i];
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    
    // Draw peak dot for left
    if (peakY < height - 2) {
      ctx.fillRect(leftX, peakY, barWidth, 2);
      ctx.fillRect(rightX, peakY, barWidth, 2);
    }
  }
};

onMounted(() => {
  draw();
});

onUnmounted(() => {
  cancelAnimationFrame(animationFrameId);
});
</script>

<template>
  <div class="visualizer-container">
    <canvas ref="canvasRef" class="visualizer-canvas"></canvas>
    <div class="glow-bg"></div>
  </div>
</template>

<style scoped>
.visualizer-container {
  position: relative;
  width: 100%;
  height: 100%;
  background-color: #08080a;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid var(--border-color);
}

.visualizer-canvas {
  width: 100%;
  height: 100%;
  display: block;
  z-index: 2;
  position: relative;
}

.glow-bg {
  position: absolute;
  bottom: 0;
  left: 10%;
  right: 10%;
  height: 120px;
  background: radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, rgba(168, 85, 247, 0.05) 50%, rgba(0, 0, 0, 0) 100%);
  filter: blur(20px);
  pointer-events: none;
  z-index: 1;
}
</style>

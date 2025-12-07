<template>
  <div class="spectrogram-container" ref="containerRef">
    <div class="screen">
      <canvas ref="spectrogramCanvasA" class="spectrogram-canvas"></canvas>
      <canvas ref="gridCanvasA" class="grid-canvas"></canvas>
    </div>
    <div class="screen">
      <canvas ref="spectrogramCanvasB" class="spectrogram-canvas"></canvas>
      <canvas ref="gridCanvasB" class="grid-canvas"></canvas>
    </div>
    <div class="analysis-overlay">
      <div class="analysis-stat">
        <span class="label">Note: </span>
        <span class="value">{{ dominantNote }}</span>
        <span class="debug-info">({{ dominantFreq }} Hz)</span>
        <span class="debug-info">Vol: {{ volumeDb }} dB</span>
        <button class="overlay-btn" @click="togglePause">
          {{ isPaused ? '继续' : '暂停' }}
        </button>
        <button class="overlay-btn" @click="captureDebugLog">🐛 Debug</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as Tone from 'tone'
import axios from 'axios'

const props = defineProps({
  audioContext: Object,
  analyser: Object,
  dataArray: Uint8Array,
  isMetronomeOn: Boolean,
  lastBeatTime: Number,
  score: Object,
  bpm: {
    type: Number,
    default: 90
  },
  perfDebugEnabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['perf-sample'])

const containerRef = ref(null)
const spectrogramCanvasA = ref(null)
const spectrogramCanvasB = ref(null)
const gridCanvasA = ref(null)
const gridCanvasB = ref(null)
const spectrogramCanvases = [spectrogramCanvasA, spectrogramCanvasB]
const gridCanvases = [gridCanvasA, gridCanvasB]
const dominantNote = ref('-')
const dominantFreq = ref(0)
const volumeDb = ref('-')

let animationId = null
let colormap = []
const freqHistory = []
const perfDebugEnv = import.meta.env.VITE_ENABLE_PERF_DEBUG === 'true'
let lastFrameTs = null
let lastRafTs = null
const isPaused = ref(false)
let activeScreen = 0
let screenStartTime = performance.now()
const beatsPerMeasure = 4
const measuresPerScreen = 6

// Config
const minNote = 48 // C3
const maxNote = 96 // C7
const totalNotes = maxNote - minNote

// Generate custom colormap based on dB scale image
const initColormap = () => {
  colormap = []
  for (let i = 0; i < 256; i++) {
    let r, g, b
    if (i < 50) {
       r = 0; g = Math.floor((i / 50) * 50); b = Math.floor((i / 50) * 50)
    } else if (i < 120) {
       const t = (i - 50) / 70
       r = Math.floor(0 + t * 200); g = Math.floor(50 + t * 50); b = Math.floor(50 + t * 150)
    } else if (i < 200) {
       const t = (i - 120) / 80
       r = Math.floor(200 + t * 55); g = Math.floor(100 + t * 155); b = 200
    } else {
       const t = (i - 200) / 55
       r = 255; g = 255; b = Math.floor(200 + t * 55)
    }
    colormap[i] = `rgb(${r}, ${g}, ${b})`
  }
}

const drawGrid = (canvas) => {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const width = canvas.width
  const height = canvas.height
  
  ctx.clearRect(0, 0, width, height)
  
  // Horizontal pitch grid
  ctx.font = '10px Roboto Mono'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  
  for (let n = minNote; n <= maxNote; n++) {
     const normalizedY = (n - minNote) / totalNotes
     const y = height * (1 - normalizedY)
     
     const noteName = Tone.Frequency(440 * Math.pow(2, (n - 69) / 12)).toNote()
     const isC = noteName.startsWith('C') && !noteName.includes('#')
     const isSharp = noteName.includes('#')
     
     ctx.beginPath()
     if (isC) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
        ctx.lineWidth = 1.5
        ctx.setLineDash([])
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
        ctx.fillText(noteName, 4, y)
     } else if (isSharp) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
        ctx.lineWidth = 1
        ctx.setLineDash([2, 4])
     } else {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
        ctx.lineWidth = 1
        ctx.setLineDash([])
     }
     
     ctx.moveTo(0, y)
     ctx.lineTo(width, y)
     ctx.stroke()
  }

  // Vertical beat/measure grid: 6 measures, 4/4
  const totalBeats = beatsPerMeasure * measuresPerScreen
  for (let b = 0; b <= totalBeats; b++) {
    const x = (b / totalBeats) * width
    const isMeasure = b % beatsPerMeasure === 0
    ctx.beginPath()
    ctx.strokeStyle = isMeasure ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)'
    ctx.lineWidth = isMeasure ? 2 : 1
    ctx.setLineDash(isMeasure ? [] : [4, 6])
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()
    if (isMeasure) {
      const measureIndex = b / beatsPerMeasure + 1
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.fillText(`M${measureIndex}`, x + 4, 12)
    }
  }
}

const getWindowDurationMs = () => (measuresPerScreen * beatsPerMeasure * 60000) / props.bpm

const clearScreen = (index) => {
  const canvas = spectrogramCanvases[index].value
  const grid = gridCanvases[index].value
  if (!canvas || !grid) return
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  drawGrid(grid)
}

const switchScreen = () => {
  activeScreen = activeScreen === 0 ? 1 : 0
  screenStartTime = performance.now()
  clearScreen(activeScreen)
}

const drawSpectrogram = (rafTs) => {
  if (!spectrogramCanvases[activeScreen].value || !props.analyser || isPaused.value) {
    return
  }
  
  animationId = requestAnimationFrame(drawSpectrogram)
  const frameStart = performance.now()
  const frameDt = lastFrameTs ? frameStart - lastFrameTs : 0
  const rafLagMs = lastRafTs
    ? Math.max(0, (rafTs ?? frameStart) - lastRafTs - 16.7)
    : 0
  lastFrameTs = frameStart
  lastRafTs = rafTs ?? frameStart
  
  const fftStart = performance.now()
  if (props.analyser && props.dataArray) {
    props.analyser.getByteFrequencyData(props.dataArray)
  } else {
    return // Skip drawing if no data
  }
  const fftMs = performance.now() - fftStart
  
  const canvas = spectrogramCanvases[activeScreen].value
  const ctx = canvas.getContext('2d')
  const width = canvas.width
  const height = canvas.height
  
  const windowMs = getWindowDurationMs()
  const elapsedMs = frameStart - screenStartTime
  if (elapsedMs >= windowMs) {
    switchScreen()
    return
  }
  const x = Math.floor((elapsedMs / windowMs) * width)
  
  const sampleRate = props.audioContext.sampleRate
  const drawStart = performance.now()
  
  // Draw spectrogram column onto active screen
  for (let y = 0; y < height; y++) {
    const normalizedY = 1 - y / height
    const noteNum = minNote + normalizedY * totalNotes
    const freq = 440 * Math.pow(2, (noteNum - 69) / 12)
    const binIndex = Math.floor((freq * props.analyser.fftSize) / sampleRate)
    const value = props.dataArray[binIndex] || 0
    ctx.fillStyle = colormap[value]
    ctx.fillRect(x, y, 1, 1)
  }
  const drawMs = performance.now() - drawStart
  
  // --- B. Pitch Detection & Volume ---
  let pitchMs = 0
  let pitchProb = undefined
  let pitchFreq = undefined
  const pdSize = 2048
  const buffer = new Float32Array(pdSize)
  props.analyser.getFloatTimeDomainData(buffer)
  
  // Volume
  let sumSquares = 0
  for (let i = 0; i < pdSize; i++) sumSquares += buffer[i] * buffer[i]
  const rms = Math.sqrt(sumSquares / pdSize)
  volumeDb.value = rms > 0 ? (20 * Math.log10(rms)).toFixed(1) : '-inf'
  
  // Pitch detection every other frame
  if (animationId % 2 === 0) {
    const pitchStart = performance.now()
    let detectedFreq = 0
    const silenceThreshold = 0.02
    if (rms > silenceThreshold) {
      const result = getPitchYIN(buffer.slice(0, pdSize), sampleRate, 130, 2100)
      const rawFreq = result.freq
      const probability = result.probability
      if (rawFreq > 0 && probability > 0.9) {
        freqHistory.push(rawFreq)
        if (freqHistory.length > 5) freqHistory.shift()
        const sorted = [...freqHistory].sort((a, b) => a - b)
        detectedFreq = sorted[Math.floor(sorted.length / 2)]
        pitchProb = probability
      }
    } else if (freqHistory.length > 0) {
      freqHistory.shift()
    }

    if (detectedFreq > 0) {
      const midiNum = 69 + 12 * Math.log2(detectedFreq / 440)
      const roundedMidi = Math.round(midiNum)
      const deviation = (midiNum - roundedMidi) * 100
      if (roundedMidi >= minNote && roundedMidi <= maxNote) {
        dominantFreq.value = Math.round(detectedFreq)
        dominantNote.value = getNoteLabel(roundedMidi)
        const exactNormalizedY = (midiNum - minNote) / totalNotes
        const yPos = height * (1 - exactNormalizedY)
        let color = '#EF4444'
        const absDev = Math.abs(deviation)
        if (absDev <= 10) color = '#10B981'
        else if (absDev <= 30) color = '#F59E0B'
        ctx.fillStyle = color
        ctx.fillRect(x - 1, yPos - 2, 3, 4)
        pitchFreq = detectedFreq
      }
    } else {
      dominantFreq.value = 0
      dominantNote.value = '-'
    }
    pitchMs = performance.now() - pitchStart
  }
  
  // Beat marker
  if (props.isMetronomeOn && Date.now() - props.lastBeatTime < 50) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
    ctx.fillRect(x, 0, 1, height)
  }
  
  if (perfDebugEnv && props.perfDebugEnabled) {
    const sample = {
      ts: frameStart,
      frameDt,
      totalMs: performance.now() - frameStart,
      fftMs,
      drawMs,
      pitchMs,
      rafLagMs,
      pitchProb,
      pitchFreq
    }
    emit('perf-sample', sample)
  }
}

/**
 * Optimized YIN Algorithm
 * Returns { freq, probability }
 */
const getPitchYIN = (buf, sampleRate, minFreq = 130, maxFreq = 2100) => {
  const threshold = 0.10 // Tightened threshold
  const bufferSize = buf.length
  const maxTau = Math.floor(sampleRate / minFreq)
  const minTau = Math.floor(sampleRate / maxFreq)
  
  if (maxTau > bufferSize) return { freq: -1, probability: 0 }

  const yinBuffer = new Float32Array(maxTau + 1)
  
  // 1. Difference Function
  for (let t = 0; t <= maxTau; t++) {
    yinBuffer[t] = 0
    for (let i = 0; i < bufferSize - maxTau; i++) {
      const delta = buf[i] - buf[i + t]
      yinBuffer[t] += delta * delta
    }
  }
  
  // 2. Cumulative Mean Normalized Difference
  yinBuffer[0] = 1
  let runningSum = 0
  for (let t = 1; t <= maxTau; t++) {
    runningSum += yinBuffer[t]
    yinBuffer[t] *= t / runningSum
  }
  
  // 3. Absolute Threshold
  let tau = -1
  for (let t = minTau; t <= maxTau; t++) {
    if (yinBuffer[t] < threshold) {
      while (t + 1 <= maxTau && yinBuffer[t + 1] < yinBuffer[t]) {
        t++
      }
      tau = t
      break
    }
  }
  
  if (tau === -1) return { freq: -1, probability: 0 }
  
  let probability = 1 - yinBuffer[tau]
  
  // Parabolic Interpolation
  let betterTau = tau
  if (tau > 0 && tau < maxTau) {
    const s0 = yinBuffer[tau - 1]
    const s1 = yinBuffer[tau]
    const s2 = yinBuffer[tau + 1]
    let adjustment = (s2 - s0) / (2 * (2 * s1 - s2 - s0))
    betterTau = tau + adjustment
    probability = 1 - s1 // Use the minimum value as probability metric
  }
  
  return { freq: sampleRate / betterTau, probability }
}

const parabolicInterpolation = (array, x) => {
  const x0 = x < 1 ? x : x - 1
  const x2 = x + 1 < array.length ? x + 1 : x
  if (x0 === x) return x
  if (x2 === x) return x
  const s0 = array[x0]; const s1 = array[x]; const s2 = array[x2]
  let newx = x + (s2 - s0) / (2 * (2 * s1 - s2 - s0))
  return newx
}

const getNoteLabel = (midiNum) => {
  let root = 0 // C
  if (props.score && props.score.song_key) {
     const keyMap = {
       'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
       'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
       'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
     }
     const keyName = props.score.song_key.split(' ')[0]
     if (keyMap[keyName] !== undefined) root = keyMap[keyName]
  }
  
  const relativeIndex = (midiNum - root) % 12
  const jianpuMap = {
    0: '1', 1: '#1', 2: '2', 3: '#2', 4: '3', 5: '4',
    6: '#4', 7: '5', 8: '#5', 9: '6', 10: '#6', 11: '7'
  }
  
  const abs = Tone.Frequency(440 * Math.pow(2, (midiNum - 69) / 12)).toNote()
  const rel = jianpuMap[relativeIndex] || '?'
  return `${abs} (${rel})`
}

const resizeCanvases = () => {
  if (!containerRef.value) return
  const width = containerRef.value.offsetWidth
  const height = containerRef.value.offsetHeight / 2
  spectrogramCanvases.forEach((c) => {
    if (c.value) {
      c.value.width = width
      c.value.height = height
    }
  })
  gridCanvases.forEach((c) => {
    if (c.value) {
      c.value.width = width
      c.value.height = height
    }
  })
  clearScreen(0)
  clearScreen(1)
}

const togglePause = () => {
  isPaused.value = !isPaused.value
  if (isPaused.value) {
    if (animationId) cancelAnimationFrame(animationId)
    animationId = null
  } else {
    screenStartTime = performance.now()
    animationId = requestAnimationFrame(drawSpectrogram)
  }
}

const handleKeydown = (e) => {
  if (e.code === 'Space') {
    e.preventDefault()
    togglePause()
  }
}

watch(
  () => props.bpm,
  () => {
    screenStartTime = performance.now()
    clearScreen(0)
    clearScreen(1)
  }
)

onMounted(() => {
  initColormap()
  nextTick(() => {
    resizeCanvases()
    screenStartTime = performance.now()
    clearScreen(0)
    clearScreen(1)
    animationId = requestAnimationFrame(drawSpectrogram)
  })
  window.addEventListener('resize', resizeCanvases)
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  if (animationId) cancelAnimationFrame(animationId)
  window.removeEventListener('resize', resizeCanvases)
  window.removeEventListener('keydown', handleKeydown)
})

defineExpose({
  resizeCanvases
})

const captureDebugLog = async () => {
  if (!props.audioContext || !props.analyser) return
  
  const pdSize = 2048
  const buffer = new Float32Array(pdSize)
  props.analyser.getFloatTimeDomainData(buffer)
  
  // Calculate current metrics
  let sumSquares = 0
  for (let i = 0; i < pdSize; i++) sumSquares += buffer[i] * buffer[i]
  const rms = Math.sqrt(sumSquares / pdSize)
  
  const result = getPitchYIN(buffer, props.audioContext.sampleRate, 130, 2100)
  
  const logData = {
    timestamp: Date.now() / 1000,
    userAgent: navigator.userAgent,
    audioContext: {
      sampleRate: props.audioContext.sampleRate,
      state: props.audioContext.state,
      baseLatency: props.audioContext.baseLatency || 0,
      outputLatency: props.audioContext.outputLatency || 0
    },
    pitchInfo: {
      rms: rms,
      rawFreq: result.freq,
      probability: result.probability,
      detectedFreq: dominantFreq.value,
      processingTimeMs: 0 // Placeholder
    },
    rawBuffer: Array.from(buffer), // Send raw buffer for MATLAB analysis
    message: "User triggered debug snapshot"
  }
  
  try {
    await axios.post('/api/debug/log', logData)
    console.log('Debug log sent successfully')
    alert('Debug info sent to backend!')
  } catch (e) {
    console.error('Failed to send debug log', e)
    alert('Failed to send debug info')
  }
}
</script>

<style scoped>
.spectrogram-container {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background-color: #000;
}

.screen {
  position: relative;
  flex: 1;
  overflow: hidden;
  background: #000;
}

.spectrogram-canvas,
.grid-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.spectrogram-canvas {
  z-index: 1;
}

.grid-canvas {
  z-index: 2;
  pointer-events: none;
}

.analysis-overlay {
  position: absolute;
  top: 12px;
  left: 12px;
  background: rgba(0, 0, 0, 0.6);
  padding: 8px 12px;
  border-radius: 8px;
  pointer-events: none;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 8px;
}

.analysis-stat {
  font-family: 'Roboto Mono', monospace;
  color: #50C878;
  font-size: 1rem;
  display: flex;
  align-items: center;
  gap: 6px;
}

.debug-info {
  color: #a5b4fc;
  font-size: 0.85rem;
}

.overlay-btn {
  pointer-events: auto;
  background: #1f2937;
  color: #e5e7eb;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 0.85rem;
}
</style>


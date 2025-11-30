<template>
  <div class="spectrogram-container">
     <!-- Layer 1: Scrolling Spectrogram -->
     <canvas ref="spectrogramCanvas" class="spectrogram-canvas"></canvas>
     <canvas ref="gridCanvas" class="grid-canvas"></canvas>
     <div class="analysis-overlay">
        <div class="analysis-stat">
           <span class="label">Note: </span>
           <span class="value">{{ dominantNote }}</span>
           <span class="debug-info" style="font-size: 0.8rem; color: #888; margin-left: 10px;">
             ({{ dominantFreq }} Hz)
           </span>
           <button @click="captureDebugLog" style="margin-left: 10px; font-size: 0.7rem; background: #333; color: #fff; border: 1px solid #555; padding: 2px 6px; cursor: pointer; pointer-events: auto;">
               🐛 Debug
           </button>
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
  score: Object
})

const spectrogramCanvas = ref(null)
const gridCanvas = ref(null)
const dominantNote = ref('-')
const dominantFreq = ref(0)

let animationId = null
let tempCanvas = null
let tempCtx = null
let colormap = []
const freqHistory = []

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

const drawGrid = () => {
  if (!gridCanvas.value) return
  const canvas = gridCanvas.value
  const ctx = canvas.getContext('2d')
  const width = canvas.width
  const height = canvas.height
  
  ctx.clearRect(0, 0, width, height)
  
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
}

const drawSpectrogram = () => {
  if (!spectrogramCanvas.value || !props.analyser) return
  
  animationId = requestAnimationFrame(drawSpectrogram)
  
  if (props.analyser && props.dataArray) {
    props.analyser.getByteFrequencyData(props.dataArray)
  } else {
    return // Skip drawing if no data
  }
  
  const canvas = spectrogramCanvas.value
  const ctx = canvas.getContext('2d')
  const width = canvas.width
  const height = canvas.height
  
  if (!tempCanvas) {
    tempCanvas = document.createElement('canvas')
    tempCanvas.width = width
    tempCanvas.height = height
    tempCtx = tempCanvas.getContext('2d')
    tempCtx.fillStyle = '#000'
    tempCtx.fillRect(0, 0, width, height)
  }
  
  // Shift existing image
  tempCtx.drawImage(canvas, -1, 0)
  
  const sampleRate = props.audioContext.sampleRate
  
  // --- A. Draw Log-Scale Spectrogram Column ---
  for (let y = 0; y < height; y++) {
    const normalizedY = 1 - (y / height)
    const noteNum = minNote + normalizedY * totalNotes
    const freq = 440 * Math.pow(2, (noteNum - 69) / 12)
    const binIndex = Math.floor(freq * props.analyser.fftSize / sampleRate)
    const value = props.dataArray[binIndex] || 0
    tempCtx.fillStyle = colormap[value]
    tempCtx.fillRect(width - 1, y, 1, 1)
  }
  
  // --- B. Pitch Detection (YIN Algorithm + Smoothing) ---
  // Optimization: Run pitch detection every 2 frames (30 FPS)
  if (animationId % 2 === 0) {
    const pdSize = 2048
    const buffer = new Float32Array(pdSize)
    props.analyser.getFloatTimeDomainData(buffer)
    
    // 1. Calculate RMS for silence detection
    let sumSquares = 0
    for (let i = 0; i < pdSize; i++) {
       sumSquares += buffer[i] * buffer[i]
    }
    const rms = Math.sqrt(sumSquares / pdSize)
    const silenceThreshold = 0.02 
    
    let detectedFreq = 0
    
    if (rms > silenceThreshold) {
        // Use optimized YIN with confidence return
        const result = getPitchYIN(buffer.slice(0, pdSize), sampleRate, 130, 2100)
        const rawFreq = result.freq
        const probability = result.probability
        
        // Confidence Gating (from MATLAB simulation)
        if (rawFreq > 0 && probability > 0.90) {
          freqHistory.push(rawFreq)
          if (freqHistory.length > 5) freqHistory.shift()
          const sorted = [...freqHistory].sort((a, b) => a - b)
          detectedFreq = sorted[Math.floor(sorted.length / 2)]
        }
    } else {
        if (freqHistory.length > 0) freqHistory.shift()
    }
    
    if (detectedFreq > 0) {
      const midiNum = 69 + 12 * Math.log2(detectedFreq / 440)
      const roundedMidi = Math.round(midiNum)
      const deviation = (midiNum - roundedMidi) * 100
      
      if (roundedMidi >= minNote && roundedMidi <= maxNote) {
         dominantFreq.value = Math.round(detectedFreq)
         dominantNote.value = getNoteLabel(roundedMidi)
         
         // --- C. Visualize Pitch Marker (Glowing Capsule) ---
         const exactNormalizedY = (midiNum - minNote) / totalNotes
         const yPos = height * (1 - exactNormalizedY)
         
         let color = '#EF4444'
         let glowColor = 'transparent'
         let glowBlur = 0
         
         const absDev = Math.abs(deviation)
         if (absDev <= 10) {
            color = '#10B981'; glowColor = '#10B981'; glowBlur = 10
         } else if (absDev <= 30) {
            color = '#F59E0B'; glowColor = '#F59E0B'; glowBlur = 5
         }
         
         tempCtx.save()
         tempCtx.fillStyle = color
         tempCtx.shadowColor = glowColor
         tempCtx.shadowBlur = glowBlur
         
         const dpr = window.devicePixelRatio || 1
         const capsuleWidth = 12 * dpr
         const capsuleHeight = 6 * dpr
         // Align with spectrogram edge (width - 1)
         const x = width - capsuleWidth - 1 
         const y = yPos - capsuleHeight / 2
         
         tempCtx.beginPath()
         tempCtx.roundRect(x, y, capsuleWidth, capsuleHeight, 3 * dpr)
         tempCtx.fill()
         tempCtx.restore()
      }
    } else {
      dominantFreq.value = 0
      dominantNote.value = '-'
    }
  }

  // Draw Beat Marker
  if (props.isMetronomeOn && Date.now() - props.lastBeatTime < 50) { 
    tempCtx.fillStyle = 'rgba(255, 255, 255, 0.5)'
    tempCtx.fillRect(width - 1, 0, 1, height)
  }
  
  ctx.drawImage(tempCanvas, 0, 0)
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
  if (spectrogramCanvas.value) {
    spectrogramCanvas.value.width = spectrogramCanvas.value.offsetWidth
    spectrogramCanvas.value.height = spectrogramCanvas.value.offsetHeight
    tempCanvas = null
  }
  if (gridCanvas.value) {
    gridCanvas.value.width = gridCanvas.value.offsetWidth
    gridCanvas.value.height = gridCanvas.value.offsetHeight
    drawGrid()
  }
}

onMounted(() => {
  initColormap()
  // Ensure canvases are sized before starting loop
  nextTick(() => {
    resizeCanvases()
    drawSpectrogram()
  })
})

onUnmounted(() => {
  if (animationId) cancelAnimationFrame(animationId)
  window.removeEventListener('resize', resizeCanvases)
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
  width: 100%;
  height: 100%;
  position: relative;
  background-color: #000;
}

.spectrogram-canvas, .grid-canvas {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
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
  top: 16px;
  left: 16px;
  background: rgba(0,0,0,0.5);
  padding: 8px 16px;
  border-radius: 8px;
  pointer-events: none;
  z-index: 3;
}

.analysis-stat {
  font-family: 'Roboto Mono', monospace;
  color: #50C878;
  font-size: 1.2rem;
}
</style>

<template>
  <div class="spectrogram-container">
     <!-- Layer 1: Scrolling Spectrogram -->
     <canvas ref="spectrogramCanvas" class="spectrogram-canvas"></canvas>
     
     <!-- Layer 2: Static Grid Overlay -->
     <canvas ref="gridCanvas" class="grid-canvas"></canvas>
     
     <!-- Layer 3: Overlay Info -->
     <div class="analysis-overlay">
        <div class="analysis-stat">
           <span class="label">Note: </span>
           <span class="value">{{ dominantNote }}</span>
           <span class="debug-info" style="font-size: 0.8rem; color: #888; margin-left: 10px;">
             ({{ dominantFreq }} Hz)
           </span>
        </div>
     </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as Tone from 'tone'

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
  const pdSize = 2048
  const buffer = new Float32Array(pdSize)
  props.analyser.getFloatTimeDomainData(buffer)
  
  const rawFreq = getPitchYIN(buffer.slice(0, pdSize), sampleRate)
  let detectedFreq = 0
  
  if (rawFreq > 0) {
    freqHistory.push(rawFreq)
    if (freqHistory.length > 5) freqHistory.shift()
    const sorted = [...freqHistory].sort((a, b) => a - b)
    detectedFreq = sorted[Math.floor(sorted.length / 2)]
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
       
       const capsuleWidth = 12
       const capsuleHeight = 6
       const x = width - capsuleWidth - 2
       const y = yPos - capsuleHeight / 2
       
       tempCtx.beginPath()
       tempCtx.roundRect(x, y, capsuleWidth, capsuleHeight, 3)
       tempCtx.fill()
       tempCtx.restore()
    }
  } else {
    dominantFreq.value = 0
    dominantNote.value = '-'
  }

  // Draw Beat Marker
  if (props.isMetronomeOn && Date.now() - props.lastBeatTime < 50) { 
    tempCtx.fillStyle = 'rgba(255, 255, 255, 0.5)'
    tempCtx.fillRect(width - 1, 0, 1, height)
  }
  
  ctx.drawImage(tempCanvas, 0, 0)
}

const getPitchYIN = (buf, sampleRate) => {
  const threshold = 0.15
  const bufferSize = buf.length
  const yinBuffer = new Float32Array(bufferSize / 2)
  
  for (let t = 0; t < bufferSize / 2; t++) {
    yinBuffer[t] = 0
    for (let i = 0; i < bufferSize / 2; i++) {
      const delta = buf[i] - buf[i + t]
      yinBuffer[t] += delta * delta
    }
  }
  
  yinBuffer[0] = 1
  let runningSum = 0
  for (let t = 1; t < bufferSize / 2; t++) {
    runningSum += yinBuffer[t]
    yinBuffer[t] *= t / runningSum
  }
  
  let tau = -1
  for (let t = 2; t < bufferSize / 2; t++) {
    if (yinBuffer[t] < threshold) {
      while (t + 1 < bufferSize / 2 && yinBuffer[t + 1] < yinBuffer[t]) {
        t++
      }
      tau = t
      break
    }
  }
  
  if (tau === -1) return -1
  
  const betterTau = parabolicInterpolation(yinBuffer, tau)
  return sampleRate / betterTau
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

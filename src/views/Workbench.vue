<template>
  <div class="workbench-container" :class="{ 'rack-collapsed': isRackCollapsed }">
    <!-- Header / Toolbar (Optional, for view switching) -->
    <div class="stage-toolbar">
       <div class="view-switcher">
          <button 
            class="switch-btn" 
            :class="{ active: viewMode === 'score' }"
            @click="viewMode = 'score'">
            🎼 曲谱
          </button>
          <button 
            class="switch-btn" 
            :class="{ active: viewMode === 'analysis' }"
            @click="viewMode = 'analysis'">
            📊 频谱分析
          </button>
       </div>
       <button class="rack-toggle-btn" @click="toggleRack">
          {{ isRackCollapsed ? '🛠️ 打开工具' : '➡️ 收起工具' }}
       </button>
    </div>

    <!-- Center Stage -->
    <div class="score-stage" ref="scoreContainer" 
         @wheel.prevent="viewMode === 'score' ? handleZoom($event) : null" 
         @mousedown="viewMode === 'score' ? startDrag($event) : null" 
         @mousemove="viewMode === 'score' ? onDrag($event) : null" 
         @mouseup="stopDrag" 
         @mouseleave="stopDrag">
      
      <!-- Mode: Score -->
      <div v-if="viewMode === 'score'" class="stage-content score-mode">
        <div v-if="score" class="score-wrapper" :style="scoreStyle">
          <img :src="getScoreImageUrl(score.image_path)" class="score-image" draggable="false" />
        </div>
        <div v-else class="loading-text">Loading score...</div>
      </div>

      <!-- Mode: Analysis (Large Spectrum) -->
      <div v-show="viewMode === 'analysis'" class="stage-content analysis-mode">
         <canvas ref="analysisCanvas" class="analysis-canvas"></canvas>
         <div class="analysis-overlay">
            <div class="analysis-stat">
               <span class="label">Dominant Freq</span>
               <span class="value">{{ dominantFreq }} Hz</span>
            </div>
            <!-- Add more stats if needed -->
         </div>
      </div>
    </div>

    <!-- Right: Side Rack -->
    <div class="side-rack" :class="{ collapsed: isRackCollapsed }">
      <div class="rack-module metronome">
        <div class="module-header">
          <div class="module-title">METRONOME</div>
          <div class="module-status" :class="{ active: isMetronomeOn }"></div>
        </div>
        <div class="bpm-display">{{ bpm }} <span class="bpm-label">BPM</span></div>
        <div class="knob-control">
           <n-slider v-model:value="bpm" :min="40" :max="208" :step="1" vertical style="height: 100px;" />
        </div>
        <div class="rack-controls">
           <button class="rack-btn primary" @click="toggleMetronome">
             {{ isMetronomeOn ? 'STOP' : 'START' }}
           </button>
        </div>
      </div>
      
      <div class="rack-module tuner">
        <div class="module-title">TUNER</div>
        <div class="tuner-notes">
           <button class="note-btn" @click="playNote('C4')">C</button>
           <button class="note-btn" @click="playNote('D4')">D</button>
           <button class="note-btn" @click="playNote('E4')">E</button>
           <button class="note-btn" @click="playNote('F4')">F</button>
           <button class="note-btn" @click="playNote('G4')">G</button>
           <button class="note-btn" @click="playNote('A4')">A</button>
           <button class="note-btn" @click="playNote('B4')">B</button>
        </div>
      </div>
    </div>

    <!-- Bottom: Spectral Console -->
    <div class="spectral-console">
      <div id="waveform" class="waveform-hidden"></div>
      <canvas ref="spectrumCanvas" class="spectrum-canvas"></canvas>
      
      <div class="console-controls">
         <div class="control-group left">
            <div class="track-info" v-if="score">
               <div class="track-title">{{ score.title }}</div>
               <div class="track-meta">{{ score.song_key }} / {{ score.flute_key }}</div>
            </div>
         </div>
         
         <div class="control-group center">
            <button class="console-btn play-btn" @click="playPause">
              <span class="icon">{{ isPlaying ? '⏸' : '▶' }}</span>
            </button>
            
            <button class="console-btn record-btn" :class="{ 'is-recording': isRecording }" @click="toggleRecording">
               <div class="record-inner"></div>
            </button>
            
            <button class="console-btn save-btn" @click="saveRecording" :disabled="!recordedBlob" title="Save Recording">
               <span>💾</span>
            </button>
         </div>
         
         <div class="control-group right"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import WaveSurfer from 'wavesurfer.js'
import * as Tone from 'tone'
import { useMessage, NSlider } from 'naive-ui'
import { useUserStore } from '../stores/user'

const route = useRoute()
const scoreId = route.params.scoreId
const score = ref(null)
const wavesurfer = ref(null)
const isPlaying = ref(false)
const isRecording = ref(false)
const recordedBlob = ref(null)
const recordedAudioUrl = ref(null)
const message = useMessage()
const userStore = useUserStore()

// UI State
const isRackCollapsed = ref(window.innerWidth < 768) // Default collapsed on mobile
const viewMode = ref('score') // 'score' | 'analysis'
const dominantFreq = ref(0)

// Zoom & Pan State
const scale = ref(1)
const translateX = ref(0)
const translateY = ref(0)
const isDragging = ref(false)
const startX = ref(0)
const startY = ref(0)

// Metronome State
const bpm = ref(90)
const isMetronomeOn = ref(false)
let metronomeLoop = null

// Spectrum State
const spectrumCanvas = ref(null)
const analysisCanvas = ref(null)
let audioContext = null
let analyser = null
let dataArray = null
let animationId = null
let mediaRecorder = null
let audioChunks = []

const scoreStyle = computed(() => ({
  transform: `translate(${translateX.value}px, ${translateY.value}px) scale(${scale.value})`,
  transition: isDragging.value ? 'none' : 'transform 0.1s ease-out'
}))

const fetchScore = async () => {
  try {
    const response = await axios.get(`/api/scores/${scoreId}`)
    score.value = response.data
    initWaveSurfer(score.value.audio_path)
  } catch (error) {
    message.error('加载曲谱失败')
  }
}

const getScoreImageUrl = (path) => `/${path}`
const getAudioUrl = (path) => `/${path}`

// --- UI Logic ---
const toggleRack = () => {
  isRackCollapsed.value = !isRackCollapsed.value
}

// --- Zoom & Pan Logic ---
const handleZoom = (e) => {
  const zoomSpeed = 0.1
  const newScale = scale.value + (e.deltaY > 0 ? -zoomSpeed : zoomSpeed)
  scale.value = Math.min(Math.max(0.5, newScale), 5)
}

const startDrag = (e) => {
  isDragging.value = true
  startX.value = e.clientX - translateX.value
  startY.value = e.clientY - translateY.value
}

const onDrag = (e) => {
  if (!isDragging.value) return
  translateX.value = e.clientX - startX.value
  translateY.value = e.clientY - startY.value
}

const stopDrag = () => {
  isDragging.value = false
}

// --- Metronome Logic ---
const toggleMetronome = async () => {
  if (isMetronomeOn.value) {
    Tone.Transport.stop()
    isMetronomeOn.value = false
  } else {
    await Tone.start()
    Tone.Transport.bpm.value = bpm.value
    
    if (!metronomeLoop) {
      const synth = new Tone.MembraneSynth().toDestination()
      metronomeLoop = new Tone.Loop((time) => {
        synth.triggerAttackRelease("C2", "8n", time)
      }, "4n")
      metronomeLoop.start(0)
    }
    
    Tone.Transport.start()
    isMetronomeOn.value = true
  }
}

watch(bpm, (newBpm) => {
  if (isMetronomeOn.value) {
    Tone.Transport.bpm.value = newBpm
  }
})

// --- Audio & Spectrum Logic ---
const initWaveSurfer = (audioPath) => {
  if (wavesurfer.value) return
  
  wavesurfer.value = WaveSurfer.create({
    container: '#waveform',
    waveColor: '#50C878',
    progressColor: '#2E8B57',
    height: 0, 
    barWidth: 2,
  })
  
  wavesurfer.value.load(getAudioUrl(audioPath))
  
  wavesurfer.value.on('finish', () => {
    isPlaying.value = false
  })
}

const playPause = () => {
  if (wavesurfer.value) {
    wavesurfer.value.playPause()
    isPlaying.value = wavesurfer.value.isPlaying()
  }
}

const playNote = async (note) => {
  await Tone.start()
  const synth = new Tone.Synth().toDestination()
  synth.triggerAttackRelease(note, "8n")
}

const toggleRecording = async () => {
  if (isRecording.value) {
    stopRecording()
  } else {
    startRecording()
  }
}

const startRecording = async () => {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('BrowserAPIUnsupported')
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    mediaRecorder = new MediaRecorder(stream)
    audioChunks = []
    
    // Spectrum Setup
    audioContext = new (window.AudioContext || window.webkitAudioContext)()
    analyser = audioContext.createAnalyser()
    const source = audioContext.createMediaStreamSource(stream)
    source.connect(analyser)
    
    analyser.fftSize = 2048
    const bufferLength = analyser.frequencyBinCount
    dataArray = new Uint8Array(bufferLength)
    
    drawSpectrum()

    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data)
    }
    
    mediaRecorder.onstop = () => {
      recordedBlob.value = new Blob(audioChunks, { type: 'audio/webm' })
      recordedAudioUrl.value = URL.createObjectURL(recordedBlob.value)
      stopSpectrum()
    }
    
    mediaRecorder.start()
    isRecording.value = true
    
    if (wavesurfer.value && !wavesurfer.value.isPlaying()) {
      wavesurfer.value.play()
      isPlaying.value = true
    }
  } catch (error) {
    console.error('Microphone error:', error)
    if (error.name === 'NotAllowedError') {
      message.error('麦克风权限被拒绝')
    } else if (error.message === 'BrowserAPIUnsupported') {
      message.error('浏览器不支持录音API (请使用HTTPS或Localhost)')
    } else {
      message.error('无法访问麦克风')
    }
  }
}

const drawSpectrum = () => {
  if (!spectrumCanvas.value && !analysisCanvas.value) return
  
  animationId = requestAnimationFrame(drawSpectrum)
  analyser.getByteFrequencyData(dataArray)
  
  // Calculate Dominant Frequency (Simple Peak Detection)
  let maxVal = -1
  let maxIndex = -1
  for (let i = 0; i < dataArray.length; i++) {
    if (dataArray[i] > maxVal) {
      maxVal = dataArray[i]
      maxIndex = i
    }
  }
  const nyquist = audioContext.sampleRate / 2
  dominantFreq.value = Math.round((maxIndex / dataArray.length) * nyquist)
  
  // Draw Bottom Spectrum
  if (spectrumCanvas.value) {
    const canvas = spectrumCanvas.value
    const ctx = canvas.getContext('2d')
    const width = canvas.width
    const height = canvas.height
    
    ctx.fillStyle = '#121214'
    ctx.fillRect(0, 0, width, height)
    
    const barWidth = (width / dataArray.length) * 2.5
    let barHeight
    let x = 0
    
    const gradient = ctx.createLinearGradient(0, height, 0, 0)
    gradient.addColorStop(0, '#008B8B') 
    gradient.addColorStop(0.5, '#00FFFF') 
    gradient.addColorStop(1, '#FFFFFF') 
    
    ctx.fillStyle = gradient
    
    for(let i = 0; i < dataArray.length; i++) {
      barHeight = dataArray[i] / 255 * height
      ctx.fillRect(x, height - barHeight, barWidth, barHeight)
      x += barWidth + 1
    }
  }

  // Draw Center Analysis (if visible)
  if (viewMode.value === 'analysis' && analysisCanvas.value) {
     const canvas = analysisCanvas.value
     const ctx = canvas.getContext('2d')
     const width = canvas.width
     const height = canvas.height
     
     ctx.fillStyle = '#1A1A1D'
     ctx.fillRect(0, 0, width, height)
     
     // Draw a more detailed line graph
     ctx.lineWidth = 2
     ctx.strokeStyle = '#50C878'
     ctx.beginPath()
     
     const sliceWidth = width * 1.0 / dataArray.length
     let x = 0
     
     for(let i = 0; i < dataArray.length; i++) {
       const v = dataArray[i] / 128.0
       const y = height - (v * height / 2)
       
       if(i === 0) ctx.moveTo(x, y)
       else ctx.lineTo(x, y)
       
       x += sliceWidth
     }
     ctx.stroke()
  }
}

const stopSpectrum = () => {
  if (animationId) cancelAnimationFrame(animationId)
  if (audioContext) {
    audioContext.close()
    audioContext = null
  }
}

const stopRecording = () => {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
    isRecording.value = false
    
    if (wavesurfer.value) {
      wavesurfer.value.pause()
      isPlaying.value = false
    }
  }
}

const saveRecording = async () => {
  if (!recordedBlob.value) return
  
  const formData = new FormData()
  formData.append('score_id', scoreId)
  formData.append('file', recordedBlob.value, 'recording.webm')
  
  try {
    await axios.post('/api/recordings/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        'Authorization': `Bearer ${userStore.token}`
      }
    })
    message.success('录音已保存')
  } catch (error) {
    message.error('保存失败')
  }
}

const resizeCanvases = () => {
  if (spectrumCanvas.value) {
    spectrumCanvas.value.width = spectrumCanvas.value.offsetWidth
    spectrumCanvas.value.height = spectrumCanvas.value.offsetHeight
  }
  if (analysisCanvas.value) {
    analysisCanvas.value.width = analysisCanvas.value.offsetWidth
    analysisCanvas.value.height = analysisCanvas.value.offsetHeight
  }
}

onMounted(() => {
  fetchScore()
  resizeCanvases()
  window.addEventListener('resize', () => {
    isRackCollapsed.value = window.innerWidth < 768
    resizeCanvases()
  })
})

onUnmounted(() => {
  if (wavesurfer.value) wavesurfer.value.destroy()
  stopSpectrum()
  if (metronomeLoop) {
    metronomeLoop.dispose()
    Tone.Transport.stop()
  }
})

watch(viewMode, () => {
  nextTick(() => {
    resizeCanvases()
  })
})
</script>

<style scoped>
.workbench-container {
  display: grid;
  grid-template-columns: 1fr 280px;
  grid-template-rows: 48px 1fr 200px; /* Added header row */
  height: calc(100vh - 64px);
  background-color: #121214;
  color: #E0E0E0;
  overflow: hidden;
  transition: all 0.3s ease;
}

.workbench-container.rack-collapsed {
  grid-template-columns: 1fr 0px; /* Collapse side rack */
}

/* Toolbar */
.stage-toolbar {
  grid-column: 1 / 3;
  grid-row: 1 / 2;
  background-color: #18181B;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 1px solid #333;
}

.view-switcher {
  display: flex;
  gap: 8px;
}

.switch-btn {
  background: transparent;
  border: 1px solid #333;
  color: #888;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
}

.switch-btn.active {
  background: #333;
  color: #fff;
  border-color: #555;
}

.rack-toggle-btn {
  background: transparent;
  border: none;
  color: #50C878;
  cursor: pointer;
  font-weight: bold;
}

/* Center Stage */
.score-stage {
  grid-column: 1 / 2;
  grid-row: 2 / 3;
  background-color: #1A1A1D;
  margin: 16px;
  border-radius: 12px;
  overflow: hidden;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 0 20px rgba(0,0,0,0.5);
}

.stage-content {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.score-mode {
  cursor: grab;
}
.score-mode:active {
  cursor: grabbing;
}

.score-wrapper {
  transform-origin: center;
}

.score-image {
  max-width: 100%;
  max-height: 100%;
  display: block;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  background-color: #F5F5F0;
}

.analysis-mode {
  position: relative;
}

.analysis-canvas {
  width: 100%;
  height: 100%;
}

.analysis-overlay {
  position: absolute;
  top: 16px;
  left: 16px;
  background: rgba(0,0,0,0.5);
  padding: 8px 16px;
  border-radius: 8px;
}

.analysis-stat {
  font-family: 'Roboto Mono', monospace;
  color: #50C878;
  font-size: 1.2rem;
}

/* Side Rack */
.side-rack {
  grid-column: 2 / 3;
  grid-row: 2 / 3; /* Adjusted row */
  background-color: #18181B;
  border-left: 1px solid #333;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  z-index: 10;
  overflow-y: auto;
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.side-rack.collapsed {
  transform: translateX(100%);
  opacity: 0;
  padding: 0;
  width: 0;
  border: none;
}

/* Modules (Same as before) */
.rack-module {
  background: #222;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  flex-shrink: 0; /* Prevent shrinking */
}

.module-title { font-size: 0.8rem; font-weight: 700; color: #666; letter-spacing: 1px; }
.bpm-display { font-family: 'Roboto Mono', monospace; font-size: 2.5rem; color: #50C878; font-weight: bold; }
.bpm-label { font-size: 0.8rem; color: #666; }
.rack-btn { background: #333; border: none; color: #fff; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: bold; transition: all 0.2s; }
.rack-btn.primary { background: #50C878; color: #000; }
.rack-btn:hover { filter: brightness(1.1); }
.tuner-notes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; width: 100%; }
.note-btn { background: #333; border: 1px solid #444; color: #aaa; padding: 8px; border-radius: 4px; cursor: pointer; }
.note-btn:hover { background: #444; color: #fff; }

/* Spectral Console */
.spectral-console {
  grid-column: 1 / 3; /* Span full width when rack is collapsed, but grid handles it */
  grid-row: 3 / 4;
  background-color: #121214;
  position: relative;
  display: flex;
  flex-direction: column;
  border-top: 1px solid #333;
}

.spectrum-canvas { width: 100%; height: 100%; display: block; }

.console-controls {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 40px;
  background: rgba(18, 18, 20, 0.8);
  backdrop-filter: blur(10px);
  padding: 12px 32px;
  border-radius: 32px;
  border: 1px solid rgba(255,255,255,0.1);
  z-index: 20;
}

.control-group { display: flex; align-items: center; gap: 16px; }
.console-btn { background: none; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: transform 0.1s; }
.console-btn:active { transform: scale(0.95); }
.play-btn { width: 48px; height: 48px; border-radius: 50%; background: #333; color: #50C878; font-size: 24px; }
.record-btn { width: 64px; height: 64px; border-radius: 50%; border: 2px solid #fff; padding: 4px; }
.record-inner { width: 100%; height: 100%; background-color: #FF3333; border-radius: 50%; transition: all 0.3s; }
.record-btn.is-recording .record-inner { border-radius: 4px; transform: scale(0.5); box-shadow: 0 0 15px #FF3333; animation: breathe 2s infinite; }
.save-btn { width: 40px; height: 40px; border-radius: 50%; background: #333; font-size: 20px; }
.save-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.track-info { color: #fff; text-align: left; }
.track-title { font-weight: bold; font-size: 1rem; }
.track-meta { font-size: 0.8rem; color: #888; }
@keyframes breathe { 0% { box-shadow: 0 0 15px rgba(255, 51, 51, 0.5); } 50% { box-shadow: 0 0 25px rgba(255, 51, 51, 0.8); } 100% { box-shadow: 0 0 15px rgba(255, 51, 51, 0.5); } }
.waveform-hidden { display: none; }

/* Mobile Adjustments */
@media (max-width: 768px) {
  .console-controls {
    width: 90%;
    gap: 10px;
    padding: 8px 16px;
    justify-content: space-between;
  }
  .track-info { display: none; } /* Hide track info on small screens */
}
</style>

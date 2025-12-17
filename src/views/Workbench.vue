<template>
  <div class="workbench-container" :class="{ 'rack-collapsed': isRackCollapsed }">
    <!-- Header / Toolbar -->
    <div class="stage-toolbar">
       <div class="view-switcher">
          <button 
            class="switch-btn" 
            :class="{ active: viewMode === 'image' }"
            @click="viewMode = 'image'">
            🖼 图片曲谱
          </button>
          <button 
            class="switch-btn" 
            :class="{ active: viewMode === 'jianpu' }"
            @click="viewMode = 'jianpu'">
            𝄞 动态简谱
          </button>
          <button 
            class="switch-btn" 
            :class="{ active: viewMode === 'staff' }"
            @click="viewMode = 'staff'">
            🎼 动态五线谱
          </button>
          <button 
            class="switch-btn" 
            :class="{ active: viewMode === 'analysis' }"
            @click="viewMode = 'analysis'">
            📊 语谱图
          </button>
       </div>
       <button class="rack-toggle-btn" @click="toggleRack">
          {{ isRackCollapsed ? '🛠️ 打开工具' : '➡️ 收起工具' }}
       </button>
    </div>

    <!-- Center Stage -->
    <div class="score-stage" ref="scoreContainer" 
         @wheel.prevent="viewMode === 'image' ? handleZoom($event) : null" 
         @mousedown="viewMode === 'image' ? startDrag($event) : null" 
         @mousemove="viewMode === 'image' ? onDrag($event) : null" 
         @mouseup="stopDrag" 
         @mouseleave="stopDrag">
      
      <!-- Mode: 图片曲谱 -->
      <div v-show="viewMode === 'image'" class="stage-content score-mode">
        <div v-if="score" class="score-wrapper" :style="scoreStyle">
          <img :src="getScoreImageUrl(score.image_path)" class="score-image" draggable="false" />
        </div>
        <div v-else class="loading-text">Loading score...</div>
      </div>

      <!-- Mode: 动态简谱 -->
      <div v-if="viewMode === 'jianpu'" class="stage-content analysis-mode">
        <div class="stage-inner jianpu-mode" ref="jianpuContainer">
          <JianpuRenderer
            v-if="visualObj && score"
            :tune="visualObj"
            :active-note-ids="abcActiveNoteIds"
            :target-key="score.song_key"
            :debug-mode="false"
            @seek-to-note="onJianpuSeek"
          />
          <div v-else class="loading-text">暂无 ABC 乐谱，无法显示动态简谱</div>
        </div>
      </div>

      <!-- Mode: 动态五线谱 -->
      <div v-if="viewMode === 'staff'" class="stage-content analysis-mode">
        <div class="stage-inner staff-mode" ref="staffContainer">
          <StaffRenderer
            v-if="abcCode"
            :abc-code="abcCode"
            :active-note-ids="abcActiveNoteIds"
          />
          <div v-else class="loading-text">暂无 ABC 乐谱，无法显示五线谱</div>
        </div>
      </div>

      <!-- Mode: Analysis (Spectrogram) -->
      <div v-if="viewMode === 'analysis'" class="stage-content analysis-mode">
         <SpectrogramVisualizer 
           ref="spectrogramRef"
           :audioContext="audioContext"
           :analyser="analyser"
           :dataArray="dataArray"
           :isMetronomeOn="isMetronomeOn"
           :lastBeatTime="lastBeatTime"
           :score="score"
           :bpm="metronomeBpm"
           :perfDebugEnabled="perfDebugEnabled"
           @perf-sample="handlePerfSample"
         />
         <PerfMonitor
           v-if="perfDebugAvailable"
           :samples="perfSamples"
           :enabled="perfDebugEnabled"
           @toggle="togglePerfDebug"
         />
      </div>
    </div>

    <!-- Right: Side Rack -->
    <div class="side-rack" :class="{ collapsed: isRackCollapsed }">
      <MetronomePanel ref="metronomeRef" :onBeat="onBeat" />
      
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
import { ref, onMounted, onUnmounted, computed, watch, watchEffect, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import WaveSurfer from 'wavesurfer.js'
import * as Tone from 'tone'
import { useMessage } from 'naive-ui'
import { useUserStore } from '../stores/user'
import MetronomePanel from '../components/MetronomePanel.vue'
import SpectrogramVisualizer from '../components/SpectrogramVisualizer.vue'
import PerfMonitor from '../components/debug/PerfMonitor.vue'
import ImageRenderer from '../components/Score/ImageRenderer.vue'
import JianpuRenderer from '../components/Score/JianpuRenderer.vue'
import StaffRenderer from '../components/Score/StaffRenderer.vue'
import { useScoreData } from '../composables/useScoreData'
import { useAbcRenderer } from '../composables/useAbcRenderer'

const route = useRoute()
const scoreId = route.params.scoreId
// 使用通用曲谱加载逻辑
const { score, fetchScore } = useScoreData()
const wavesurfer = ref(null)
const isPlaying = ref(false)
const isRecording = ref(false)
const recordedBlob = ref(null)
const recordedAudioUrl = ref(null)
const message = useMessage()
const userStore = useUserStore()
const perfDebugAvailable = import.meta.env.VITE_ENABLE_PERF_DEBUG === 'true'
const perfDebugEnabled = ref(perfDebugAvailable)
const perfSamples = ref([])
const PERF_WINDOW = 300

// UI State
const isRackCollapsed = ref(window.innerWidth < 768)
const viewMode = ref('image') // 'image' | 'jianpu' | 'staff' | 'analysis'

// Zoom & Pan State
const scale = ref(1)
const translateX = ref(0)
const translateY = ref(0)
const isDragging = ref(false)
const startX = ref(0)
const startY = ref(0)

// Metronome State
const metronomeRef = ref(null)
const isMetronomeOn = computed(() => metronomeRef.value?.isMetronomeOn || false)
const lastBeatTime = ref(0)
const metronomeBpm = ref(90)

const onBeat = (time) => {
  lastBeatTime.value = time
}

watchEffect(() => {
  if (metronomeRef.value?.bpm) {
    metronomeBpm.value = metronomeRef.value.bpm.value
  }
})

// Spectrum & Spectrogram State
const spectrumCanvas = ref(null)
const spectrogramRef = ref(null) // Ref to child component
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

// ABC 相关：用于动态简谱/五线谱
const abcCode = computed(() => score.value?.abc_source || '')
const { visualObj, syntaxError, renderAbc } = useAbcRenderer(abcCode, { immediate: true })
const abcActiveNoteIds = ref([])

// 简谱点击跳播（目前先占位，未来可联动 abc 播放器）
const onJianpuSeek = (payload) => {
  console.log('[Workbench] Jianpu seek payload:', payload)
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
    
    analyser.fftSize = 16384
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
  if (!spectrumCanvas.value) return
  
  animationId = requestAnimationFrame(drawSpectrum)
  if (analyser) analyser.getByteFrequencyData(dataArray)
  
  // 1. Draw Bottom Spectrum (Instantaneous)
  if (spectrumCanvas.value) {
    const canvas = spectrumCanvas.value
    const ctx = canvas.getContext('2d')
    const width = canvas.width
    const height = canvas.height
    
    ctx.fillStyle = '#121214'
    ctx.fillRect(0, 0, width, height)
    
    if (dataArray) {
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
  if (spectrogramRef.value) {
    spectrogramRef.value.resizeCanvases()
  }
}

const handlePerfSample = (sample) => {
  if (!perfDebugEnabled.value) return
  perfSamples.value.push(sample)
  if (perfSamples.value.length > PERF_WINDOW) perfSamples.value.shift()
}

const togglePerfDebug = () => {
  perfDebugEnabled.value = !perfDebugEnabled.value
  if (!perfDebugEnabled.value) {
    perfSamples.value = []
  }
}

// 当曲谱加载完成后，初始化波形
watch(
  score,
  (val) => {
    if (val && val.audio_path) {
      initWaveSurfer(val.audio_path)
      // 重新渲染 ABC 以便 visualObj 更新
      renderAbc()
    }
  },
  { immediate: false }
)

onMounted(() => {
  fetchScore(scoreId)
  resizeCanvases()
  window.addEventListener('resize', () => {
    isRackCollapsed.value = window.innerWidth < 768
    resizeCanvases()
  })
})

onUnmounted(() => {
  if (wavesurfer.value) wavesurfer.value.destroy()
  stopSpectrum()
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
  grid-template-rows: 48px 1fr 200px;
  height: calc(100vh - 64px);
  background-color: #121214;
  color: #E0E0E0;
  overflow: hidden;
  transition: all 0.3s ease;
}

.workbench-container.rack-collapsed {
  grid-template-columns: 1fr 0px;
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
  background-color: #000;
}

/* Side Rack */
.side-rack {
  grid-column: 2 / 3;
  grid-row: 2 / 3;
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

/* Modules */
.rack-module {
  background: #222;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.module-title { font-size: 0.8rem; font-weight: 700; color: #666; letter-spacing: 1px; }
.tuner-notes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; width: 100%; }
.note-btn { background: #333; border: 1px solid #444; color: #aaa; padding: 8px; border-radius: 4px; cursor: pointer; }
.note-btn:hover { background: #444; color: #fff; }

/* Spectral Console */
.spectral-console {
  grid-column: 1 / 3;
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

@media (max-width: 768px) {
  .console-controls {
    width: 90%;
    gap: 10px;
    padding: 8px 16px;
    justify-content: space-between;
  }
  .track-info { display: none; }
}
</style>

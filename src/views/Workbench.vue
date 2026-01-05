<!-- src/views/Workbench.vue -->
<template>
  <div class="workbench-container" :class="{ 'rack-collapsed': isRackCollapsed }">
    <!-- Header / Toolbar -->
    <div class="stage-toolbar">
       <div class="view-switcher">
          <button class="switch-btn back-btn" @click="router.push('/library')">
             ⬅ <span class="btn-text">曲谱库</span>
          </button>
          <div class="separator"></div>
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
       
       <!-- Instrument Selector (Only for Dynamic Modes) -->
       <div v-if="viewMode === 'jianpu' || viewMode === 'staff'" class="instrument-selector">
          <select v-model="selectedInstrument" @change="onInstrumentChange">
             <option v-for="inst in availableInstruments" :key="inst.value" :value="inst.value">
               {{ inst.label }}
             </option>
          </select>
       </div>

       <button class="rack-toggle-btn" @click="toggleRack">
          {{ isRackCollapsed ? '🛠️' : '➡️' }}
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
            :playback-time="playbackTime"
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
            <!-- Rewind Button -->
            <button class="console-btn small-btn" @click="seekToStart" title="回到起点">
               ⏮
            </button>

            <button class="console-btn play-btn" @click="playPause">
              <span class="icon">{{ isPlaying ? '⏸' : '▶' }}</span>
            </button>

            <!-- Loop Button -->
             <button 
               class="console-btn small-btn" 
               :class="{ active: isLooping }" 
               @click="toggleLoop" 
               title="循环播放">
               🔁
            </button>
            
            <template v-if="viewMode !== 'jianpu' && viewMode !== 'staff'">
              <button class="console-btn record-btn" :class="{ 'is-recording': isRecording }" @click="toggleRecording">
                 <div class="record-inner"></div>
              </button>
              
              <button class="console-btn save-btn" @click="saveRecording" :disabled="!recordedBlob" title="Save Recording">
                 <span>💾</span>
              </button>
            </template>
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
import abcjs from 'abcjs'
import 'abcjs/abcjs-audio.css' // Import default abcjs audio css if available, or just rely on custom
import * as Tone from 'tone'
import { useMessage } from 'naive-ui'
import { useRouter } from 'vue-router'
import { useUserStore } from '../stores/user'
import MetronomePanel from '../components/MetronomePanel.vue'
import SpectrogramVisualizer from '../components/SpectrogramVisualizer.vue'
import PerfMonitor from '../components/debug/PerfMonitor.vue'
import ImageRenderer from '../components/Score/ImageRenderer.vue'
import JianpuRenderer from '../components/Score/JianpuRenderer.vue'
import StaffRenderer from '../components/Score/StaffRenderer.vue'
import { useScoreData } from '../composables/useScoreData'
import { useAbcRenderer } from '../composables/useAbcRenderer'

const router = useRouter()
const route = useRoute()
const scoreId = route.params.scoreId
// 使用通用曲谱加载逻辑
const { score, fetchScore } = useScoreData()
const wavesurfer = ref(null)
const isPlaying = ref(false)
const isLooping = ref(false)
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

// Map to store element -> abcjs class name
const abcElementClassMap = new Map()

// Helper to rebuild map
const rebuildElementMap = (vObj) => {
  abcElementClassMap.clear()
  if (!vObj) return
  
  let noteIdx = 0
  // Traverse exactly as abcjs does for naming
  if (vObj.lines) {
     vObj.lines.forEach(line => {
        if (line.staff) {
           line.staff.forEach(staff => {
              staff.voices.forEach(voice => {
                 voice.forEach(el => {
                    if (el.el_type === 'note') {
                       abcElementClassMap.set(el, `abcjs-n${noteIdx}`)
                       noteIdx++
                    }
                 })
              })
           })
        }
     })
  }
}

watch(visualObj, (val) => {
   rebuildElementMap(val)
})

// MIDI / Synth Logic
const midiSynth = ref(null)
const selectedInstrument = ref(0) // 0 = Piano default
const availableInstruments = [
  { label: '🎹 钢琴', value: 0 },
  { label: ' 小提琴', value: 40 },
  { label: '🎍 长笛', value: 73 }
]
// We use a shared audio context if possible or let abcjs create one to avoid conflicts
// ideally reuse `audioContext` we created for spectrum if active, but simpler to let abcjs manage its own for synth.

const initMidiSynth = async () => {
   if (midiSynth.value) return 
   midiSynth.value = new abcjs.synth.CreateSynth()
}

const onInstrumentChange = async () => {
  // If playing, we might need to restart or re-prime. For simplicity, stop first.
  if (isPlaying.value) {
     stopMidi()
  }
}

// 简谱点击跳播
const onJianpuSeek = (payload) => {
   // payload: { noteId, timePercent, absoluteTime }
   if (isMidiMode.value && midiSynth.value && visualObj.value) {
     const noteId = payload.noteId
     if (!noteId) return

     // 尝试查找该 noteId 对应的精确时间
     // 由于 Workbench 没有 tuneStaff，无法使用 noteIdToTimingMap
     // 我们需要直接遍历 visualObj.value (tuneJianpu) 来查找对应的元素
     // abcjs 的 CreateSynth/TimingCallbacks 在 init 后通常会给 inputs 附加 midiPitches/startTiming (internal implementation detail)
     // 或者我们直接搜索 visualObj 里的元素
     
     let foundTime = -1
     
     // 深度遍历 visualObj 查找匹配的 _myId
     // 这是一个耗时操作，但在点击 Seek 时通常可以接受
     // 优化：可以像 Editor 一样建立 Map，但这里直接遍历最简单
     const traverse = (obj) => {
        if (foundTime >= 0) return
        
        // 检查当前对象是否有 _myId 且匹配
        if (obj._myId === noteId) {
           // 找到目标！尝试获取时间
           // abcjs 渲染对象通常有 currentTrackMilliseconds 或类似
           // 但更可靠的是看 midiPitches
           if (obj.midiPitches && obj.midiPitches[0]) {
              foundTime = obj.midiPitches[0].start
              return
           } else if (obj.startTiming !== undefined) {
               // RenderAbc generated timing (unscaled?)
               // 这里的 startTiming 可能是 raw units，需要 scale?
               // 通常 midiPitches 是以秒为单位的 (CreateSynth init 后)
               // 我们优先信任 midiPitches
           }
        }
        
        // 递归遍历数组或对象属性
        if (Array.isArray(obj)) {
           for(let item of obj) traverse(item)
        } else if (typeof obj === 'object' && obj !== null) {
           // 遍历 lines / staff / voices
           if (obj.lines) traverse(obj.lines)
           else if (obj.staff) traverse(obj.staff)
           else if (obj.voices) traverse(obj.voices)
           else if (Array.isArray(obj)) traverse(obj) // Fallback for voice array
        }
     }
     
     // 从 lines 开始遍历效率较高
     if (visualObj.value.lines) {
        traverse(visualObj.value.lines)
     }
     
     if (foundTime >= 0) {
        console.log(`[Workbench] Seek to Note ${noteId}: ${foundTime}s`)
        midiSynth.value.seek(foundTime)
        // 更新 playbackTime 以便 UI 立即响应
        playbackTime.value = foundTime
        // 重新启动 highlight 循环如果需要 (seek 通常会自动触发 timing callbacks)
     } else {
        console.warn('[Workbench] Seek failed: could not find timing for note', noteId)
        // 降级尝试：使用 absoluteTime (可能不准)
        if (payload.absoluteTime !== undefined) {
           // midiSynth.seek(payload.absoluteTime) 
           // 暂时不启用降级，因为 absoluteTime 往往与 abcjs 内部时间不一致
        }
     }
   }
}

const getScoreImageUrl = (path) => `/${path}`
const getAudioUrl = (path) => `/${path}`

const isMidiMode = computed(() => viewMode.value === 'jianpu' || viewMode.value === 'staff')

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
  if (wavesurfer.value) {
      wavesurfer.value.destroy()
      wavesurfer.value = null
  }
  
  wavesurfer.value = WaveSurfer.create({
    container: '#waveform',
    waveColor: '#50C878',
    progressColor: '#2E8B57',
    height: 0, 
    barWidth: 2,
  })
  
  wavesurfer.value.load(getAudioUrl(audioPath))
  
  wavesurfer.value.on('finish', () => {
    if (isLooping.value) {
      wavesurfer.value.play()
    } else {
      isPlaying.value = false
    }
  })
}

const playbackTime = ref(0)
let lastEventTime = 0

// -- MIDI Playback Functions --
const playMidi = async () => {
  if (!midiSynth.value) await initMidiSynth()
  if (!visualObj.value) return 

  // Check if already playing
  if (isPlaying.value) {
    midiSynth.value.pause()
    isPlaying.value = false
    return
  }

  try {
      // Initialize synth with visual object
      await midiSynth.value.init({ 
         visualObj: visualObj.value,
         options: {
            program: selectedInstrument.value,
            soundFontUrl: "/soundfonts/FluidR3_GM/"
         }
      })
      await midiSynth.value.prime()
      
      // Start
      await midiSynth.value.start()
      isPlaying.value = true
      
      runTimingCallbacks()
  } catch (e) {
      console.error('MIDI Play Error', e)
      message.error('无法播放 MIDI: ' + e.message)
      isPlaying.value = false
  }
}

let timingCallbacks = null
const runTimingCallbacks = () => {
   if (timingCallbacks) timingCallbacks.stop()
   
   // Create timing callbacks associated with the VisualObj used by Synth
   timingCallbacks = new abcjs.TimingCallbacks(visualObj.value, {
      eventCallback: (event) => {
         // event: { milliseconds: number, elements: [], ... }
         if (event) {
            playbackTime.value = event.milliseconds / 1000.0
            lastEventTime = playbackTime.value
            
            // Highlight logic: Use IDs from event elements
            // Note: event.elements contains the abstract elements from visualObj
            if (event.elements) {
               const activeIds = []
               event.elements.forEach(group => {
                  const arr = Array.isArray(group) ? group : [group]
                  arr.forEach(el => {
                     // 优先检查 _myId (由 useAbcRenderer 注入)
                     if (el._myId) {
                        activeIds.push(el._myId)
                     }
                  })
               })
               // 去重并更新
               if (activeIds.length > 0) {
                  abcActiveNoteIds.value = [...new Set(activeIds)]
               } else {
                  // 如果没有元素（休止符？），清空
                  abcActiveNoteIds.value = []
               }
            }
         }
      },
      onEnded: () => {
        if (isLooping.value) {
           midiSynth.value.start()
           runTimingCallbacks() // Restart callbacks
        } else {
           isPlaying.value = false
           playbackTime.value = 0
           abcActiveNoteIds.value = []
        }
      }
   })
   timingCallbacks.start()
}

const stopMidi = () => {
  if (midiSynth.value) {
    midiSynth.value.stop()
    isPlaying.value = false
  }
  if (timingCallbacks) {
     timingCallbacks.stop()
  }
}

const playPause = () => {
  if (isMidiMode.value) {
     if (isPlaying.value) {
        // Pause/Step
        // midiSynth does not have simple pause/resume exactly like audio... 
        // actually it does have `.pause()` in recent versions.
        stopMidi() // For MVP, simple stop/toggle
     } else {
        playMidi()
     }
  } else {
      // Audio Mode
      if (wavesurfer.value) {
        wavesurfer.value.playPause()
        isPlaying.value = wavesurfer.value.isPlaying()
      }
  }
}

const seekToStart = () => {
  if (isMidiMode.value) {
     stopMidi()
     // midiSynth.seek(0)
  } else if (wavesurfer.value) {
    wavesurfer.value.seekTo(0)
  }
}

const toggleLoop = () => {
  isLooping.value = !isLooping.value
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
  stopMidi()
})

watch(viewMode, (newMode) => {
  // Switch logic: Stop everything when switching modes
  stopMidi()
  if (wavesurfer.value) {
     wavesurfer.value.pause()
     isPlaying.value = false
  }

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
  grid-template-rows: 48px 1fr 200px;
  height: 100vh;
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

/* Mobile: hide text if too small */
@media (max-width: 768px) {
   .btn-text {
      display: none;
   }
}

.instrument-selector select {
  background: #222;
  color: #eee;
  border: 1px solid #444;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.8rem;
  max-width: 120px;
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

.stage-inner {
  width: 100%;
  height: 100%;
  overflow: auto;
}

.staff-mode {
  display: flex;
  align-items: flex-start;
  justify-content: center;
}

.jianpu-mode {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 20px;
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
.small-btn { width: 36px; height: 36px; border-radius: 50%; background: #333; color: #ccc; font-size: 16px; border: 1px solid #444; }
.small-btn.active { color: #50C878; border-color: #50C878; }
.separator { width: 1px; height: 24px; background-color: #333; margin: 0 4px; }
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
  
  /* Mobile Toolbar Fixes */
  .stage-toolbar {
    overflow-x: auto;
    white-space: nowrap;
    padding: 0 8px;
    gap: 8px;
    justify-content: flex-start;
  }
  .stage-toolbar::-webkit-scrollbar {
    display: none; /* Hide scrollbar for cleaner look */
  }
  .view-switcher {
    flex-shrink: 0;
  }
  .rack-toggle-btn {
    margin-left: auto; /* Push to right if space permits */
    flex-shrink: 0;
    padding-left: 12px;
  }
}
</style>

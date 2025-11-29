<template>
  <div style="height: calc(100vh - 80px); display: flex; flex-direction: column;">
    <!-- Top: Score Viewer -->
    <div style="flex: 1; overflow: auto; background: #f0f0f0; text-align: center; position: relative;">
      <div v-if="score">
        <img :src="getScoreImageUrl(score.image_path)" style="max-width: 100%;" />
      </div>
      <div v-else>Loading score...</div>
    </div>

    <!-- Middle: Tuner (Placeholder) -->
    <div style="height: 60px; background: #333; color: white; display: flex; align-items: center; justify-content: center;">
      <n-button @click="playNote('C4')">C4</n-button>
      <n-button @click="playNote('D4')">D4</n-button>
      <n-button @click="playNote('E4')">E4</n-button>
      <n-button @click="playNote('F4')">F4</n-button>
      <n-button @click="playNote('G4')">G4</n-button>
      <span style="margin-left: 20px;">校音器 (点击发声)</span>
    </div>

    <!-- Bottom: Audio Console -->
    <div style="height: 150px; background: #222; padding: 10px; color: white;">
      <div id="waveform" style="margin-bottom: 10px;"></div>
      <canvas ref="spectrumCanvas" width="1024" height="100" style="width: 100%; height: 100px; background: #000; display: block; margin-bottom: 10px;"></canvas>
      <div style="display: flex; gap: 10px; justify-content: center;">
        <n-button type="primary" @click="playPause">{{ isPlaying ? '暂停' : '播放伴奏' }}</n-button>
        <n-button type="error" @click="toggleRecording">{{ isRecording ? '停止录音' : '开始录音' }}</n-button>
        <n-button v-if="userStore.isLoggedIn" type="info" @click="saveRecording" :disabled="!recordedBlob">保存录音</n-button>
        <n-button v-else type="info" disabled title="登录后可保存">保存录音 (需登录)</n-button>
      </div>
      <div v-if="recordedAudioUrl" style="margin-top: 10px; text-align: center;">
        <audio :src="recordedAudioUrl" controls></audio>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import WaveSurfer from 'wavesurfer.js'
import * as Tone from 'tone'
import { NButton, useMessage } from 'naive-ui'
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

let mediaRecorder = null
let audioChunks = []

const fetchScore = async () => {
  try {
    const response = await axios.get(`/api/scores/${scoreId}`)
    score.value = response.data
    initWaveSurfer(score.value.audio_path)
  } catch (error) {
    message.error('加载曲谱失败')
  }
}

const getScoreImageUrl = (path) => {
  return `/${path}`
}

const getAudioUrl = (path) => {
  return `/${path}`
}

const initWaveSurfer = (audioPath) => {
  if (wavesurfer.value) return
  
  wavesurfer.value = WaveSurfer.create({
    container: '#waveform',
    waveColor: 'violet',
    progressColor: 'purple',
    height: 80,
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

const spectrumCanvas = ref(null)
let audioContext = null
let analyser = null
let dataArray = null
let animationId = null

const startRecording = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    mediaRecorder = new MediaRecorder(stream)
    audioChunks = []
    
    // Spectrum Visualization Setup
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
    
    // Auto play backing track
    if (wavesurfer.value && !wavesurfer.value.isPlaying()) {
      wavesurfer.value.play()
      isPlaying.value = true
    }
  } catch (error) {
    console.error(error)
    message.error('无法访问麦克风，请确保使用HTTPS或Localhost访问')
  }
}

const drawSpectrum = () => {
  if (!spectrumCanvas.value) return
  
  animationId = requestAnimationFrame(drawSpectrum)
  
  analyser.getByteFrequencyData(dataArray)
  
  const canvas = spectrumCanvas.value
  const ctx = canvas.getContext('2d')
  const width = canvas.width
  const height = canvas.height
  
  ctx.fillStyle = 'rgb(0, 0, 0)'
  ctx.fillRect(0, 0, width, height)
  
  const barWidth = (width / dataArray.length) * 2.5
  let barHeight
  let x = 0
  
  for(let i = 0; i < dataArray.length; i++) {
    barHeight = dataArray[i] / 2
    
    ctx.fillStyle = `rgb(${barHeight + 100}, 50, 50)`
    ctx.fillRect(x, height - barHeight, barWidth, barHeight)
    
    x += barWidth + 1
  }
}

const stopSpectrum = () => {
  if (animationId) {
    cancelAnimationFrame(animationId)
  }
  if (audioContext) {
    audioContext.close()
    audioContext = null
  }
}

const stopRecording = () => {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
    isRecording.value = false
    
    // Stop backing track
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

onMounted(() => {
  fetchScore()
})

onUnmounted(() => {
  if (wavesurfer.value) {
    wavesurfer.value.destroy()
  }
  stopSpectrum()
})
</script>

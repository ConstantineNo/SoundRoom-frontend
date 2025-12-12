<template>
  <div class="editor-container">
    <div class="header">
      <div class="left">
        <n-button secondary @click="$router.push('/library')">
          <template #icon><n-icon><ArrowBack /></n-icon></template>
          返回列表
        </n-button>
        <span class="title">{{ score ? score.title : 'Loading...' }}</span>
      </div>
      <div class="right">
        <n-button type="primary" @click="saveScore" :loading="saving">保存并解析</n-button>
        <n-button @click="handleGenerateJianpu" style="margin-left: 10px">生成简谱</n-button>
      </div>
    </div>
    
    <div class="main-content">
      <!-- Left: Code Editor -->
      <div class="pane left-pane">
        <textarea 
          class="code-editor" 
          v-model="abcCode" 
          placeholder="在此输入ABC代码..."
          spellcheck="false"
        ></textarea>
        <!-- Error display could go here -->
        <div v-if="syntaxError" class="error-bar">
          {{ syntaxError }}
        </div>
      </div>
      
      <!-- Right: Preview -->
      <div class="pane right-pane">
        <div id="audio" class="audio-container"></div>
        <div id="paper" class="paper-container"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import abcjs from 'abcjs'
import 'abcjs/abcjs-audio.css'
import { generateJianpu } from '../utils/jianpu'
import { useMessage, NButton, NIcon } from 'naive-ui'
import { ArrowBack } from '@vicons/ionicons5'
import { useUserStore } from '../stores/user'

const route = useRoute()
const router = useRouter()
const message = useMessage()
const userStore = useUserStore()

const scoreId = route.params.scoreId
const score = ref(null)
const abcCode = ref('')
const saving = ref(false)
const syntaxError = ref('')

let synthControl = null
let createSynth = null

// Default template if empty
const DEFAULT_TEMPLATE = `X:1
T:New Song
K:C
L:1/4
C D E F | G A B c |`

// Debounce helper
const debounce = (fn, delay) => {
  let timeoutId
  return (...args) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn.apply(this, args), delay)
  }
}

const renderAbc = debounce(async () => {
  syntaxError.value = ''
  const audioContainer = document.querySelector("#audio")
  
  try {
    // 1. 渲染乐谱
    const visualObj = abcjs.renderAbc("paper", abcCode.value, {
      responsive: "resize",
      add_classes: true,
      staffwidth: 800 // 建议固定宽度以保证排版稳定
    })

    // 2. 检查是否生成了有效的乐谱对象
    if (!visualObj || !visualObj[0]) {
      console.warn("渲染未能生成有效的 Tune 对象")
      return
    }

    // 3. 初始化音频 (标准流程)
    if (abcjs.synth.supportsAudio()) {
      
      // A. 清理旧实例 (防止播放器重复堆叠)
      if (synthControl) {
        synthControl.disable(true)
      }
      
      // B. 创建控制器 UI
      synthControl = new abcjs.synth.SynthController()
      synthControl.load("#audio", null, {
        displayLoop: true,
        displayRestart: true,
        displayPlay: true,
        displayProgress: true,
        displayWarp: true // 允许变速
      })

      // C. 创建音频合成器 (这是您原代码缺失的核心步骤)
      createSynth = new abcjs.synth.CreateSynth()
      
      try {
        // D. 初始化合成器 (生成 MIDI Buffer)
        await createSynth.init({ visualObj: visualObj[0] })
        
        // Cursor Control Logic
        const cursorControl = {
          onStart() {
            // Clear any existing highlights
            const els = document.querySelectorAll('.highlight-note')
            els.forEach(el => el.classList.remove('highlight-note'))
          },
          onEvent(ev) {
            // Remove highlight from previous notes
            const els = document.querySelectorAll('.highlight-note')
            els.forEach(el => el.classList.remove('highlight-note'))
            
            // Highlight current elements
            if (ev && ev.elements) {
              ev.elements.forEach(elGroup => {
                if (Array.isArray(elGroup)) {
                  elGroup.forEach(el => el.classList.add('highlight-note'))
                } else if (elGroup instanceof Element) {
                  elGroup.classList.add('highlight-note')
                }
              })
            }
          },
          onFinished() {
            const els = document.querySelectorAll('.highlight-note')
            els.forEach(el => el.classList.remove('highlight-note'))
          }
        }

        // E. 将合成器连接到控制器
        // millisecondsPerMeasure: 用于控制初始速度，可选
        await synthControl.setTune(visualObj[0], true, {
          chordsOff: true, // 竹笛单旋律，建议关闭和弦伴奏
          cursorControl: cursorControl
        })
        
        console.log("音频初始化完成")
        
      } catch (audioErr) {
        console.error("音频生成失败:", audioErr)
        if (audioContainer) {
          audioContainer.innerHTML = `<div class="error-msg">音频生成失败: ${audioErr.message}</div>`
        }
      }
    }
  } catch (err) {
    console.error(err)
    syntaxError.value = err.message || 'Syntax Error'
  }
}, 500)

watch(abcCode, () => {
  renderAbc()
})

const fetchScore = async () => {
  try {
    const response = await axios.get(`/api/scores/${scoreId}`)
    score.value = response.data
    // Load existing ABC or default
    if (score.value.abc_source) {
      abcCode.value = score.value.abc_source
    } else {
      let initCode = DEFAULT_TEMPLATE
      if (score.value.title) initCode = initCode.replace("T:New Song", `T:${score.value.title}`)
      if (score.value.song_key) initCode = initCode.replace("K:C", `K:${score.value.song_key}`)
      abcCode.value = initCode
    }
    // Initial Render
    renderAbc()
  } catch (error) {
    message.error('加载失败')
    console.error(error)
  }
}

const saveScore = async () => {
  saving.value = true
  try {
    await axios.put(`/api/scores/${scoreId}/abc`, {
      abc_content: abcCode.value
    }, {
      headers: { 'Authorization': `Bearer ${userStore.token}` }
    })
    message.success('保存成功')
  } catch (error) {
    message.error('保存失败')
    console.error(error)
  } finally {
    saving.value = false
  }
}

const handleGenerateJianpu = () => {
  try {
    const newCode = generateJianpu(abcCode.value)
    if (newCode === abcCode.value) {
      message.info('未能生成新的简谱行 (可能是已经存在或无音符)')
    } else {
      abcCode.value = newCode
      message.success('简谱已插入')
    }
  } catch (e) {
    console.error(e)
    message.error('生成简谱失败: ' + e.message)
  }
}

onMounted(() => {
  fetchScore()
})

onUnmounted(() => {
  if (synthControl) {
    // Cleanup if needed, though abcjs doesn't strictly require it for simple usage
    synthControl = null
  }
})
</script>

<style scoped>
.editor-container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: #f5f5f5;
}

.header {
  height: 60px;
  background: #fff;
  border-bottom: 1px solid #eee;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.left, .right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.title {
  font-weight: bold;
  font-size: 1.1rem;
}

.main-content {
  flex: 1;
  display: flex;
  align-items: flex-start; /* Important for sticky sidebar */
}

.pane {
  padding: 20px;
}

.left-pane {
  flex: 0 0 40%;
  border-right: 1px solid #ddd;
  display: flex;
  flex-direction: column;
  /* Sticky Sidebar */
  position: sticky;
  top: 60px;
  height: calc(100vh - 60px);
  overflow-y: auto;
  background: #282c34;
  padding: 0;
}

.right-pane {
  flex: 1;
  background: #fff;
  min-height: calc(100vh - 60px);
  display: flex;
  flex-direction: column;
}

.code-editor {
  flex: 1;
  width: 100%;
  min-height: 100%;
  resize: none;
  border: none;
  padding: 16px;
  font-family: 'Fira Code', 'Consolas', monospace;
  font-size: 14px;
  line-height: 1.6;
  outline: none;
  background: #282c34;
  color: #abb2bf;
}

.error-bar {
  background: #ffeded;
  color: #ff4d4f;
  padding: 8px 16px;
  font-size: 0.9rem;
  border-top: 1px solid #ffccc7;
}

.paper-container {
  flex: 1;
  margin-top: 20px;
}

.audio-container {
  padding: 10px;
  background: #f9f9f9;
  border-radius: 8px;
  margin-bottom: 10px;
  min-height: 50px; /* 预留高度，防止加载时闪烁 */
  display: flex;
  align-items: center;
  justify-content: center;
}

.error-msg {
  color: #d03050;
  font-size: 12px;
  padding: 10px;
}

/* Custom Scrollbar for Webkit */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: #ccc;
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: #999;
}
.left-pane::-webkit-scrollbar-thumb {
  background: #4b5263;
}
.left-pane::-webkit-scrollbar-track {
  background: #282c34;
}

/* Note Highlighting */
:deep(.highlight-note) {
  fill: #ff4d4f !important;
  stroke: #ff4d4f !important;
  stroke-width: 2px;
}
</style>

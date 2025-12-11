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

const renderAbc = debounce(() => {
  syntaxError.value = ''
  try {
    const visualObj = abcjs.renderAbc("paper", abcCode.value, {
      responsive: "resize",
      add_classes: true
    })
    
    // Setup audio synth
    if (abcjs.synth.supportsAudio() && visualObj && visualObj[0]) {
      // Check if there is any music to play
      // Ensure duration is positive and significant enough to generate frames
      if (visualObj[0].getTotalTime() < 0.01) {
        return
      }

      if (!synthControl) {
        synthControl = new abcjs.synth.SynthController();
        synthControl.load("#audio", null, {
          displayLoop: true,
          displayRestart: true,
          displayPlay: true,
          displayProgress: true,
          displayWarp: false // Disable warp to avoid potential issues
        });
      } else {
        // Important: Disable before updating to prevent race conditions
        synthControl.disable(true);
      }
      
      const createSynth = new abcjs.synth.CreateSynth();
      createSynth.init({ visualObj: visualObj[0] })
        .then(() => {
            if (synthControl) {
              synthControl.setTune(visualObj[0], false, {
                  chordsOff: true
              }).catch(error => {
                console.warn("Audio setTune warning:", error)
              })
            }
        }).catch(error => {
           console.warn("Synth init warning:", error)
        })
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
</style>

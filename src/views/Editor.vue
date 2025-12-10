<template>
  <div class="editor-container">
    <div class="header">
      <div class="left">
        <n-button secondary @click="$router.push('/scores')">
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
        <div id="paper" class="paper-container"></div>
        <div id="audio" class="audio-container"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import abcjs from 'abcjs'
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
    abcjs.renderAbc("paper", abcCode.value, {
      responsive: "resize",
      add_classes: true
    })
    
    // Setup audio synth
    if (abcjs.synth.supportsAudio()) {
      const synthControl = new abcjs.synth.SynthController();
      synthControl.load("#audio", null, {
        displayLoop: true,
        displayRestart: true,
        displayPlay: true,
        displayProgress: true,
        displayWarp: true
      });
      
      const createSynth = new abcjs.synth.CreateSynth();
      createSynth.init({ visualObj: abcjs.renderAbc("paper", abcCode.value)[0] })
        .then(() => {
            synthControl.setTune(abcjs.renderAbc("paper", abcCode.value)[0], false, {
                chordsOff: true
            }).then(() => {
                // Audio loaded
            })
        })
    }
  } catch (err) {
    console.error(err)
    // abcjs usually prints errors to console or returns warnings, 
    // strictly speaking renderAbc might not throw but return specific objects.
    // For simple error handling, we rely on visual output or check result.
  }
}, 300)

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
      // If backend has no specific abc field yet, or it's empty, use template
      // We might want to inject Title/Key from score metadata into the template 
      // if it's a fresh shell.
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
</script>

<style scoped>
.editor-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
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
  overflow: hidden;
}

.pane {
  height: 100%;
  overflow: auto;
}

.left-pane {
  flex: 0 0 40%;
  border-right: 1px solid #ddd;
  display: flex;
  flex-direction: column;
}

.right-pane {
  flex: 1;
  background: #fff;
  padding: 20px;
  display: flex;
  flex-direction: column;
}

.code-editor {
  flex: 1;
  width: 100%;
  resize: none;
  border: none;
  padding: 16px;
  font-family: 'Fira Code', 'Consolas', monospace;
  font-size: 14px;
  line-height: 1.5;
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
  overflow-y: auto;
}

.audio-container {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #eee;
}
</style>

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
        <div class="view-switcher" style="margin-left: 10px; display: inline-flex; gap: 5px;">
           <n-button size="small" :type="viewMode === 'staff' ? 'primary' : 'default'" @click="viewMode = 'staff'">五线谱</n-button>
           <n-button size="small" :type="viewMode === 'jianpu' ? 'primary' : 'default'" @click="viewMode = 'jianpu'">简谱</n-button>
        </div>
      </div>
    </div>
    
    <div class="main-content">
      <!-- Left: Code Editor -->
      <div class="pane left-pane">
        <div class="editor-wrapper">
          <div class="line-numbers" ref="lineNumbersRef">
            <div 
              v-for="(line, idx) in codeLines" 
              :key="idx" 
              class="line-number"
              :class="{ 
                'error-line': errorLineNumbers.has(idx + 1),
                'overflow-line': overflowLineNumbers.has(idx + 1),
                'underflow-line': underflowLineNumbers.has(idx + 1)
              }"
            >{{ idx + 1 }}</div>
          </div>
          <textarea 
            ref="textareaRef"
            class="code-editor" 
            v-model="abcCode" 
            placeholder="在此输入ABC代码..."
            spellcheck="false"
            @scroll="syncScroll"
          ></textarea>
        </div>
        <div v-if="syntaxError" class="error-bar">
          {{ syntaxError }}
        </div>
        <div v-if="measureIssues.length > 0" class="issue-bar">
          <span class="issue-title">时值问题:</span>
          <span v-for="issue in measureIssues" :key="issue.measureNumber" 
            class="issue-item"
            :class="issue.status"
          >
            小节{{ issue.measureNumber }}: {{ issue.status === 'overflow' ? '超限' : '不足' }}
          </span>
        </div>
      </div>
      
      <!-- Right: Preview -->
      <div class="pane right-pane">
        <div id="audio" class="audio-container"></div>
        <div id="paper" class="paper-container" v-show="viewMode === 'staff'"></div>
        <JianpuScore 
          v-if="viewMode === 'jianpu' && visualObj" 
          :tune="visualObj" 
          :active-note-ids="activeNoteIds"
          :debug-mode="true"
          @measure-issues="handleMeasureIssues"
          @seek-to-note="handleSeekToNote"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import abcjs from 'abcjs'
import 'abcjs/abcjs-audio.css'
import { useMessage, NButton, NIcon } from 'naive-ui'
import JianpuScore from '../components/JianpuScore.vue'
import { ArrowBack } from '@vicons/ionicons5'
import { useUserStore } from '../stores/user'

const route = useRoute()
const router = useRouter()
const message = useMessage()
const userStore = useUserStore()

// Editor refs
const textareaRef = ref(null)
const lineNumbersRef = ref(null)

const scoreId = route.params.scoreId
const score = ref(null)
const abcCode = ref('')
const saving = ref(false)
const syntaxError = ref('')
const viewMode = ref('staff') // 'staff' | 'jianpu'
const visualObj = ref(null)
const activeNoteIds = ref([]) // IDs of notes currently playing
const measureIssues = ref([]) // 小节时值问题

let synthControl = null
// 建立 SVG 元素到 _myId 的映射
const elemToIdMap = new Map()

// Computed: 代码行
const codeLines = computed(() => abcCode.value.split('\n'))

// Computed: 错误行号集合（语法错误）
const errorLineNumbers = computed(() => new Set())

// Computed: 超限行号集合
const overflowLineNumbers = computed(() => {
  const lineNums = new Set()
  measureIssues.value
    .filter(i => i.status === 'overflow')
    .forEach(issue => {
      const lineNum = findMeasureLineNumber(issue.measureNumber)
      if (lineNum > 0) lineNums.add(lineNum)
    })
  return lineNums
})

// Computed: 不足行号集合  
const underflowLineNumbers = computed(() => {
  const lineNums = new Set()
  measureIssues.value
    .filter(i => i.status === 'underflow')
    .forEach(issue => {
      const lineNum = findMeasureLineNumber(issue.measureNumber)
      if (lineNum > 0) lineNums.add(lineNum)
    })
  return lineNums
})

// 根据小节号找到对应的行号
const findMeasureLineNumber = (measureNumber) => {
  const lines = abcCode.value.split('\n')
  let measureCount = 0
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // 跳过头部行（以字母: 开头）
    if (/^[A-Za-z]:/.test(line.trim())) continue
    // 跳过空行
    if (!line.trim()) continue
    
    // 计算这一行有多少个小节线
    const barMatches = line.match(/\|/g)
    if (barMatches) {
      const barCount = barMatches.length
      // 检查该小节是否在这一行
      if (measureCount + barCount >= measureNumber) {
        return i + 1 // 行号从1开始
      }
      measureCount += barCount
    }
  }
  return 0
}

// 处理来自 JianpuScore 的时值问题
const handleMeasureIssues = (issues) => {
  measureIssues.value = issues
}

// 处理点击音符跳转
const handleSeekToNote = (data) => {
  console.log('[Editor] handleSeekToNote 接收到:', data)
  
  if (!synthControl) {
    console.warn('[Editor] synthControl 未初始化')
    return
  }
  
  // data 包含 { noteId, timePercent, absoluteTime }
  // synthControl.seek 接受百分比 (0-1) 并需要指定 "percent" 作为单位
  if (data.timePercent !== undefined && data.timePercent >= 0 && data.timePercent <= 1) {
    console.log('[Editor] 执行 seek, timePercent:', data.timePercent)
    // 使用 "percent" 参数确保以百分比方式seek
    synthControl.seek(data.timePercent, "percent")
  } else {
    console.warn('[Editor] timePercent 无效:', data.timePercent)
  }
}

// 同步滚动
const syncScroll = () => {
  if (lineNumbersRef.value && textareaRef.value) {
    lineNumbersRef.value.scrollTop = textareaRef.value.scrollTop
  }
}

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

// Cursor Control Object - passed to synthControl.load()
const cursorControl = {
  onStart() {
    // Clear any existing highlights
    const els = document.querySelectorAll('.highlight-note')
    els.forEach(el => el.classList.remove('highlight-note'))
    activeNoteIds.value = []
  },
  onEvent(ev) {
    // Clear previous highlights
    const els = document.querySelectorAll('.highlight-note')
    els.forEach(el => el.classList.remove('highlight-note'))
    
    if (!ev) return; // End of tune
    
    // Highlight current elements
    if (ev.elements) {
      const newIds = [];
      ev.elements.forEach(elArray => {
        // ev.elements is an array of arrays
        if (!Array.isArray(elArray)) elArray = [elArray];
        
        elArray.forEach(domEl => {
          if (!domEl || !domEl.classList) return;
          
          // Staff mode: add class directly to SVG element
          if (viewMode.value === 'staff') {
            domEl.classList.add('highlight-note');
          }
          
          // Get the note ID from our mapping for Jianpu mode
          const noteId = elemToIdMap.get(domEl);
          if (noteId) {
            newIds.push(noteId);
          }
        });
      });
      activeNoteIds.value = newIds;
    }
  },
  onFinished() {
    const els = document.querySelectorAll('.highlight-note')
    els.forEach(el => el.classList.remove('highlight-note'))
    activeNoteIds.value = []
  }
}

const renderAbc = debounce(async () => {
  syntaxError.value = ''
  const audioContainer = document.querySelector("#audio")
  
  // 清空映射
  elemToIdMap.clear()
  
  try {
    // 1. 渲染乐谱
    const tune = abcjs.renderAbc("paper", abcCode.value, {
      responsive: "resize",
      add_classes: true,
      staffwidth: 800 
    })
    
    // Inject IDs into visual object for mapping and build SVG element map
    if (tune && tune[0]) {
       let uid = 0;
       tune[0].lines.forEach(line => {
           if (line.staff) {
               line.staff.forEach(staff => {
                   staff.voices.forEach(voice => {
                       voice.forEach(el => {
                           const myId = `note_${uid++}`
                           el._myId = myId
                           
                           // 建立 SVG 元素到 _myId 的映射
                           // abcjs 在每个元素上存储了 abselem，其中包含 SVG 元素引用
                           if (el.abselem && el.abselem.elemset) {
                             el.abselem.elemset.forEach(svgEl => {
                               if (svgEl) {
                                 elemToIdMap.set(svgEl, myId)
                               }
                             })
                           }
                       })
                   })
               })
           }
       })
       visualObj.value = tune[0]
    } else {
        visualObj.value = null
    }

    // 2. 检查是否生成了有效的乐谱对象
    if (!tune || !tune[0]) {
      console.warn("渲染未能生成有效的 Tune 对象")
      return
    }

    // 3. 初始化音频 (标准流程)
    if (abcjs.synth.supportsAudio()) {
      
      // A. 清理旧实例 (防止播放器重复堆叠)
      if (synthControl) {
        synthControl.disable(true)
      }
      
      // B. 创建控制器 UI (cursorControl 传递到这里!)
      synthControl = new abcjs.synth.SynthController()
      synthControl.load("#audio", cursorControl, {
        displayLoop: true,
        displayRestart: true,
        displayPlay: true,
        displayProgress: true,
        displayWarp: true
      })

      try {
        // C. 设置曲目
        await synthControl.setTune(tune[0], true, {
          chordsOff: true
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

onMounted(() => {
  fetchScore()
})

onUnmounted(() => {
  if (synthControl) {
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
  align-items: flex-start;
}

.pane {
  padding: 20px;
}

.left-pane {
  flex: 0 0 40%;
  border-right: 1px solid #ddd;
  display: flex;
  flex-direction: column;
  position: sticky;
  top: 60px;
  height: calc(100vh - 60px);
  overflow: hidden;
  background: #282c34;
  padding: 0;
}

.editor-wrapper {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.line-numbers {
  width: 45px;
  background: #21252b;
  color: #636d83;
  font-family: 'Fira Code', 'Consolas', monospace;
  font-size: 14px;
  line-height: 1.6;
  padding: 16px 8px;
  text-align: right;
  overflow: hidden;
  user-select: none;
  border-right: 1px solid #181a1f;
}

.line-number {
  height: 22.4px; /* 14px * 1.6 */
}

.line-number.error-line {
  background: rgba(255, 77, 79, 0.3);
  color: #ff4d4f;
  font-weight: bold;
}

.line-number.overflow-line {
  background: rgba(255, 77, 79, 0.25);
  color: #ff6b6b;
  font-weight: bold;
}

.line-number.underflow-line {
  background: rgba(250, 173, 20, 0.25);
  color: #ffc53d;
  font-weight: bold;
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
  padding-left: 12px;
  font-family: 'Fira Code', 'Consolas', monospace;
  font-size: 14px;
  line-height: 1.6;
  outline: none;
  background: #282c34;
  color: #abb2bf;
  overflow-y: auto;
}

.error-bar {
  background: #ffeded;
  color: #ff4d4f;
  padding: 8px 16px;
  font-size: 0.9rem;
  border-top: 1px solid #ffccc7;
}

.issue-bar {
  background: #fffbe6;
  color: #d48806;
  padding: 8px 16px;
  font-size: 0.85rem;
  border-top: 1px solid #ffe58f;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.issue-title {
  font-weight: bold;
  margin-right: 4px;
}

.issue-item {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.issue-item.overflow {
  background: rgba(255, 77, 79, 0.2);
  color: #ff4d4f;
}

.issue-item.underflow {
  background: rgba(250, 173, 20, 0.2);
  color: #d48806;
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
  min-height: 50px;
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

/* Note Highlighting for Staff View */
:deep(.highlight-note) {
  fill: #d03050 !important;
  stroke: #d03050 !important;
}
:deep(.highlight-note path) {
  fill: #d03050 !important;
  stroke: #d03050 !important;
}
:deep(g.highlight-note path) {
  fill: #d03050 !important;
  stroke: #d03050 !important;
}
</style>

<template>
  <div class="editor-container" :class="`layout-${layoutMode}`">
    <div class="header">
      <div class="left">
        <n-button secondary @click="$router.push('/library')">
          <template #icon><n-icon><ArrowBack /></n-icon></template>
          <span class="btn-text">返回列表</span>
        </n-button>
        <span class="title">{{ score ? score.title : 'Loading...' }}</span>
      </div>
      <div class="right">
        <n-button secondary @click="copyPrompt">
          <template #icon><n-icon><Copy /></n-icon></template>
          <span class="btn-text">复制提示词</span>
        </n-button>
        <n-select 
          v-model:value="currentInstrument" 
          :options="instrumentOptions" 
          size="small"
          style="width: 100px; margin-right: 8px;"
        />
        <n-button type="primary" @click="saveScore" :loading="saving">
          <template #icon><n-icon><Save /></n-icon></template>
          <span class="btn-text">保存并解析</span>
        </n-button>
        <div class="view-switcher">
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
      <div class="pane right-pane" ref="rightPaneRef">
        <div id="audio" class="audio-container"></div>
        <div id="paper" class="paper-container" v-show="viewMode === 'staff'"></div>
        <div 
          v-if="viewMode === 'jianpu' && visualObj" 
          class="score-wrapper" 
        >
          <JianpuScore 
            :tune="visualObj" 
            :active-note-ids="activeNoteIds"
            :debug-mode="true"
            @measure-issues="handleMeasureIssues"
            @seek-to-note="handleSeekToNote"
          />
        </div>
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
import { useMessage, NButton, NIcon, NSelect } from 'naive-ui'
import JianpuScore from '../components/JianpuScore.vue'
import { ArrowBack, Copy, Save } from '@vicons/ionicons5'
import { useUserStore } from '../stores/user'

const BREAKPOINT_MOBILE = 600
const BREAKPOINT_TABLET = 1024
const IDEAL_SCORE_WIDTH = 1100 // 约等于 4 小节一行的理想宽度

const route = useRoute()
const router = useRouter()
const message = useMessage()
const userStore = useUserStore()

// Editor refs
const textareaRef = ref(null)
const lineNumbersRef = ref(null)
const rightPaneRef = ref(null)

const scoreId = route.params.scoreId
const score = ref(null)
const abcCode = ref('')

const instrumentOptions = [
  { label: '钢琴', value: 0 },
  { label: '小提琴', value: 40 },
  { label: '长笛', value: 73 }
]
const currentInstrument = ref(0)

watch(currentInstrument, () => {
  renderAbc()
})
const saving = ref(false)
const syntaxError = ref('')
const viewMode = ref('staff') // 'staff' | 'jianpu'
const visualObj = ref(null)
const activeNoteIds = ref([]) // IDs of notes currently playing
const measureIssues = ref([]) // 小节时值问题

const layoutMode = ref('desktop') // desktop | tablet | mobile
const scoreScale = ref(1)

let synthControl = null
// 建立 SVG 元素到 _myId 的映射
const elemToIdMap = new Map()
// 建立 noteId 到 abcjs 原生时间信息的映射
const noteIdToTimingMap = new Map()

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
  
  // 尝试使用 abcjs 原生的 timing 信息
  const noteId = data.noteId
  const abcjsTiming = noteIdToTimingMap.get(noteId)
  
  if (abcjsTiming && abcjsTiming.midiPitches && abcjsTiming.midiPitches[0]) {
    // abcjs midiPitches 包含 start (秒) 和 duration (秒)
    const startTimeSeconds = abcjsTiming.midiPitches[0].start
    if (startTimeSeconds !== undefined) {
      console.log('[Editor] 使用 abcjs midiPitches.start:', startTimeSeconds)
      synthControl.seek(startTimeSeconds, "seconds")
      return
    }
  }
  
  // 回退到使用 timePercent
  if (data.timePercent !== undefined && data.timePercent >= 0 && data.timePercent <= 1) {
    console.log('[Editor] 回退使用 timePercent:', data.timePercent)
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
    // 构造包含乐器设置的 ABC 代码
    let codeToRender = abcCode.value
    // 尝试在 K: 字段后插入 MIDI program 指令，如果没有则插在最前面
    const kMatch = codeToRender.match(/^K:.*\n/m)
    if (kMatch) {
       const insertPos = kMatch.index + kMatch[0].length
       codeToRender = codeToRender.slice(0, insertPos) + `%%MIDI program ${currentInstrument.value}\n` + codeToRender.slice(insertPos)
    } else {
       codeToRender = `%%MIDI program ${currentInstrument.value}\n` + codeToRender
    }

    // 1. 渲染乐谱
    const tune = abcjs.renderAbc("paper", codeToRender, {
      responsive: "resize",
      add_classes: true,
      staffwidth: 800 
    })
    
    // Inject IDs into visual object for mapping and build SVG element map
    if (tune && tune[0]) {
       let uid = 0;
       noteIdToTimingMap.clear() // 清空旧映射
       
       tune[0].lines.forEach(line => {
           if (line.staff) {
               line.staff.forEach(staff => {
                   staff.voices.forEach(voice => {
                       voice.forEach(el => {
                           const myId = `note_${uid++}`
                           el._myId = myId
                           
                           // 保存 abcjs 的 timing 信息，用于点击跳转
                           if (el.midiPitches || el.startTiming !== undefined) {
                             noteIdToTimingMap.set(myId, {
                               midiPitches: el.midiPitches,
                               startTiming: el.startTiming,
                               duration: el.duration
                             })
                           }
                           
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
          chordsOff: true,
          soundFontUrl: "/soundfonts/FluidR3_GM/"
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

const copyPrompt = async () => {
  const promptText = `You are a professional music transcriber specializing in converting Chinese Numbered Musical Notation (Jianpu) into ABC Notation.
Your task is to extract both the musical notes and the lyrics from the provided image and output strict ABC Notation code.
Rules:
Header:
Extract Title (T:), Composer (C:), Key (K:), Meter (M:), and Tempo (Q:).
If tempo is not specified, default to Q:1/4=120.
If composer is unknown, omit C:.
Key Mapping (CRITICAL):
Although the image may say "1=G" or "1=Bb", ALWAYS set the Key to K:C in the output.
Treat the Jianpu numbers 1, 2, 3 directly as C, D, E. This is to ensure direct mapping.
Note Mapping:
Jianpu '1' -> ABC 'C'
Jianpu '2' -> ABC 'D'
Jianpu '3' -> ABC 'E'
Jianpu '4' -> ABC 'F', '5' -> 'G', '6' -> 'A', '7' -> 'B'.
Jianpu '0' -> ABC 'z' (Rest).
Octaves & Durations:
High Octave: Number with dot above -> lowercase (e.g., c, d).
Low Octave: Number with dot below -> Uppercase with comma (e.g., C,, D,).
Rhythm: Ensure the duration of notes matches the underlines and dots in the image.
Formatting:
Use | for bar lines.
Ensure the total duration of notes in each bar matches the Meter (M:).
Break lines logically (e.g., every 4 bars).
Lyrics (w:) - NEW REQUIREMENT:
You MUST transcribe the Chinese lyrics found below the staff.
Placement: Insert a w: line immediately below each line of note code it corresponds to. Do not group all lyrics at the end.
Alignment:
Separate every single Chinese character with a space (e.g., w: 我 爱 北 京).
This ensures one character aligns with one note.
Melisma: If a character extends over multiple notes (slurs), use _ or spaces correctly, but prioritizing "Space-separated characters" is usually safest for alignment.
Skip Rests: Do not put lyrics under z (rests).
Output Structure Example:
T: Title
M: 4/4
L: 1/8
K: C
C2 D2 E2 C2 | E2 F2 G4 |
w: 两 只 老 虎 跑 得 快
G2 A2 G2 F2 | E2 C2 C4 |
w: 真 的 非 常 奇 怪 _
Output Format:
Return ONLY the ABC code block. Do not provide explanations.`

  try {
    await navigator.clipboard.writeText(promptText)
    message.success('提示词已复制到剪贴板！请使用豆包上传简谱图片，将得到的乐谱粘贴到编辑器中')
  } catch (error) {
    // 降级方案：使用传统方法
    const textArea = document.createElement('textarea')
    textArea.value = promptText
    textArea.style.position = 'fixed'
    textArea.style.opacity = '0'
    document.body.appendChild(textArea)
    textArea.select()
    try {
      document.execCommand('copy')
      message.success('提示词已复制到剪贴板！请使用豆包上传简谱，将得到的乐谱粘贴到编辑器中')
    } catch (err) {
      message.error('复制失败，请手动复制')
    }
    document.body.removeChild(textArea)
  }
}

onMounted(() => {
  fetchScore()
  initResizeObserver()
})

onUnmounted(() => {
  if (synthControl) {
    synthControl = null
  }
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
})

// ========== 自适应布局与缩放 ==========
let resizeObserver = null

const updateLayoutMode = (width) => {
  if (width <= BREAKPOINT_MOBILE) {
    layoutMode.value = 'mobile'
  } else if (width <= BREAKPOINT_TABLET) {
    layoutMode.value = 'tablet'
  } else {
    layoutMode.value = 'desktop'
  }
}

const initResizeObserver = () => {
  if (!rightPaneRef.value) return
  resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      const w = entry.contentRect.width
      updateLayoutMode(w)
    }
  })
  resizeObserver.observe(rightPaneRef.value)
}
</script>

<style scoped>
/* Base Styles (Mobile First) */
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
  padding: 0 0.5rem;
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.left, .right {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.btn-text {
  display: none;
}

.view-switcher {
  margin-left: 0.25rem;
  display: inline-flex;
  gap: 2px;
}

.title {
  font-weight: bold;
  font-size: 1.1rem;
  display: none; /* Hide title on small screens to save space */
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column; /* Stack vertically on mobile */
  align-items: stretch;
}

.pane {
  padding: 2px;
}

/* Left Pane (Editor) - Mobile: Top part, scrollable but limited height */
.left-pane {
  flex: 0 0 auto;
  height: 40vh; /* Fixed height on mobile */
  border-bottom: 1px solid #ddd;
  display: flex;
  flex-direction: column;
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
  width: 2.8rem;
  background: #21252b;
  color: #636d83;
  font-family: 'Fira Code', 'Consolas', monospace;
  font-size: 0.875rem; /* 14px */
  line-height: 1.6;
  padding: 1rem 0.5rem;
  text-align: right;
  overflow: hidden;
  user-select: none;
  border-right: 1px solid #181a1f;
}

.line-number {
  height: 1.4rem; /* 14px * 1.6 */
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

.code-editor {
  flex: 1;
  width: 100%;
  min-height: 100%;
  resize: none;
  border: none;
  padding: 1rem;
  padding-left: 0.75rem;
  font-family: 'Fira Code', 'Consolas', monospace;
  font-size: 0.875rem;
  line-height: 1.6;
  outline: none;
  background: #282c34;
  color: #abb2bf;
  overflow-y: auto;
}

.error-bar {
  background: #ffeded;
  color: #ff4d4f;
  padding: 0.5rem 1rem;
  font-size: 0.9rem;
  border-top: 1px solid #ffccc7;
}

.issue-bar {
  background: #fffbe6;
  color: #d48806;
  padding: 0.5rem 1rem;
  font-size: 0.85rem;
  border-top: 1px solid #ffe58f;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.issue-title {
  font-weight: bold;
  margin-right: 0.25rem;
}

.issue-item {
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
}

.issue-item.overflow {
  background: rgba(255, 77, 79, 0.2);
  color: #ff4d4f;
}

.issue-item.underflow {
  background: rgba(250, 173, 20, 0.2);
  color: #d48806;
}

/* Right Pane (Preview) - Mobile: Bottom part, takes remaining space */
.right-pane {
  flex: 1;
  background: #fff;
  display: flex;
  flex-direction: column;
  overflow-x: hidden; /* Prevent horizontal scroll of the pane itself */
  min-height: 50vh;
}

.score-wrapper {
  width: 100%;
  overflow-x: auto; /* Allow score to scroll horizontally if needed */
}

.paper-container {
  flex: 1;
  margin-top: 1.25rem;
}

.audio-container {
  padding: 0.625rem;
  background: #f9f9f9;
  border-radius: 8px;
  margin-bottom: 0.625rem;
  min-height: 3.125rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.error-msg {
  color: #d03050;
  font-size: 0.75rem;
  padding: 0.625rem;
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

/* Tablet Breakpoint (>= 768px) */
@media (min-width: 768px) {
  .header {
    padding: 0 1rem;
  }

  .left, .right {
    gap: 0.75rem;
  }

  .btn-text {
    display: inline;
  }

  .view-switcher {
    margin-left: 0.5rem;
    gap: 5px;
  }

  .title {
    display: block;
  }
  
  .main-content {
    flex-direction: row; /* Side by side */
  }
  
  .left-pane {
    flex: 0 0 45%; /* 45% width */
    height: calc(100vh - 60px); /* Full height minus header */
    border-bottom: none;
    border-right: 1px solid #ddd;
    position: sticky;
    top: 60px;
  }
  
  .right-pane {
    flex: 1;
    height: auto;
    min-height: calc(100vh - 60px);
    padding: 1rem;
  }
}

/* Desktop Breakpoint (>= 1200px) */
@media (min-width: 1200px) {
  .left-pane {
    flex: 0 0 40%; /* 40% width */
  }
}
</style>

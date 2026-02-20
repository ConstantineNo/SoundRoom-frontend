<template>
  <div class="fanqie-editor">
    <div class="toolbar">
      <h3>番茄简谱编辑器</h3>
    </div>
    
    <div class="main-content">
      <!-- Left: Text Editor -->
      <div class="editor-pane">
        <textarea 
          ref="editorRef"
          v-model="sourceCode" 
          class="code-editor"
          spellcheck="false"
        ></textarea>
        <div class="status-bar" v-if="parseResult">
          <span v-if="parseResult.errors.length === 0" class="success">解析成功</span>
          <span v-else class="error">包含 {{ parseResult.errors.length }} 个错误</span>
        </div>
        <div class="error-list" v-if="parseResult && (parseResult.errors.length > 0 || parseResult.warnings.length > 0)">
           <div v-for="(err, i) in parseResult.errors" :key="'e'+i" class="error-item error">
             Error Line {{ err.line }}: {{ err.message }}
           </div>
           <div v-for="(warn, i) in parseResult.warnings" :key="'w'+i" class="error-item warning">
             Warning Line {{ warn.line }}: {{ warn.message }}
           </div>
        </div>
      </div>

      <!-- Right: Preview -->
      <div class="preview-pane">
        <div class="preview-scroll">
           <FanqieScore v-if="parseResult && parseResult.score" :score="parseResult.score" @note-click="handleNoteClick" />
        </div>
        
        <!-- Audio Control -->
        <div class="audio-control-bar">
           <div id="audio-container"></div>
        </div>
      </div>
    </div>

    <!-- Hidden ABC Container for Audio Generation -->
    <div id="hidden-abc-container" style="display: none;"></div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { parseFanqie } from '../fanqie/parser/index'
import { fanqieToAbc } from '../fanqie/converter/toAbc'
import FanqieScore from '../fanqie/renderer/FanqieScore.vue'
import { useAbcPlayer } from '../composables/useAbcPlayer'
import abcjs from 'abcjs'

const sourceCode = ref(`V: 1.0
B: 测试曲目
D: C
P: 4/4
J: 120

Q: 1[2] 2[3/2/] 3[h2] 4[h3/2/] | 5 6 7 1' | 5 - - - |]
C: do re mi fa sol la si do woo
`)

const parseResult = ref(null)
const abcString = ref('')
const visualObjRef = ref(null)
const editorRef = ref(null)

// Audio Player integration
const { initAudio } = useAbcPlayer(visualObjRef)

const updateScore = () => {
    // 1. Parse Fanqie -> AST
    const result = parseFanqie(sourceCode.value)
    parseResult.value = result

    if (result.errors.length === 0 && result.score) {
        // 2. Convert to ABC
        const abc = fanqieToAbc(result.score)
        abcString.value = abc
        
        // 3. Render ABC (Hidden) to get visualObj for Audio
        // We need DOM element to be ready
        const hiddenEl = document.getElementById('hidden-abc-container')
        if (hiddenEl) {
             const visualObjs = abcjs.renderAbc(hiddenEl, abc, {
                 responsive: 'resize'
             })
             if (visualObjs && visualObjs.length > 0) {
                 visualObjRef.value = visualObjs[0]
                 
                 // Re-init audio with new tune
                 // initAudio handles synthControl internally
                 // We might need to call it again or synthControl has a setTune?
                 // useAbcPlayer exposes initAudio which creates controller and calls setTune.
                 // So calling initAudio again should work or we might need to expose setTune?
                 // Checking useAbcPlayer: calling initAudio detects existing control and cleans it up?
                 // No, useAbcPlayer logic: if (synthControl) { disable... } new Controller.
                 // So calling initAudio again is safe (re-mounts).
                 // Ideally we keep controller and just setTune.
                 // But useAbcPlayer is simple wrapper. Let's try re-init.
                 
                 initAudio('#audio-container')
             }
        }
    }
}

watch(sourceCode, () => {
    updateScore()
})

onMounted(() => {
    updateScore()
})

/**
 * 点击简谱音符时，将编辑器光标定位到对应源码位置
 */
const handleNoteClick = ({ line, column }) => {
  const textarea = editorRef.value
  if (!textarea) return

  const text = sourceCode.value
  const lines = text.split('\n')

  // 计算字符偏移量（line 和 column 都是 1-based）
  let offset = 0
  for (let i = 0; i < line - 1 && i < lines.length; i++) {
    // +1 for the \n character (handle \r\n by checking original text)
    offset += lines[i].length + 1
  }
  // tokenizer 的 column 是 0-based（makeToken: this.column - value.length）
  offset += Math.max(0, column)

  // 确保 offset 不超过文本长度
  offset = Math.min(offset, text.length)

  // 设置光标位置并聚焦
  textarea.focus()
  textarea.setSelectionRange(offset, offset)

  // 滚动到光标可见位置
  // 简单方法：使用 scrollTop 估算
  const lineHeight = 20 // 大约行高
  const targetScrollTop = (line - 1) * lineHeight - textarea.clientHeight / 2
  textarea.scrollTop = Math.max(0, targetScrollTop)
}

</script>

<style scoped>
.fanqie-editor {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.toolbar {
  padding: 10px 20px;
  background: #f5f5f5;
  border-bottom: 1px solid #ddd;
}

.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.editor-pane {
  width: 35%;
  border-right: 1px solid #ddd;
  display: flex;
  flex-direction: column;
}

#hidden-abc-container {
  display: none !important;
  height: 0;
  width: 0;
  overflow: hidden;
}

.code-editor {
  flex: 1;
  padding: 10px;
  font-family: monospace;
  font-size: 14px;
  resize: none;
  border: none;
  outline: none;
}

.status-bar {
    padding: 5px 10px;
    font-size: 12px;
    border-top: 1px solid #eee;
}
.success { color: green; }
.error { color: red; }
.warning { color: orange; }

.error-list {
    max-height: 100px;
    overflow-y: auto;
    background: #fff0f0;
    padding: 5px;
    font-size: 12px;
}

.preview-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #fafafa;
}

.preview-scroll {
    flex: 1;
    overflow: auto;
    display: flex;
    justify-content: center;
    padding: 20px;
}

.audio-control-bar {
    padding: 10px;
    background: white;
    border-top: 1px solid #ddd;
}
</style>

<!-- src/components/Score/KaraokeRenderer.vue -->
<!-- 卡拉OK风格简谱显示组件：同时只显示两行，自动滚动 -->
<template>
  <div class="karaoke-container" ref="containerRef">
    <!-- 控制栏 -->
    <div class="karaoke-controls">
      <div class="control-item">
        <label>每行小节数</label>
        <div class="stepper">
          <button @click="decreaseMeasuresPerLine" :disabled="measuresPerLine <= 1">−</button>
          <span class="stepper-value">{{ measuresPerLine }}</span>
          <button @click="increaseMeasuresPerLine" :disabled="measuresPerLine >= 8">+</button>
        </div>
      </div>
      <div class="progress-info" v-if="totalMeasures > 0">
        <span class="current-measure">{{ currentMeasureDisplay }}</span>
        <span class="separator">/</span>
        <span class="total-measures">{{ totalMeasures }}</span>
      </div>
    </div>

    <!-- 双行简谱显示区 -->
    <div class="karaoke-display">
      <!-- 第一行：正在播放 -->
      <div class="karaoke-line current-line" :class="{ 'transitioning': isTransitioning }">
        <div class="line-indicator">
          <span class="indicator-dot playing"></span>
          <span class="indicator-text">正在播放</span>
        </div>
        <div class="line-content">
          <svg :width="lineWidth" :height="lineHeight" class="karaoke-svg">
            <g v-for="(measure, mIdx) in currentLineMeasures" :key="'cur-'+mIdx" 
               :transform="`translate(${measure.renderX}, 0)`">
              <!-- 小节内容渲染 -->
              <template v-if="measure">
                <!-- 小节号 -->
                <text class="measure-number" x="5" y="15">{{ measure.measureNumber }}</text>
                
                <!-- 连音线 (Ties) -->
                <path v-for="(tie, tIdx) in measure.ties" :key="'tie'+tIdx"
                      class="tie-path"
                      :d="getTiePath(tie)" />
                
                <!-- 圆滑线 (Slurs) -->
                <path v-for="(slur, sIdx) in measure.slurs" :key="'slur'+sIdx"
                      class="slur-path"
                      :d="getSlurPath(slur)" />
                
                <!-- 音符 -->
                <g v-for="(note, nIdx) in measure.notes" :key="nIdx"
                   :transform="`translate(${note.x}, 0)`"
                   :class="{ 'active-note': isNoteActive(note) }">
                  
                  <!-- 高亮背景 -->
                  <rect v-if="isNoteActive(note)" 
                        class="highlight-bg" 
                        :x="-5" :y="20" 
                        :width="(note.displayWidth || noteWidth) + 10" 
                        :height="50" />
                  
                  <!-- 倚音 -->
                  <g v-if="note.graceNotes && note.graceNotes.length > 0" 
                     class="grace-notes-group">
                    <g v-for="(grace, gIdx) in note.graceNotes" :key="'grace'+gIdx"
                       :transform="`translate(${-10 - (note.graceNotes.length - 1 - gIdx) * 12}, -5)`">
                      <!-- 倚音高八度点 -->
                      <template v-if="grace.highDots > 0">
                        <circle v-for="d in grace.highDots" :key="'gh'+d"
                                class="grace-octave-dot"
                                :cx="5" :cy="28 - (d-1)*4" r="1.5" />
                      </template>
                      <!-- 倚音变音记号 -->
                      <text v-if="grace.accidental" class="grace-accidental" x="-2" y="38">{{ grace.accidental }}</text>
                      <!-- 倚音数字 -->
                      <text class="grace-note-number" x="5" y="38">{{ grace.number }}</text>
                      <!-- 倚音低八度点 -->
                      <template v-if="grace.lowDots > 0">
                        <circle v-for="d in grace.lowDots" :key="'gl'+d"
                                class="grace-octave-dot"
                                :cx="5" :cy="44 + (d-1)*4" r="1.5" />
                      </template>
                      <!-- 倚音下划线 -->
                      <template v-if="grace.underlines > 0">
                        <line v-for="u in grace.underlines" :key="'gu'+u"
                              class="grace-underline"
                              :x1="0" :y1="44 + (u-1)*3"
                              :x2="10" :y2="44 + (u-1)*3" />
                      </template>
                    </g>
                  </g>
                  
                  <!-- 高八度点 -->
                  <template v-if="note.highDots > 0">
                    <circle v-for="d in note.highDots" :key="'h'+d" 
                            class="octave-dot" 
                            :cx="noteWidth / 2" 
                            :cy="28 - (d-1)*6" r="2.5" />
                  </template>
                  
                  <!-- 变音记号 -->
                  <text v-if="note.accidental" class="accidental" :x="-2" y="48">{{ note.accidental }}</text>
                  
                  <!-- 音符数字 -->
                  <text class="note-number" :class="{ 'is-rest': note.isRest }" 
                        :x="noteWidth / 2" y="50">{{ note.number }}</text>
                  
                  <!-- 低八度点 -->
                  <template v-if="note.lowDots > 0">
                    <circle v-for="d in note.lowDots" :key="'l'+d" 
                            class="octave-dot" 
                            :cx="noteWidth / 2" 
                            :cy="58 + (d-1)*6" r="2.5" />
                  </template>
                  
                  <!-- 下划线（减时线） -->
                  <template v-if="!note.hasBeam && note.underlines > 0">
                    <line v-for="u in note.underlines" :key="'u'+u" 
                          class="underline" 
                          :x1="4" :y1="58 + (u-1)*5" 
                          :x2="noteWidth - 4" :y2="58 + (u-1)*5" />
                  </template>
                  
                  <!-- 附点 -->
                  <circle v-if="note.augDot && !note.isRest" 
                          class="aug-dot" 
                          :cx="noteWidth - 2" :cy="42" r="2.5"/>
                  
                  <!-- 延音线 -->
                  <template v-if="note.dashes > 0 && !note.isRest">
                    <g v-for="d in note.dashes" :key="'d'+d"
                       :transform="`translate(${d * noteWidth}, 0)`">
                      <line class="dash" :x1="4" :y1="42" :x2="noteWidth - 4" :y2="42" />
                    </g>
                  </template>
                </g>
                
                <!-- 小节线 -->
                <line class="bar-line" 
                      :x1="measureRenderWidth - 5" y1="25" 
                      :x2="measureRenderWidth - 5" y2="65" />
              </template>
            </g>
          </svg>
        </div>
      </div>

      <!-- 第二行：等待播放 -->
      <div class="karaoke-line next-line" :class="{ 'ready': !isTransitioning }">
        <div class="line-indicator">
          <span class="indicator-dot waiting"></span>
          <span class="indicator-text">等待播放</span>
        </div>
        <div class="line-content">
          <svg :width="lineWidth" :height="lineHeight" class="karaoke-svg">
            <g v-for="(measure, mIdx) in nextLineMeasures" :key="'next-'+mIdx" 
               :transform="`translate(${measure.renderX}, 0)`">
              <template v-if="measure">
                <!-- 小节号 -->
                <text class="measure-number" x="5" y="15">{{ measure.measureNumber }}</text>
                
                <!-- 连音线 (Ties) -->
                <path v-for="(tie, tIdx) in measure.ties" :key="'tie'+tIdx"
                      class="tie-path"
                      :d="getTiePath(tie)" />
                
                <!-- 圆滑线 (Slurs) -->
                <path v-for="(slur, sIdx) in measure.slurs" :key="'slur'+sIdx"
                      class="slur-path"
                      :d="getSlurPath(slur)" />
                
                <!-- 音符 -->
                <g v-for="(note, nIdx) in measure.notes" :key="nIdx"
                   :transform="`translate(${note.x}, 0)`">
                  
                  <!-- 倚音 -->
                  <g v-if="note.graceNotes && note.graceNotes.length > 0" 
                     class="grace-notes-group">
                    <g v-for="(grace, gIdx) in note.graceNotes" :key="'grace'+gIdx"
                       :transform="`translate(${-10 - (note.graceNotes.length - 1 - gIdx) * 12}, -5)`">
                      <!-- 倚音高八度点 -->
                      <template v-if="grace.highDots > 0">
                        <circle v-for="d in grace.highDots" :key="'gh'+d"
                                class="grace-octave-dot"
                                :cx="5" :cy="28 - (d-1)*4" r="1.5" />
                      </template>
                      <!-- 倚音变音记号 -->
                      <text v-if="grace.accidental" class="grace-accidental" x="-2" y="38">{{ grace.accidental }}</text>
                      <!-- 倚音数字 -->
                      <text class="grace-note-number" x="5" y="38">{{ grace.number }}</text>
                      <!-- 倚音低八度点 -->
                      <template v-if="grace.lowDots > 0">
                        <circle v-for="d in grace.lowDots" :key="'gl'+d"
                                class="grace-octave-dot"
                                :cx="5" :cy="44 + (d-1)*4" r="1.5" />
                      </template>
                      <!-- 倚音下划线 -->
                      <template v-if="grace.underlines > 0">
                        <line v-for="u in grace.underlines" :key="'gu'+u"
                              class="grace-underline"
                              :x1="0" :y1="44 + (u-1)*3"
                              :x2="10" :y2="44 + (u-1)*3" />
                      </template>
                    </g>
                  </g>
                  
                  <!-- 高八度点 -->
                  <template v-if="note.highDots > 0">
                    <circle v-for="d in note.highDots" :key="'h'+d" 
                            class="octave-dot" 
                            :cx="noteWidth / 2" 
                            :cy="28 - (d-1)*6" r="2.5" />
                  </template>
                  
                  <!-- 变音记号 -->
                  <text v-if="note.accidental" class="accidental" :x="-2" y="48">{{ note.accidental }}</text>
                  
                  <!-- 音符数字 -->
                  <text class="note-number" :class="{ 'is-rest': note.isRest }" 
                        :x="noteWidth / 2" y="50">{{ note.number }}</text>
                  
                  <!-- 低八度点 -->
                  <template v-if="note.lowDots > 0">
                    <circle v-for="d in note.lowDots" :key="'l'+d" 
                            class="octave-dot" 
                            :cx="noteWidth / 2" 
                            :cy="58 + (d-1)*6" r="2.5" />
                  </template>
                  
                  <!-- 下划线 -->
                  <template v-if="!note.hasBeam && note.underlines > 0">
                    <line v-for="u in note.underlines" :key="'u'+u" 
                          class="underline" 
                          :x1="4" :y1="58 + (u-1)*5" 
                          :x2="noteWidth - 4" :y2="58 + (u-1)*5" />
                  </template>
                  
                  <!-- 附点 -->
                  <circle v-if="note.augDot && !note.isRest" 
                          class="aug-dot" 
                          :cx="noteWidth - 2" :cy="42" r="2.5"/>
                  
                  <!-- 延音线 -->
                  <template v-if="note.dashes > 0 && !note.isRest">
                    <g v-for="d in note.dashes" :key="'d'+d"
                       :transform="`translate(${d * noteWidth}, 0)`">
                      <line class="dash" :x1="4" :y1="42" :x2="noteWidth - 4" :y2="42" />
                    </g>
                  </template>
                </g>
                
                <!-- 小节线 -->
                <line class="bar-line" 
                      :x1="measureRenderWidth - 5" y1="25" 
                      :x2="measureRenderWidth - 5" y2="65" />
              </template>
            </g>
          </svg>
        </div>
      </div>
    </div>

    <!-- 曲谱信息 -->
    <div class="karaoke-footer" v-if="tune">
      <div class="song-info">
        <span class="key-signature" v-if="keyDisplay">1={{ keyDisplay }}</span>
        <span class="time-signature" v-if="meterDisplay">{{ meterDisplay }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  tune: { type: Object, default: null },
  activeNoteIds: { type: Array, default: () => [] },
  targetKey: { type: String, default: '' },
  playbackTime: { type: Number, default: 0 }
})

const emit = defineEmits(['seek-to-note'])

// 响应式状态
const containerRef = ref(null)
const measuresPerLine = ref(2)
const currentLineIndex = ref(0)
const isTransitioning = ref(false)
const containerWidth = ref(800)

// 布局常量
const noteWidth = 32
const measurePadding = 30
const lineHeight = 110  // 增加高度以容纳倚音和圆滑线

// 计算每个小节的渲染宽度
const measureRenderWidth = computed(() => {
  const availableWidth = containerWidth.value - 60
  return Math.floor(availableWidth / measuresPerLine.value)
})

const lineWidth = computed(() => containerWidth.value - 40)

// 活动音符集合
const activeIds = computed(() => new Set(props.activeNoteIds))

// 检查音符是否激活
const isNoteActive = (note) => {
  return activeIds.value.has(note.id) || activeIds.value.has(note.originalId)
}

// 解析调号显示
const keyDisplay = computed(() => {
  if (props.targetKey) {
    const map = {
      '降B': '♭B', '降E': '♭E', '降A': '♭A', '降D': '♭D', '降G': '♭G',
      '升F': '#F', '升C': '#C', '升G': '#G', '升D': '#D', '升A': '#A',
      'Bb': '♭B', 'Eb': '♭E', 'Ab': '♭A', 'Db': '♭D', 'Gb': '♭G',
      'F#': '#F', 'C#': '#C', 'G#': '#G', 'D#': '#D', 'A#': '#A'
    }
    return map[props.targetKey] || props.targetKey
  }
  const k = props.tune?.lines?.[0]?.staff?.[0]?.key
  if (!k) return 'C'
  let s = k.root || 'C'
  if (k.acc === 'sharp') s += '#'
  if (k.acc === 'flat') s += '♭'
  return s
})

const meterDisplay = computed(() => {
  const m = props.tune?.lines?.[0]?.staff?.[0]?.meter
  if (!m) return null
  if (m.type === 'specified' && m.value?.[0]) return `${m.value[0].num}/${m.value[0].den}`
  if (m.type === 'common_time') return '4/4'
  return null
})

// 音高转换常量
const KEY_ROOT_PITCH = { 'C': 0, 'D': 1, 'E': 2, 'F': 3, 'G': 4, 'A': 5, 'B': 6 }
const ACCIDENTAL_SYMBOLS = { 'sharp': '♯', 'flat': '♭', 'natural': '♮' }

const pitchToJianpu = (diatonicPitch, keyRootPitch) => {
  let rel = diatonicPitch - keyRootPitch
  let octave = 0
  while (rel < 0) { rel += 7; octave-- }
  while (rel >= 7) { rel -= 7; octave++ }
  return { number: rel + 1, octave }
}

const getKeyRootPitch = (keyObj) => {
  if (!keyObj?.root) return 0
  return KEY_ROOT_PITCH[keyObj.root.toUpperCase()] || 0
}

// 时值信息
const getDurationInfo = (duration, isRest = false) => {
  const ratio = duration / 0.25
  let dashes = 0, underlines = 0, augDot = false
  
  if (isRest) {
    if (ratio < 0.99) {
      if (ratio <= 0.51) underlines = 1
      if (ratio <= 0.26) underlines = 2
      if (ratio <= 0.13) underlines = 3
    }
    return { dashes: 0, underlines, augDot: false }
  }
  
  if (Math.abs(ratio - 1.5) < 0.05) { augDot = true; dashes = 0 }
  else if (Math.abs(ratio - 0.75) < 0.05) { underlines = 1; augDot = true }
  else if (Math.abs(ratio - 3) < 0.05) { dashes = 2; augDot = false }
  else if (Math.abs(ratio - 0.375) < 0.05) { underlines = 2; augDot = true }
  else if (Math.abs(ratio - 2) < 0.05) { dashes = 1; augDot = false }
  else if (Math.abs(ratio - 4) < 0.05) { dashes = 3; augDot = false }
  else if (ratio > 1) { dashes = Math.round(ratio) - 1; augDot = false }
  else if (ratio < 0.99) {
    if (ratio <= 0.51) underlines = 1
    if (ratio <= 0.26) underlines = 2
    if (ratio <= 0.13) underlines = 3
  }
  
  return { dashes, underlines, augDot }
}

// 计算音符宽度
const getNoteDisplayWidth = (note) => {
  let width = noteWidth
  if (note.dashes > 0) {
    width += note.dashes * noteWidth
  }
  return width
}

// 解析所有小节
const allMeasures = computed(() => {
  if (!props.tune?.lines) return []
  
  let keyRoot = 0
  const measures = []
  let currentMeasure = { notes: [], ties: [], slurs: [], totalDuration: 0, measureNumber: 0 }
  let measureIndex = 0
  let beatPosition = 0
  let pendingTie = null
  let slurStartInfo = null
  let inSlur = false
  
  props.tune.lines.forEach(line => {
    if (!line.staff) return
    line.staff.forEach(staff => {
      if (staff.key) keyRoot = getKeyRootPitch(staff.key)
      staff.voices.forEach(voice => {
        voice.forEach(el => {
          const elId = el._myId || null
          
          if (el.el_type === 'bar') {
            if (currentMeasure.notes.length > 0) {
              measureIndex++
              currentMeasure.measureNumber = measureIndex
              
              // 布局音符位置
              layoutMeasureNotes(currentMeasure)
              
              measures.push({ ...currentMeasure })
            }
            currentMeasure = { notes: [], ties: [], slurs: [], totalDuration: 0, measureNumber: 0 }
            beatPosition = 0
            
          } else if (el.el_type === 'note') {
            const duration = el.duration || 0.25
            
            // 解析倚音
            let graceNotesData = []
            if (el.gracenotes && el.gracenotes.length > 0) {
              graceNotesData = el.gracenotes.map((grace) => {
                const graceData = pitchToJianpu(grace.pitch, keyRoot)
                const graceDuration = grace.duration || 0.0625
                let graceUnderlines = 2
                if (graceDuration >= 0.125) graceUnderlines = 1
                if (graceDuration < 0.0625) graceUnderlines = 3
                
                return {
                  number: graceData.number,
                  highDots: graceData.octave > 0 ? graceData.octave : 0,
                  lowDots: graceData.octave < 0 ? Math.abs(graceData.octave) : 0,
                  accidental: grace.accidental ? (ACCIDENTAL_SYMBOLS[grace.accidental] || null) : null,
                  underlines: graceUnderlines
                }
              })
            }
            
            if (el.rest) {
              const rhythm = getDurationInfo(duration, true)
              currentMeasure.notes.push({
                id: elId,
                originalId: elId,
                number: 0,
                isRest: true,
                highDots: 0,
                lowDots: 0,
                accidental: null,
                ...rhythm,
                duration: duration,
                relativeStartTime: beatPosition,
                graceNotes: null
              })
              beatPosition += duration
              currentMeasure.totalDuration += duration
              
            } else if (el.pitches?.[0]) {
              const p = el.pitches[0]
              const jData = pitchToJianpu(p.pitch, keyRoot)
              const rhythm = getDurationInfo(duration, false)
              
              const noteObj = {
                id: elId,
                originalId: elId,
                number: jData.number,
                isRest: false,
                highDots: jData.octave > 0 ? jData.octave : 0,
                lowDots: jData.octave < 0 ? Math.abs(jData.octave) : 0,
                accidental: p.accidental ? (ACCIDENTAL_SYMBOLS[p.accidental] || null) : null,
                ...rhythm,
                duration: duration,
                pitch: p.pitch,
                relativeStartTime: beatPosition,
                graceNotes: graceNotesData.length > 0 ? graceNotesData : null,
                hasTieStart: !!(p.startTie || el.startTie),
                hasTieEnd: !!(p.endTie || el.endTie),
                hasSlurStart: !!(p.startSlur || el.startSlur),
                hasSlurEnd: !!(p.endSlur || el.endSlur)
              }
              
              const noteIndex = currentMeasure.notes.length
              currentMeasure.notes.push(noteObj)
              beatPosition += duration
              currentMeasure.totalDuration += duration
              
              // Tie 逻辑
              if (pendingTie && pendingTie.pitch === noteObj.pitch) {
                currentMeasure.ties.push({ startIdx: pendingTie.noteIdx, endIdx: noteIndex })
                pendingTie = null
              }
              if (noteObj.hasTieStart) {
                pendingTie = { noteIdx: noteIndex, pitch: noteObj.pitch }
              }
              
              // Slur 逻辑
              if (noteObj.hasSlurStart) {
                inSlur = true
                slurStartInfo = { noteIdx: noteIndex }
              }
              if (noteObj.hasSlurEnd && inSlur && slurStartInfo) {
                currentMeasure.slurs.push({ startIdx: slurStartInfo.noteIdx, endIdx: noteIndex })
                inSlur = false
                slurStartInfo = null
              }
            }
          }
        })
      })
    })
  })
  
  // 处理最后一个小节
  if (currentMeasure.notes.length > 0) {
    measureIndex++
    currentMeasure.measureNumber = measureIndex
    layoutMeasureNotes(currentMeasure)
    measures.push({ ...currentMeasure })
  }
  
  return measures
})

// 布局小节内音符
const layoutMeasureNotes = (measure) => {
  let currentX = measurePadding
  measure.notes.forEach(note => {
    note.displayWidth = getNoteDisplayWidth(note)
    note.x = currentX
    currentX += note.displayWidth + 8
  })
  
  // 更新 tie/slur 坐标
  measure.ties.forEach(tie => {
    const startNote = measure.notes[tie.startIdx]
    const endNote = measure.notes[tie.endIdx]
    if (startNote && endNote) {
      tie.startX = startNote.x + noteWidth / 2
      tie.endX = endNote.x + noteWidth / 2
    }
  })
  
  measure.slurs.forEach(slur => {
    const startNote = measure.notes[slur.startIdx]
    const endNote = measure.notes[slur.endIdx]
    if (startNote && endNote) {
      slur.startX = startNote.x + noteWidth / 2
      slur.endX = endNote.x + noteWidth / 2
    }
  })
}

// 获取倚音组下划线数量
const getGraceUnderlineCount = (graceNotes) => {
  if (!graceNotes || graceNotes.length === 0) return 0
  return Math.max(...graceNotes.map(g => g.underlines || 0))
}

// 连音线路径
const getTiePath = (tie) => {
  if (!tie.startX || !tie.endX) return ''
  const x1 = tie.startX
  const x2 = tie.endX
  const y = 25
  const midX = (x1 + x2) / 2
  const distance = Math.abs(x2 - x1)
  const h = Math.min(10, Math.max(5, distance * 0.12))
  const thickness = 1.5
  return `M ${x1} ${y} Q ${midX} ${y - h} ${x2} ${y} Q ${midX} ${y - h + thickness} ${x1} ${y} Z`
}

// 圆滑线路径
const getSlurPath = (slur) => {
  if (!slur.startX || !slur.endX) return ''
  const x1 = slur.startX
  const x2 = slur.endX
  const y = 20
  const midX = (x1 + x2) / 2
  const distance = Math.abs(x2 - x1)
  const h = Math.min(12, Math.max(6, distance * 0.15))
  const thickness = 1.5
  return `M ${x1} ${y} Q ${midX} ${y - h} ${x2} ${y} Q ${midX} ${y - h + thickness} ${x1} ${y} Z`
}

const totalMeasures = computed(() => allMeasures.value.length)

// 当前播放的小节显示
const currentMeasureDisplay = computed(() => {
  const startIdx = currentLineIndex.value * measuresPerLine.value
  return Math.min(startIdx + 1, totalMeasures.value)
})

// 当前行的小节
const currentLineMeasures = computed(() => {
  const startIdx = currentLineIndex.value * measuresPerLine.value
  const endIdx = startIdx + measuresPerLine.value
  const measures = allMeasures.value.slice(startIdx, endIdx)
  
  // 添加渲染位置
  return measures.map((m, idx) => ({
    ...m,
    renderX: idx * measureRenderWidth.value + 10
  }))
})

// 下一行的小节
const nextLineMeasures = computed(() => {
  const startIdx = (currentLineIndex.value + 1) * measuresPerLine.value
  const endIdx = startIdx + measuresPerLine.value
  const measures = allMeasures.value.slice(startIdx, endIdx)
  
  return measures.map((m, idx) => ({
    ...m,
    renderX: idx * measureRenderWidth.value + 10
  }))
})

// 监听活动音符，自动切换行
watch(() => props.activeNoteIds, (newIds) => {
  if (!newIds || newIds.length === 0) return
  
  // 查找当前活动音符所在的小节
  for (let i = 0; i < allMeasures.value.length; i++) {
    const measure = allMeasures.value[i]
    const hasActiveNote = measure.notes.some(n => 
      newIds.includes(n.id) || newIds.includes(n.originalId)
    )
    
    if (hasActiveNote) {
      // 计算该小节应该在哪一行
      const targetLineIndex = Math.floor(i / measuresPerLine.value)
      
      if (targetLineIndex !== currentLineIndex.value) {
        // 需要切换行
        isTransitioning.value = true
        setTimeout(() => {
          currentLineIndex.value = targetLineIndex
          isTransitioning.value = false
        }, 150)
      }
      break
    }
  }
}, { deep: true })

// 控制按钮
const decreaseMeasuresPerLine = () => {
  if (measuresPerLine.value > 1) {
    measuresPerLine.value--
    // 重新计算当前行索引
    recalculateLineIndex()
  }
}

const increaseMeasuresPerLine = () => {
  if (measuresPerLine.value < 8) {
    measuresPerLine.value++
    recalculateLineIndex()
  }
}

const recalculateLineIndex = () => {
  // 基于当前显示的小节重新计算行索引
  const currentMeasureIdx = currentLineIndex.value * measuresPerLine.value
  currentLineIndex.value = Math.floor(currentMeasureIdx / measuresPerLine.value)
}

// 容器大小监听
let resizeObserver = null

onMounted(() => {
  if (containerRef.value) {
    containerWidth.value = containerRef.value.offsetWidth
    resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        containerWidth.value = entry.contentRect.width
      }
    })
    resizeObserver.observe(containerRef.value)
  }
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
})
</script>

<style scoped>
.karaoke-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%);
  border-radius: 16px;
  overflow: hidden;
  font-family: 'SimSun', 'Songti SC', serif;
}

/* 控制栏 */
.karaoke-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.control-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.control-item label {
  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
}

.stepper {
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  overflow: hidden;
}

.stepper button {
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  color: #fff;
  font-size: 18px;
  cursor: pointer;
  transition: background 0.2s;
}

.stepper button:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.15);
}

.stepper button:disabled {
  color: rgba(255, 255, 255, 0.3);
  cursor: not-allowed;
}

.stepper-value {
  width: 40px;
  text-align: center;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
}

.progress-info {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.current-measure {
  font-size: 28px;
  font-weight: 700;
  color: #50C878;
}

.separator {
  color: rgba(255, 255, 255, 0.4);
  font-size: 20px;
}

.total-measures {
  font-size: 18px;
  color: rgba(255, 255, 255, 0.6);
}

/* 双行显示区 */
.karaoke-display {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 24px;
  padding: 24px;
}

.karaoke-line {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
  padding: 16px;
  transition: all 0.3s ease;
}

.current-line {
  background: rgba(80, 200, 120, 0.08);
  border: 1px solid rgba(80, 200, 120, 0.3);
  box-shadow: 0 0 30px rgba(80, 200, 120, 0.1);
}

.current-line.transitioning {
  opacity: 0.5;
  transform: translateY(-10px);
}

.next-line {
  opacity: 0.6;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.next-line.ready {
  opacity: 0.7;
}

.line-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.indicator-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.indicator-dot.playing {
  background: #50C878;
  box-shadow: 0 0 8px #50C878;
  animation: pulse 1.5s infinite;
}

.indicator-dot.waiting {
  background: rgba(255, 255, 255, 0.4);
}

.indicator-text {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 1px;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.line-content {
  overflow: hidden;
}

.karaoke-svg {
  display: block;
}

/* SVG 元素样式 */
.measure-number {
  font-size: 12px;
  fill: rgba(255, 255, 255, 0.4);
}

.note-number {
  font-size: 28px;
  fill: #fff;
  text-anchor: middle;
  dominant-baseline: middle;
}

.note-number.is-rest {
  fill: rgba(255, 255, 255, 0.5);
}

.octave-dot {
  fill: #fff;
}

.accidental {
  font-size: 14px;
  fill: #fff;
}

.underline {
  stroke: #fff;
  stroke-width: 2;
}

.aug-dot {
  fill: #fff;
}

.dash {
  stroke: #fff;
  stroke-width: 2;
}

.bar-line {
  stroke: rgba(255, 255, 255, 0.4);
  stroke-width: 1;
}

/* 倚音样式 */
.grace-notes-group {
  opacity: 0.9;
}

.grace-note-number {
  font-size: 12px;
  fill: #fff;
  text-anchor: middle;
  dominant-baseline: middle;
}

.grace-octave-dot {
  fill: #fff;
}

.grace-accidental {
  font-size: 10px;
  fill: #fff;
}

.grace-underline {
  stroke: #fff;
  stroke-width: 1;
}

/* 连音线/圆滑线样式 */
.tie-path {
  fill: #fff;
  opacity: 0.8;
}

.slur-path {
  fill: rgba(255, 255, 255, 0.7);
}

/* 高亮效果 */
.highlight-bg {
  fill: rgba(80, 200, 120, 0.4);
  rx: 6;
  ry: 6;
  animation: highlight-pulse 0.3s ease-out;
}

@keyframes highlight-pulse {
  0% { 
    fill: rgba(80, 200, 120, 0.8);
    transform: scale(1.1);
  }
  100% { 
    fill: rgba(80, 200, 120, 0.4);
    transform: scale(1);
  }
}

.active-note .note-number {
  fill: #50C878;
  font-weight: bold;
}

.active-note .octave-dot {
  fill: #50C878;
}

/* 底部信息 */
.karaoke-footer {
  padding: 12px 24px;
  background: rgba(0, 0, 0, 0.3);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.song-info {
  display: flex;
  gap: 16px;
  justify-content: center;
}

.key-signature,
.time-signature {
  color: rgba(255, 255, 255, 0.6);
  font-size: 14px;
}

/* 响应式 */
@media (max-width: 768px) {
  .karaoke-controls {
    padding: 12px 16px;
  }
  
  .control-item label {
    display: none;
  }
  
  .karaoke-display {
    padding: 16px;
    gap: 16px;
  }
  
  .note-number {
    font-size: 24px;
  }
  
  .current-measure {
    font-size: 24px;
  }
}
</style>

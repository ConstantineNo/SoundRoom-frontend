<template>
  <div class="jianpu-score" v-if="tune" ref="scoreContainerRef">
    <!-- Header -->
    <div class="header-info">
      <div v-if="tune.metaText && tune.metaText.title" class="title">{{ tune.metaText.title }}</div>
      <div class="meta-row">
        <span v-if="keyDisplay">1={{ keyDisplay }}</span>
        <span v-if="meterDisplay">{{ meterDisplay }}</span>
      </div>
    </div>

    <!-- SVG Music Body -->
    <div class="svg-scroll-container">
      <svg :width="svgWidth" :height="svgHeight" class="music-svg">
        <!-- Rows -->
        <g v-for="(row, rowIdx) in computedRows" :key="rowIdx" :transform="`translate(0, ${rowIdx * rowHeight})`">
          <!-- Cross-measure ties (跨小节连音线) -->
          <template v-for="(crossTie, ctIdx) in row.crossMeasureTies" :key="'ct'+ctIdx">
            <path class="tie-line" :d="getCrossMeasureTiePath(crossTie, row.measures)" />
          </template>

          <!-- Cross-measure slurs (跨小节圆滑线) -->
          <template v-for="(crossSlur, csIdx) in row.crossMeasureSlurs" :key="'cs'+csIdx">
            <path class="slur-line" :d="getCrossMeasureSlurPath(crossSlur, row.measures)" />
          </template>

          <!-- Outgoing Ties (行末连出) -->
          <template v-for="(outTie, otIdx) in row.outgoingTies" :key="'ot'+otIdx">
            <path class="tie-line" :d="getOutgoingTiePath(outTie, row.measures, rowWidth)" />
          </template>
          
          <!-- Incoming Ties (行首连入) -->
          <template v-for="(inTie, itIdx) in row.incomingTies" :key="'it'+itIdx">
            <path class="tie-line" :d="getIncomingTiePath(inTie, row.measures)" />
          </template>

          <!-- Outgoing Slurs (行末圆滑线) -->
          <template v-for="(outSlur, osIdx) in row.outgoingSlurs" :key="'os'+osIdx">
            <path class="slur-line" :d="getOutgoingSlurPath(outSlur, row.measures, rowWidth)" />
          </template>
          
          <!-- Incoming Slurs (行首圆滑线) -->
          <template v-for="(inSlur, isIdx) in row.incomingSlurs" :key="'is'+isIdx">
            <path class="slur-line" :d="getIncomingSlurPath(inSlur, row.measures)" />
          </template>

          <!-- Through Slurs (整行贯穿圆滑线) -->
          <template v-for="(throughSlur, tsIdx) in row.throughSlurs" :key="'ts'+tsIdx">
            <path class="slur-line" :d="getThroughSlurPath(throughSlur, row.measures)" />
          </template>
          
          <!-- Measures in this row -->
          <g v-for="(measure, mIdx) in row.measures" :key="mIdx" :transform="`translate(${measure.x}, 0)`">
            <!-- Measure number (小节号) -->
            <!-- 行首小节使用更大的正坐标，避免两位数被裁剪；非行首可稍微向左贴紧小节线 -->
            <text
              v-if="measure.measureNumber"
              class="measure-number"
              :x="mIdx === 0 ? 14 : -10"
              y="12"
            >
              {{ measure.measureNumber }}
            </text>
            <!-- Warning background -->
            <rect v-if="measure.durationStatus === 'overflow'" class="duration-warning-bg overflow" :x="0" :y="10" :width="measureWidth" :height="60" />
            <rect v-if="measure.durationStatus === 'underflow'" class="duration-warning-bg underflow" :x="0" :y="10" :width="measureWidth" :height="60" />
            
            <!-- Duration status -->
            <g v-if="measure.durationStatus !== 'ok'" class="duration-indicator">
              <text :x="measureWidth - 5" y="8" class="duration-label" :class="measure.durationStatus">
                {{ measure.durationStatus === 'overflow' ? '⚠超' : '⚠缺' }}
              </text>
            </g>

            <!-- ========================================================== -->
            <!-- 新增：渲染前奏、尾奏等段落的括号 (使用文本圆括号) -->
            <!-- ========================================================== -->
            <text v-if="measure.hasBracketStart" class="part-bracket-text" 
                  :x="measure.startBarType === 'bar_left_repeat' ? 24 : 8" 
                  y="52">(</text>
            <text v-if="measure.hasBracketEnd" class="part-bracket-text" :x="measureWidth - 15" y="52">)</text>

            <!-- Beams (合并的减时线) - Render BEFORE notes so they are behind if overlapping? Actually below is fine. -->
            <g v-for="(beam, bIdx) in measure.beams" :key="'bm'+bIdx">
              <line class="beam-line" :x1="beam.x1" :y1="beam.y" :x2="beam.x2" :y2="beam.y" />
            </g>
            
            <!-- Notes -->
            <g v-for="(note, nIdx) in measure.notes" :key="nIdx" 
               :transform="`translate(${note.x}, 0)`"
               :class="{ 'clickable-note': !note.isRest && !note.isGrace }"
               @click="onNoteClick(note)">
               
              <!-- 普通音符 -->
              <template v-if="!note.isGrace">
                <!-- Highlight -->
                <rect v-if="activeIds.has(note.id) || (note.originalId && activeIds.has(note.originalId))"
                  class="highlight-bg" :x="-5" :y="15" :width="(note.displayWidth || config.NOTE_WIDTH) + 10" :height="55" />
                
                <!-- Accidental -->
                <text v-if="note.accidental" class="accidental" :x="-2" y="48">{{ note.accidental }}</text>
                
                <!-- High octave dots -->
                <template v-if="note.highDots > 0">
                  <circle v-for="d in note.highDots" :key="'h'+d" class="octave-dot" :cx="config.NOTE_WIDTH / 2" :cy="24 - (d-1)*7" r="2.5" />
                </template>
                
                <!-- Main number -->
                <text class="note-number" :class="{ 'is-rest': note.isRest }" :x="config.NOTE_WIDTH / 2" y="50">{{ note.number }}</text>

                <!-- Low octave dots -->
                <template v-if="note.lowDots > 0">
                  <circle v-for="d in note.lowDots" :key="'l'+d" class="octave-dot" :cx="config.NOTE_WIDTH / 2" :cy="60 + (d-1)*7 + (note.hasBeam ? 12 : note.underlines * 5)" r="2.5" />
                </template>
                
                <!-- Underlines (only if NOT beamed) -->
                <template v-if="!note.hasBeam && note.underlines > 0">
                  <line v-for="u in note.underlines" :key="'u'+u" class="underline" :x1="2" :y1="58 + (u-1)*5" :x2="config.NOTE_WIDTH - 2" :y2="58 + (u-1)*5" />
                </template>
                
                <!-- Augmentation dot -->
                <circle v-if="note.augDot && !note.isRest" class="aug-dot" :cx="config.NOTE_WIDTH - 2" :cy="42" r="2.5"/>
                
                <!-- Dashes (延音线/增时线) - 每个横线独立占位，居中显示 -->
                <template v-if="note.dashes > 0 && !note.isRest">
                  <g v-for="d in note.dashes" :key="'d'+d"
                     :transform="`translate(${(d) * config.NOTE_WIDTH}, 0)`">
                    <line class="dash" :x1="4" :y1="42" :x2="config.NOTE_WIDTH - 4" :y2="42" />
                  </g>
                </template>

                <!-- Lyric -->
                <template v-if="note.lyric && note.lyric.length > 0">
                  <text v-for="(line, lIdx) in note.lyric" :key="'ly'+lIdx" 
                        class="lyric-text" 
                        :x="config.NOTE_WIDTH / 2" 
                        :y="90 + lIdx * 20">
                    {{ line }}
                  </text>
                </template>
                
                <!-- Grace notes group (倚音组，显示在主音符左上角，微型字符上标样式) -->
                <g v-if="note.graceNotes && note.graceNotes.length > 0" class="grace-notes-container">
                  <!-- 倚音到主音的连接弧线 -->
                  <path class="grace-to-main-slur" 
                    :d="getGraceToMainSlurPath(note.graceNotes.length)" />
                  <!-- 倚音组内部弧线（多个倚音时） -->
                  <path v-if="note.graceNotes.length > 1" class="grace-slur" 
                    :d="getGraceGroupSlurPath(note.graceNotes.length)" />
                  <!-- 三连音标记 -->
                  <text v-if="note.graceNotes.length === 3" class="grace-triplet-mark"
                    :x="-note.graceNotes.length * 5" y="12">3</text>
                  <!-- 每个倚音 (微型字符，约50%) -->
                  <g v-for="(grace, gIdx) in note.graceNotes" :key="'g'+gIdx"
                     :transform="`translate(${-((note.graceNotes.length - gIdx) * 10) - 2}, -8)`">
                    <!-- 高八度点 -->
                    <circle v-if="grace.highDots > 0" class="grace-octave-dot" :cx="5" :cy="18" r="1.5" />
                    <!-- 音符数字 (微型) -->
                    <text class="grace-note-number" x="5" y="32">{{ grace.number }}</text>
                    <!-- 低八度点 -->
                    <circle v-if="grace.lowDots > 0" class="grace-octave-dot" :cx="5" :cy="38" r="1.5" />
                  </g>
                  <!-- 倚音组共享的微型下划线 (减时线) -->
                  <template v-if="getGraceUnderlineCount(note.graceNotes) > 0">
                    <line v-for="u in getGraceUnderlineCount(note.graceNotes)" :key="'gu'+u" 
                      class="grace-underline"
                      :x1="-note.graceNotes.length * 10 - 2"
                      :y1="28 + (u-1)*3"
                      :x2="-4"
                      :y2="28 + (u-1)*3" />
                  </template>
                </g>
              </template>
              
              <!-- 旧版倚音渲染（已废弃，但保留以防万一） -->
              <template v-else>
                <!-- 倚音以缩放方式渲染 -->
                <g transform="scale(0.6)">
                  <template v-if="note.highDots > 0">
                    <circle v-for="d in note.highDots" :key="'h'+d" class="octave-dot" :cx="12" :cy="22 - (d-1)*5" r="2" />
                  </template>
                  <text class="note-number is-grace" x="12" y="40">{{ note.number }}</text>
                  <template v-if="note.lowDots > 0">
                    <circle v-for="d in note.lowDots" :key="'l'+d" class="octave-dot" :cx="12" :cy="48 + (d-1)*5" r="2" />
                  </template>
                  <template v-if="note.underlines > 0">
                    <line v-for="u in note.underlines" :key="'u'+u" class="underline" 
                      :x1="2" :y1="48 + (u-1)*4" :x2="22" :y2="48 + (u-1)*4" />
                  </template>
                </g>
              </template>
            </g>
            
            <!-- Tie lines (Filled Shapes) -->
            <template v-for="(tie, tIdx) in measure.ties" :key="'tie'+tIdx">
              <path class="tie-line" :d="getTiePath(tie)" />
            </template>
            
            <!-- Slur lines (Filled Shapes) -->
            <template v-for="(slur, sIdx) in measure.slurs" :key="'slur'+sIdx">
              <path class="slur-line" :d="getSlurPath(slur)" />
            </template>
            
            <!-- Triplet brackets -->
            <template v-for="(triplet, tpIdx) in measure.tripletGroups" :key="'triplet'+tpIdx">
              <text :x="(triplet.startX + triplet.endX + 30) / 2" y="15" class="triplet-number">3</text>
            </template>
            
            <!-- Bar Lines -->
            <!-- 小节开始的左重复符号 (|:) - 确保行首也能完整显示 -->
            <g v-if="measure.startBarType === 'bar_left_repeat'" class="bar-lines" 
               :transform="`translate(${mIdx === 0 ? 10 : 0}, 0)`">
              <rect class="bar-thick" x="-12" y="20" width="4" height="45"/>
              <line class="bar-line" x1="-5" y1="20" x2="-5" y2="65"/>
              <circle class="repeat-dot" cx="2" cy="35" r="2.5"/>
              <circle class="repeat-dot" cx="2" cy="50" r="2.5"/>
            </g>
            
            <!-- 小节结束的竖线 -->
            <g class="bar-lines" :transform="`translate(${measureWidth + 5}, 0)`">
              <!-- 右重复符号 (:|) - 两点+细线+粗线 -->
              <template v-if="measure.barType === 'bar_right_repeat'">
                <circle class="repeat-dot" cx="-18" cy="35" r="2.5"/>
                <circle class="repeat-dot" cx="-18" cy="50" r="2.5"/>
                <line class="bar-line" x1="-10" y1="20" x2="-10" y2="65"/>
                <rect class="bar-thick" x="-6" y="20" width="4" height="45"/>
              </template>
              <!-- 终止线 (细线+粗线) -->
              <template v-else-if="measure.barType === 'bar_thin_thick'">
                <line class="bar-line" x1="-8" y1="20" x2="-8" y2="65"/>
                <rect class="bar-thick" x="-4" y="20" width="4" height="45"/>
              </template>
              <!-- 双细线 -->
              <template v-else-if="measure.barType === 'bar_dbl_thin'">
                <line class="bar-line" x1="-4" y1="20" x2="-4" y2="65"/>
                <line class="bar-line" x1="0" y1="20" x2="0" y2="65"/>
              </template>
              <!-- 普通细线 (默认) -->
              <line v-else class="bar-line" x1="0" y1="20" x2="0" y2="65"/>
            </g>
          </g>
        </g>
      </svg>
    </div>
    
    <!-- Debug Panel -->
    <div v-if="debugMode" class="debug-panel">
      <div><strong>Debug Info:</strong></div>
      <div>Active Note IDs: {{ activeNoteIds.join(', ') || 'None' }}</div>
      <div>Total Notes Parsed: {{ totalNotes }}</div>
      <div>Measures: {{ totalMeasures }}</div>
      <div>Expected Duration per Measure: {{ meterDisplay }} = {{ (getMeterInfo().num / getMeterInfo().den).toFixed(2) }}</div>
      <div :class="{ 'warning-text': overflowMeasures > 0 }">Overflow Measures (超限): {{ overflowMeasures }}</div>
      <div :class="{ 'warning-text': underflowMeasures > 0 }">Underflow Measures (不足): {{ underflowMeasures }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  tune: { type: Object, default: null },
  activeNoteIds: { type: Array, default: () => [] },
  debugMode: { type: Boolean, default: false },
  targetKey: { type: String, default: '' }
})

const emit = defineEmits(['measure-issues', 'seek-to-note'])

const activeIds = computed(() => new Set(props.activeNoteIds))
const scoreContainerRef = ref(null)

// 点击音符跳转
const onNoteClick = (note) => {
  if (note.isRest) return
  
  // 调试信息
  console.log('[JianpuScore] 点击音符:', {
    noteId: note.id || note.originalId,
    number: note.number,
    timePercent: note.timePercent,
    absoluteTime: note.absoluteTime,
    duration: note.duration,
    tuneDuration: tuneDuration.value
  })
  
  emit('seek-to-note', {
    noteId: note.id || note.originalId,
    timePercent: note.timePercent,
    absoluteTime: note.absoluteTime
  })
}

// Layout constants
const isMobile = computed(() => containerWidth.value < 500) // Threshold for mobile layout

const config = computed(() => {
  if (isMobile.value) {
    return {
      NOTE_WIDTH: 26,
      DASH_WIDTH: 26,
      MEASURE_PADDING: 8,
      BEAT_GAP: 8,
      ROW_HEIGHT: 90,
      MIN_MEASURE_WIDTH: 140,
      MEASURE_GAP: 0
    }
  } else {
    return {
      NOTE_WIDTH: 30,
      DASH_WIDTH: 30,
      MEASURE_PADDING: 20,
      BEAT_GAP: 18,
      ROW_HEIGHT: 110,
      MIN_MEASURE_WIDTH: 240,
      MEASURE_GAP: 15
    }
  }
})

// Dynamic Layout
const containerWidth = ref(1100) // Default fallback

const measuresPerRow = computed(() => {
  // Ensure at least 1 measure per row
  // Mobile padding is smaller (e.g. 10px * 2 = 20px), Desktop is 30px * 2 = 60px
  const padding = isMobile.value ? 0 : 60
  const count = Math.floor((containerWidth.value - padding) / config.value.MIN_MEASURE_WIDTH)
  return Math.max(1, count)
})

const measureWidth = computed(() => {
  const gap = config.value.MEASURE_GAP
  // We reserve space for margins (left/right) and gaps
  // The svgWidth formula is roughly: measures * (w + gap)
  // We want svgWidth <= containerWidth
  const padding = isMobile.value ? 2 : 40 // Extra safety margin inside SVG only for desktop
  const availablePerMeasure = (containerWidth.value - padding) / measuresPerRow.value
  const w = Math.floor(availablePerMeasure - gap)
  
  return Math.max(config.value.MIN_MEASURE_WIDTH, w)
})

// Resize Observer
let resizeObserver = null

onMounted(() => {
  if (scoreContainerRef.value) {
    resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        containerWidth.value = entry.contentRect.width
      }
    })
    resizeObserver.observe(scoreContainerRef.value)
  }
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
})

// Pitch mapping (diatonic)
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

// Get meter info (for calculating beats per measure)
const getMeterInfo = () => {
  const m = props.tune?.lines?.[0]?.staff?.[0]?.meter
  if (!m) return { num: 4, den: 4 }
  if (m.type === 'specified' && m.value?.[0]) {
    return { num: m.value[0].num, den: m.value[0].den }
  }
  if (m.type === 'common_time') return { num: 4, den: 4 }
  if (m.type === 'cut_time') return { num: 2, den: 2 }
  return { num: 4, den: 4 }
}

// Duration to rhythm info
// For REST notes, we DON'T use dashes (延音线), we split into multiple notes
const getDurationInfo = (duration, isRest = false) => {
  const ratio = duration / 0.25 // ratio relative to quarter note
  let dashes = 0, underlines = 0, augDot = false
  
  // If it's a rest, don't use dashes - will be handled by splitting
  if (isRest) {
    // Rest notes: only show underlines for shorter notes, no dashes or augDot
    if (ratio < 0.99) {
      if (ratio <= 0.51) underlines = 1
      if (ratio <= 0.26) underlines = 2
      if (ratio <= 0.13) underlines = 3
    }
    return { dashes: 0, underlines, augDot: false }
  }
  
  // For regular notes - handle common durations
  // 附点四分音符 (1.5拍) = 只显示附点，不需要延音线
  if (Math.abs(ratio - 1.5) < 0.05) { 
    augDot = true 
    dashes = 0
  }
  // 附点八分音符 (0.75拍)
  else if (Math.abs(ratio - 0.75) < 0.05) { 
    underlines = 1 
    augDot = true 
  }
  // 3拍音符 = 2条延音线，无附点（1+1+1=3）
  else if (Math.abs(ratio - 3) < 0.05) { 
    dashes = 2 
    augDot = false  // 3拍不需要附点
  }
  // 附点十六分音符 (0.375拍)
  else if (Math.abs(ratio - 0.375) < 0.05) { 
    underlines = 2 
    augDot = true 
  }
  // 二分音符 (2拍) = 1条延音线
  else if (Math.abs(ratio - 2) < 0.05) {
    dashes = 1
    augDot = false // 确保没有附点
  }
  // 全音符 (4拍) = 3条延音线
  else if (Math.abs(ratio - 4) < 0.05) {
    dashes = 3
    augDot = false // 确保没有附点
  }
  // 其他长音符（非标准时值）
  else if (ratio > 1) {
    // 计算需要多少条延音线：每条延音线代表一拍
    dashes = Math.round(ratio) - 1
    augDot = false // 非标准长音符不加附点
  }
  // 短音符
  else if (ratio < 0.99) {
    if (ratio <= 0.51) underlines = 1
    if (ratio <= 0.26) underlines = 2
    if (ratio <= 0.13) underlines = 3
  }
  
  return { dashes, underlines, augDot }
}

// Split a long rest into multiple quarter note rests
const splitRestIntoQuarters = (duration, elId, noteCount) => {
  const quarterDuration = 0.25
  const notes = []
  let remaining = duration
  let subIndex = 0
  
  while (remaining >= quarterDuration - 0.01) {
    notes.push({
      id: `${elId}_rest_${subIndex}`,
      originalId: elId,
      number: 0,
      isRest: true,
      highDots: 0, 
      lowDots: 0, 
      accidental: null,
      dashes: 0,
      underlines: 0,
      augDot: false,
      width: config.value.NOTE_WIDTH,
      duration: quarterDuration
    })
    remaining -= quarterDuration
    subIndex++
  }
  
  // Handle remaining duration < quarter note
  if (remaining > 0.01) {
    const rhythm = getDurationInfo(remaining, true)
    notes.push({
      id: `${elId}_rest_${subIndex}`,
      originalId: elId,
      number: 0,
      isRest: true,
      highDots: 0, 
      lowDots: 0, 
      accidental: null,
      ...rhythm,
      width: config.value.NOTE_WIDTH,
      duration: remaining
    })
  }
  
  return notes
}

// Calculate appropriate width for each note based on its properties
const getNoteDisplayWidth = (note) => {
  // Base width for the note digit
  let width = config.value.NOTE_WIDTH
  
  // Add width for dashes (延音线) - 每条延音线占位与数字宽度一致
  if (note.dashes > 0) {
    width += note.dashes * config.value.DASH_WIDTH
  }
  
  // 附点不额外占宽度，它在数字右侧
  
  return width
}

// Layout notes within a measure - calculates x positions
// 实现"拍内紧凑、拍间疏离"的布局
const layoutMeasureNotes = (measure) => {
  if (!measure.notes || measure.notes.length === 0) return
  
  // 动态计算起始内边距
  let startPadding = config.value.MEASURE_PADDING
  // 如果有前括号，需要更多空间避免重叠
  if (measure.hasBracketStart) {
    if (measure.startBarType === 'bar_left_repeat') {
      startPadding += 30 // 重复号+括号，大幅增加间距
    } else {
      startPadding += 10 // 仅括号，稍微增加间距
    }
  }
  
  const availableWidth = measureWidth.value - startPadding - config.value.MEASURE_PADDING
  
  // 首先按拍分组
  const beatGroups = {}
  measure.notes.forEach((note, idx) => {
    // Grace notes are smaller
    if (note.isGrace) {
      note.displayWidth = config.value.NOTE_WIDTH * 0.6
    } else {
      note.displayWidth = getNoteDisplayWidth(note)
    }
    
    // 计算所属拍 (以四分音符为一拍)
    const beatIdx = Math.floor(note.relativeStartTime / 0.25)
    if (!beatGroups[beatIdx]) beatGroups[beatIdx] = []
    beatGroups[beatIdx].push({ note, idx })
  })
  
  const beatKeys = Object.keys(beatGroups).map(Number).sort((a, b) => a - b)
  const numBeats = beatKeys.length
  
  // 计算每个拍组的总宽度
  const beatWidths = {}
  let totalMinWidth = 0
  beatKeys.forEach(beatIdx => {
    const group = beatGroups[beatIdx]
    let groupWidth = 0
    group.forEach(({ note }) => {
      groupWidth += note.displayWidth
    })
    beatWidths[beatIdx] = groupWidth
    totalMinWidth += groupWidth
  })
  
  // 计算拍间间隙总量
  const totalBeatGaps = (numBeats > 1) ? (numBeats - 1) * config.value.BEAT_GAP : 0
  const totalNeeded = totalMinWidth + totalBeatGaps
  
  // 计算缩放因子
  const scaleFactor = totalNeeded > availableWidth ? availableWidth / totalNeeded : 1
  
  // 分配位置
  let currentX = startPadding
  beatKeys.forEach((beatIdx, i) => {
    const group = beatGroups[beatIdx]
    
    // 拍内紧凑排列
    group.forEach(({ note }) => {
      note.x = currentX
      currentX += note.displayWidth * scaleFactor
    })
    
    // 拍间增加间隙
    if (i < numBeats - 1) {
      currentX += config.value.BEAT_GAP * scaleFactor
    }
  })
  
  // Update tie start/end x positions
  measure.ties.forEach(tie => {
    const startNote = measure.notes[tie.startIdx]
    const endNote = measure.notes[tie.endIdx]
    if (startNote && endNote) {
      tie.startX = startNote.x + config.value.NOTE_WIDTH / 2
      tie.endX = endNote.x + config.value.NOTE_WIDTH / 2
    }
  })
  
  // Update slur start/end x positions
  if (measure.slurs) {
    measure.slurs.forEach(slur => {
      const startNote = measure.notes[slur.startIdx]
      const endNote = measure.notes[slur.endIdx]
      if (startNote && endNote) {
        slur.startX = startNote.x + config.value.NOTE_WIDTH / 2
        slur.endX = endNote.x + config.value.NOTE_WIDTH / 2
      }
    })
  }
  
  // Find triplet groups
  measure.tripletGroups = []
  let inTriplet = false
  let tripletStart = -1
  measure.notes.forEach((note, idx) => {
    if (note.startTriplet && !inTriplet) {
      inTriplet = true
      tripletStart = idx
    }
    if (note.endTriplet && inTriplet) {
      measure.tripletGroups.push({
        startIdx: tripletStart,
        endIdx: idx,
        startX: measure.notes[tripletStart].x,
        endX: note.x + config.value.NOTE_WIDTH
      })
      inTriplet = false
      tripletStart = -1
    }
  })
}

// Computed displays
const keyDisplay = computed(() => {
  // 优先使用传入的 targetKey
  if (props.targetKey) {
    // 处理中文调名映射
    const map = {
      '降B': '♭B', '降E': '♭E', '降A': '♭A', '降D': '♭D', '降G': '♭G',
      '升F': '#F', '升C': '#C', '升G': '#G', '升D': '#D', '升A': '#A',
      'Bb': '♭B', 'Eb': '♭E', 'Ab': '♭A', 'Db': '♭D', 'Gb': '♭G',
      'F#': '#F', 'C#': '#C', 'G#': '#G', 'D#': '#D', 'A#': '#A'
    }
    // 如果是纯字母（如 "Bb"），尝试映射；如果是中文（如 "降B"），也尝试映射
    // 如果映射不到，就直接显示（比如 "C", "G"）
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

// Calculate tie path (arc above notes) - 书法笔触 (Crescent shape)
// y=20 (Above numbers, numbers are at y=50)
const getTiePath = (tie) => {
  if (!tie.startX || !tie.endX) return ''
  // startX 和 endX 已经是音符中心位置 (note.x + NOTE_WIDTH/2)
  const x1 = tie.startX
  const x2 = tie.endX
  const y = 22 // 音符上方
  const midX = (x1 + x2) / 2
  const distance = Math.abs(x2 - x1)
  // Height scales with distance, but capped
  const h = Math.min(12, Math.max(6, distance * 0.12)) 
  const thickness = 1.5 + Math.min(2.5, distance * 0.04) // Thicker in middle for long ties
  
  // Top curve (going up) and Bottom curve (coming back, less high)
  // M start Q control end Q control start Z
  return `M ${x1} ${y} Q ${midX} ${y - h} ${x2} ${y} Q ${midX} ${y - h + thickness} ${x1} ${y} Z`
}

// Calculate grace notes slur path (倚音弧线) - deprecated
const getGraceSlurPath = (graceNotes, count) => {
  if (!graceNotes || graceNotes.length < 2) return ''
  const graceWidth = 14
  const startX = 5
  const endX = 5 + (count - 1) * graceWidth
  const y = 18
  const midX = (startX + endX) / 2
  const distance = Math.abs(endX - startX)
  const h = Math.min(8, Math.max(4, distance * 0.25))
  const thickness = 1.2
  
  return `M ${startX} ${y} Q ${midX} ${y - h} ${endX} ${y} Q ${midX} ${y - h + thickness} ${startX} ${y} Z`
}

// 倚音到主音符的连接弧线
const getGraceToMainSlurPath = (graceCount) => {
  // 从倚音组的末尾连接到主音符
  const startX = -4  // 最后一个倚音右侧
  const endX = 10    // 主音符左侧
  const y = 25       // 基线位置
  const midX = (startX + endX) / 2
  const h = 8
  const thickness = 1.0
  
  return `M ${startX} ${y} Q ${midX} ${y - h} ${endX} ${y} Q ${midX} ${y - h + thickness} ${startX} ${y} Z`
}

// 倚音组内部的弧线（多个倚音时使用）
const getGraceGroupSlurPath = (graceCount) => {
  if (graceCount < 2) return ''
  const graceSpacing = 10
  const startX = -graceCount * graceSpacing - 2 + 5  // 第一个倚音中心
  const endX = -2 - 5  // 最后一个倚音中心
  const y = 10
  const midX = (startX + endX) / 2
  const distance = Math.abs(endX - startX)
  const h = Math.min(6, Math.max(3, distance * 0.3))
  const thickness = 0.8
  
  return `M ${startX} ${y} Q ${midX} ${y - h} ${endX} ${y} Q ${midX} ${y - h + thickness} ${startX} ${y} Z`
}

// 获取倚音组应该显示的下划线数量（取最大值）
const getGraceUnderlineCount = (graceNotes) => {
  if (!graceNotes || graceNotes.length === 0) return 0
  // 取所有倚音中下划线数量的最大值
  return Math.max(...graceNotes.map(g => g.underlines || 0))
}

// Calculate slur path (also above)
const getSlurPath = (slur) => {
  if (!slur.startX || !slur.endX) return ''
  // startX 和 endX 已经是音符中心位置 (note.x + NOTE_WIDTH/2)
  const x1 = slur.startX
  const x2 = slur.endX
  const y = 18 // 比 tie 稍高一点
  const midX = (x1 + x2) / 2
  const distance = Math.abs(x2 - x1)
  const h = Math.min(15, Math.max(8, distance * 0.15))
  const thickness = 1.5 + Math.min(3, distance * 0.04)
  
  return `M ${x1} ${y} Q ${midX} ${y - h} ${x2} ${y} Q ${midX} ${y - h + thickness} ${x1} ${y} Z`
}

// Calculate cross-measure tie path (跨小节连音线)
const getCrossMeasureTiePath = (crossTie, measures) => {
  if (!crossTie || !measures) return ''
  
  const startMeasure = measures[crossTie.startMeasureIdx]
  const endMeasure = measures[crossTie.endMeasureIdx]
  
  if (!startMeasure || !endMeasure) return ''
  
  const startNote = startMeasure.notes[crossTie.startNoteIdx]
  const endNote = endMeasure.notes[crossTie.endNoteIdx]
  
  if (!startNote || !endNote) return ''
  
  // Calculate absolute X positions
  const x1 = startMeasure.x + startNote.x + config.value.NOTE_WIDTH / 2
  const x2 = endMeasure.x + endNote.x + config.value.NOTE_WIDTH / 2
  const y = 22
  const midX = (x1 + x2) / 2
  const distance = Math.abs(x2 - x1)
  const h = Math.min(12, Math.max(6, distance * 0.12))
  const thickness = 1.5 + Math.min(2.5, distance * 0.04)
  
  return `M ${x1} ${y} Q ${midX} ${y - h} ${x2} ${y} Q ${midX} ${y - h + thickness} ${x1} ${y} Z`
}
  
// Calculate flat-top slur path (平顶圆滑线)
const getFlatSlurPath = (x1, x2, y) => {
  const h = 15 // Height of the arc
  const r = 15 // Radius of the corner
  const topY = y - h
  
  // If distance is too short, fallback to regular curve
  if (Math.abs(x2 - x1) < 2 * r) {
    const midX = (x1 + x2) / 2
    const thickness = 1.5
    return `M ${x1} ${y} Q ${midX} ${topY} ${x2} ${y} Q ${midX} ${topY + thickness} ${x1} ${y} Z`
  }
  
  const thickness = 1.5
  
  // Path: Start -> Curve Up-Right -> Line Right -> Curve Down-Right -> End
  // Inner path (top edge)
  // M x1 y
  // Q x1 topY (x1+r) topY  (Left corner)
  // L (x2-r) topY          (Top flat line)
  // Q x2 topY x2 y         (Right corner)
  
  // Outer path (bottom edge, for thickness) - reverse direction
  // Q x2 (topY+thickness) (x2-r) (topY+thickness)
  // L (x1+r) (topY+thickness)
  // Q x1 (topY+thickness) x1 y
  
  return `M ${x1} ${y} 
          Q ${x1} ${topY} ${x1 + r} ${topY} 
          L ${x2 - r} ${topY} 
          Q ${x2} ${topY} ${x2} ${y} 
          Q ${x2} ${topY + thickness} ${x2 - r} ${topY + thickness} 
          L ${x1 + r} ${topY + thickness} 
          Q ${x1} ${topY + thickness} ${x1} ${y} Z`
}

// Calculate outgoing flat slur path (行末连出 - 平顶)
const getOutgoingFlatSlurPath = (x1, rowEndX, y) => {
  const h = 15
  const r = 15
  const topY = y - h
  const thickness = 1.5
  
  // If distance is short
  if (Math.abs(rowEndX - x1) < r) {
     // Just a curve up
     return `M ${x1} ${y} Q ${x1} ${topY} ${rowEndX} ${topY} L ${rowEndX} ${topY+thickness} Q ${x1} ${topY+thickness} ${x1} ${y} Z`
  }

  return `M ${x1} ${y} 
          Q ${x1} ${topY} ${x1 + r} ${topY} 
          L ${rowEndX} ${topY} 
          L ${rowEndX} ${topY + thickness} 
          L ${x1 + r} ${topY + thickness} 
          Q ${x1} ${topY + thickness} ${x1} ${y} Z`
}

// Calculate incoming flat slur path (行首连入 - 平顶)
const getIncomingFlatSlurPath = (rowStartX, x2, y) => {
  const h = 15
  const r = 15
  const topY = y - h
  const thickness = 1.5
  
  if (Math.abs(x2 - rowStartX) < r) {
     return `M ${rowStartX} ${topY} Q ${x2} ${topY} ${x2} ${y} Q ${x2} ${topY+thickness} ${rowStartX} ${topY+thickness} Z`
  }

  return `M ${rowStartX} ${topY} 
          L ${x2 - r} ${topY} 
          Q ${x2} ${topY} ${x2} ${y} 
          Q ${x2} ${topY + thickness} ${x2 - r} ${topY + thickness} 
          L ${rowStartX} ${topY + thickness} Z`
}

// Calculate through flat slur path (整行贯穿 - 平顶)
const getThroughFlatSlurPath = (rowStartX, rowEndX, y) => {
  const h = 15
  const topY = y - h
  const thickness = 1.5
  
  return `M ${rowStartX} ${topY} L ${rowEndX} ${topY} L ${rowEndX} ${topY + thickness} L ${rowStartX} ${topY + thickness} Z`
}

// Calculate cross-measure slur path (跨小节圆滑线) - Updated to use Flat Top
const getCrossMeasureSlurPath = (crossSlur, measures) => {
  if (!crossSlur || !measures) return ''
  
  const startMeasure = measures[crossSlur.startMeasureIdx]
  const endMeasure = measures[crossSlur.endMeasureIdx]
  
  if (!startMeasure || !endMeasure) return ''
  
  const startNote = startMeasure.notes[crossSlur.startNoteIdx]
  const endNote = endMeasure.notes[crossSlur.endNoteIdx]
  
  if (!startNote || !endNote) return ''
  
  const x1 = startMeasure.x + startNote.x + config.value.NOTE_WIDTH / 2
  const x2 = endMeasure.x + endNote.x + config.value.NOTE_WIDTH / 2
  const y = 18 
  
  return getFlatSlurPath(x1, x2, y)
}

// Calculate outgoing tie path (行末连出) - Updated for Slur to use Flat Top
const getOutgoingSlurPath = (slur, measures, rowWidth) => {
  if (!slur || !measures) return ''
  const startMeasure = measures[slur.startMeasureIdx]
  if (!startMeasure) return ''
  const startNote = startMeasure.notes[slur.startNoteIdx]
  if (!startNote) return ''

  const x1 = startMeasure.x + startNote.x + config.value.NOTE_WIDTH / 2
  // End at the end of the ROW, not just the measure
  // We need the total width of the row content.
  // rowWidth passed from template is usually svgWidth or calculated row width.
  // Let's assume rowWidth is the visual width of the row.
  // If rowWidth is not accurate, we can use the last measure's end.
  const lastMeasure = measures[measures.length - 1]
  const rowEndX = lastMeasure.x + measureWidth.value + 10 // Extend a bit
  
  const y = 18
  return getOutgoingFlatSlurPath(x1, rowEndX, y)
}

// Calculate incoming tie path (行首连入) - Updated for Slur to use Flat Top
const getIncomingSlurPath = (slur, measures) => {
  if (!slur || !measures) return ''
  const endMeasure = measures[slur.endMeasureIdx]
  if (!endMeasure) return ''
  const endNote = endMeasure.notes[slur.endNoteIdx]
  if (!endNote) return ''

  // Start from left of the row
  const firstMeasure = measures[0]
  const rowStartX = firstMeasure.x - 10 // Start a bit before
  
  const x2 = endMeasure.x + endNote.x + config.value.NOTE_WIDTH / 2
  const y = 18

  return getIncomingFlatSlurPath(rowStartX, x2, y)
}

// Calculate through slur path (整行贯穿)
const getThroughSlurPath = (slur, measures) => {
  if (!measures || measures.length === 0) return ''
  const firstMeasure = measures[0]
  const lastMeasure = measures[measures.length - 1]
  
  const rowStartX = firstMeasure.x - 10
  const rowEndX = lastMeasure.x + measureWidth.value + 10
  const y = 18
  
  return getThroughFlatSlurPath(rowStartX, rowEndX, y)
}

// Keep original Tie paths (Curved)
const getOutgoingTiePath = (tie, measures, rowWidth) => {
  if (!tie || !measures) return ''
  const startMeasure = measures[tie.startMeasureIdx]
  if (!startMeasure) return ''
  const startNote = startMeasure.notes[tie.startNoteIdx]
  if (!startNote) return ''

  const x1 = startMeasure.x + startNote.x + config.value.NOTE_WIDTH / 2
  const lastMeasure = measures[measures.length - 1]
  const x2 = lastMeasure.x + measureWidth.value + 10 
  
  const y = 22
  const midX = (x1 + x2) / 2
  const distance = Math.abs(x2 - x1)
  const h = Math.min(10, Math.max(5, distance * 0.15))
  const thickness = 1.5 + Math.min(2, distance * 0.04)

  return `M ${x1} ${y} Q ${midX} ${y - h} ${x2} ${y} Q ${midX} ${y - h + thickness} ${x1} ${y} Z`
}

const getIncomingTiePath = (tie, measures) => {
  if (!tie || !measures) return ''
  const endMeasure = measures[tie.endMeasureIdx]
  if (!endMeasure) return ''
  const endNote = endMeasure.notes[tie.endNoteIdx]
  if (!endNote) return ''

  const firstMeasure = measures[0]
  const x1 = firstMeasure.x - 10
  const x2 = endMeasure.x + endNote.x + config.value.NOTE_WIDTH / 2
  
  const y = 22
  const midX = (x1 + x2) / 2
  const distance = Math.abs(x2 - x1)
  const h = Math.min(10, Math.max(5, distance * 0.15))
  const thickness = 1.5 + Math.min(2, distance * 0.04)

  return `M ${x1} ${y} Q ${midX} ${y - h} ${x2} ${y} Q ${midX} ${y - h + thickness} ${x1} ${y} Z`
}

// Main computation
const totalNotes = ref(0)
const totalMeasures = ref(0)
const overflowMeasures = ref(0)
const underflowMeasures = ref(0)
const tuneDuration = ref(1) // 总时长，避免除以0

const computedRows = computed(() => {
  if (!props.tune?.lines) return []
  
  let keyRoot = 0
  const allMeasures = []
  let currentPart = null; // 用于追踪当前所在的段落
  let currentMeasure = { notes: [], ties: [], slurs: [], totalDuration: 0, barType: 'bar_thin', startBarType: null, beams: [], tripletGroups: [] }
  let noteCount = 0
  let measureIndex = 0
  const meter = getMeterInfo()
  const expectedMeasureDuration = meter.num / meter.den
  
  let beatPosition = 0
  let pendingTie = null
  let slurStartInfo = null // { measureIdx, noteIdx, x_offset }
  let inSlur = false
  let pendingStartBarType = null
  let currentAccumulatedDuration = 0
  const globalNotes = []  // 用于跨小节连音线
  const crossMeasureTies = [] // 收集跨小节的 tie 信息
  const crossMeasureSlurs = [] // 收集跨小节的 slur 信息

  // 第一步：先遍历一遍计算总时长，用于进度条计算（虽然abcjs有，但这里简单累加更便于控制）
  let totalDur = 0
  props.tune.lines.forEach(line => {
    if (line.staff) line.staff.forEach(s => s.voices.forEach(v => v.forEach(el => {
      if (el.el_type === 'note' && el.duration) totalDur += el.duration
    })))
  })
  tuneDuration.value = totalDur || 1

  // 辅助：生成横线 (Beams)
  // 根据拍组内的音符时值，生成合并的下划线
  // 规则：
  // 1. 将小节内的音符按拍分组 (beatGroup)
  // 2. 对每一拍，检查是否全是短音符 (duration < 1/4)
  // 3. 如果是，生成连续的线条。
  //    - 1条线：所有 < 1/2 的音符
  //    - 2条线：所有 < 1/4 的音符
  //    - 3条线：所有 < 1/8 的音符 ...
  //    注意：简谱中通常 1/8 (0.125) 是一条线，1/16 (0.0625) 是两条线。
  //    abcjs duration: 1/4音符 = 0.25. 
  //    所以 0.125 (1/8音符) -> 1条线
  //         0.0625 (1/16音符) -> 2条线
  const generateBeams = (measure) => {
    measure.beams = []
    if (!measure.notes.length) return

    // 按 beatGroup 分组，跳过倚音和休止符
    const groups = {}
    measure.notes.forEach((note, idx) => {
      if (note.isGrace || note.isRest) return  // 跳过倚音和休止符
      note._measureIdx = idx
      const beatIdx = Math.floor(note.relativeStartTime / 0.25)
      if (!groups[beatIdx]) groups[beatIdx] = []
      groups[beatIdx].push(note)
    })

    // 处理每一组
    Object.values(groups).forEach(groupNotes => {
      if (groupNotes.length < 2) return

      // 检查这一组是否都“可以”合并 (即都是短音符)
      // 实际上简谱中，同一拍内的 8分、16分音符通常是连在一起的。
      // 这里的逻辑稍微复杂：
      // 第1层线 (8分音符层): 所有 duration <= 0.125 的音符连续区间
      // 第2层线 (16分音符层): 所有 duration <= 0.0625 的音符连续区间
      
      const beamLevels = [1, 2, 3] // 对应 underlines >= 1, 2, 3
      
      beamLevels.forEach((minUnderlines, levelIdx) => {
        let startNote = null
        let endNote = null
        let count = 0
        
        for (let i = 0; i < groupNotes.length; i++) {
          const note = groupNotes[i]
          if (note.underlines >= minUnderlines && !note.isRest) {
             if (!startNote) startNote = note
             endNote = note
             count++
          } else {
             // 结束一段
             if (startNote && endNote && count >= 1) {
               measure.beams.push({
                 x1: 0,
                 x2: 0,
                 y: 58 + levelIdx * 5,
                 startID: startNote.id,
                 endID: endNote.id
               })
             }
             startNote = null
             endNote = null
             count = 0
          }
        }
        // 尾部检查
        if (startNote && endNote && count >= 1) {
           measure.beams.push({
             x1: 0, x2: 0, y: 58 + levelIdx * 5,
             startID: startNote.id, endID: endNote.id
           })
        }
      })
    })
  }

  const generateTriplets = (measure) => {
    // Detect triplet groups based on startTriplet/endTriplet flags or contiguity
    let currentGroup = null
    
    measure.notes.forEach((note) => {
      if (note.startTriplet) {
        currentGroup = { startNote: note, endNote: null }
      }
      
      // If we are in a group, this note belongs to it (presumably)
      // But we strictly rely on start/end flags usually. 
      // What if intermediate notes have no flags?
      // Assuming well-formed ABC from abcjs: startTriplet starts, endTriplet ends.
      
      if (note.endTriplet) {
        if (currentGroup) {
          currentGroup.endNote = note
          // Finalize group
           // Calculate coords based on notes
           // startX = startNote.x + 5
           // endX = endNote.x + width - 5
           const s = currentGroup.startNote
           const e = currentGroup.endNote
           measure.tripletGroups.push({
             startX: s.x + 5,
             endX: e.x + (e.displayWidth > 20 ? 25 : e.displayWidth - 5)
           })
           currentGroup = null
        }
      }
    })
  }

  // 布局函数更新
  const layoutMeasureWithBeams = (measure) => {
    layoutMeasureNotes(measure) // 先计算 x
    
    // 生成 beams 并计算坐标
    generateBeams(measure)
    generateTriplets(measure)
    measure.beams.forEach(beam => {
      // Find start and end index in notes array
      const startIdx = measure.notes.findIndex(n => n.id === beam.startID)
      const endIdx = measure.notes.findIndex(n => n.id === beam.endID)
      
      if (startIdx !== -1 && endIdx !== -1) {
          const s = measure.notes[startIdx]
          const e = measure.notes[endIdx]
          
          // 简谱横线位置微调：startX 到 endX
          // startX: note.x + 5 (数字左边缘)
          // endX: note.x + note.width - 5 (数字右边缘)
          // 数字居中在 x+15, 宽约10-15
          const nw = config.value.NOTE_WIDTH
          beam.x1 = s.x + 5
          beam.x2 = e.x + (e.displayWidth > 20 ? (nw - 5) : e.displayWidth - 5)
          
          // 标记涉及的音符，让它们不要渲染自带的 underline
          for(let k=startIdx; k<=endIdx; k++) {
              measure.notes[k].hasBeam = true
          }
      }
    })
  }

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
              // Duration status check
              const diff = currentMeasure.totalDuration - expectedMeasureDuration
              if (diff > 0.01) currentMeasure.durationStatus = 'overflow'
              else if (diff < -0.01) currentMeasure.durationStatus = 'underflow'
              else currentMeasure.durationStatus = 'ok'
              
              currentMeasure.measureNumber = measureIndex
              currentMeasure.expectedDuration = expectedMeasureDuration
              
              // Handle bar types
              const barType = el.type || 'bar_thin'
              if (barType === 'bar_left_repeat' || barType === 'bar_thick_thin') {
                currentMeasure.barType = 'bar_thin'
                pendingStartBarType = 'bar_left_repeat'
              } else if (barType === 'bar_dbl_repeat') {
                currentMeasure.barType = 'bar_right_repeat'
                pendingStartBarType = 'bar_left_repeat'
              } else if (barType === 'bar_right_repeat') {
                currentMeasure.barType = 'bar_right_repeat'
              } else {
                currentMeasure.barType = barType
              }
              
              // Layout
              layoutMeasureWithBeams(currentMeasure)
              if (currentPart) {
                currentMeasure.part = currentPart;
              }
              allMeasures.push(currentMeasure)
            } else if (el.type === 'bar_left_repeat' || el.type === 'bar_thick_thin') {
              pendingStartBarType = 'bar_left_repeat'
            }
            
            currentMeasure = { 
              notes: [], ties: [], slurs: [], beams: [], tripletGroups: [],
              totalDuration: 0, barType: 'bar_thin', startBarType: pendingStartBarType 
            }
            pendingStartBarType = null
            beatPosition = 0
            
          } else if (el.el_type === 'note') {
            noteCount++
            const duration = el.duration || 0.25
            // abcjs 歌词可能在 syllable 或 content 字段
            const lyric = el.lyric ? el.lyric.map(l => l.syllable || l.content || '') : []
            
            // Grace notes - 收集倚音信息，稍后附加到主音符上
            let graceNotesData = []
            if (el.gracenotes && el.gracenotes.length > 0) {
              graceNotesData = el.gracenotes.map((grace, graceIdx) => {
                const graceData = pitchToJianpu(grace.pitch, keyRoot)
                // 根据倚音的时值计算下划线数量
                const graceDuration = grace.duration || 0.0625
                let graceUnderlines = 2 // 默认16分音符
                if (graceDuration >= 0.125) graceUnderlines = 1 // 8分音符
                if (graceDuration < 0.0625) graceUnderlines = 3 // 32分音符
                
                return {
                  number: graceData.number,
                  highDots: graceData.octave > 0 ? graceData.octave : 0,
                  lowDots: graceData.octave < 0 ? Math.abs(graceData.octave) : 0,
                  accidental: grace.accidental ? (ACCIDENTAL_SYMBOLS[grace.accidental] || null) : null,
                  underlines: graceUnderlines,
                  pitch: grace.pitch
                }
              })
            }
            
            if (el.rest) {
               // Rests
               const restNotes = splitRestIntoQuarters(duration, elId, noteCount)
               restNotes.forEach((note, idx) => {
                 note.relativeStartTime = beatPosition
                 // 只有第一个休止符携带歌词（如果有）
                 if (idx === 0) note.lyric = lyric
                 note.timePercent = currentAccumulatedDuration / tuneDuration.value
                 note.absoluteTime = currentAccumulatedDuration
                 
                 currentMeasure.notes.push(note)
                 beatPosition += note.duration
                 currentAccumulatedDuration += note.duration
               })
               currentMeasure.totalDuration += duration
               pendingTie = null
            } else if (el.pitches?.[0]) {
               const p = el.pitches[0]
               const jData = pitchToJianpu(p.pitch, keyRoot)
               const rhythm = getDurationInfo(duration, false)
               const isTriplet = el.startTriplet || el.endTriplet || (el.triplet !== undefined)
               
               const noteObj = {
                 id: elId,
                 x: 0,
                 number: jData.number,
                 isRest: false,
                 isGrace: false,
                 highDots: jData.octave > 0 ? jData.octave : 0,
                 lowDots: jData.octave < 0 ? Math.abs(jData.octave) : 0,
                 accidental: p.accidental ? (ACCIDENTAL_SYMBOLS[p.accidental] || null) : null,
                 ...rhythm,
                 duration: duration,
                 pitch: p.pitch,
                 hasTieStart: !!(p.startTie || el.startTie),
                 hasTieEnd: !!(p.endTie || el.endTie),
                 hasSlurStart: !!(p.startSlur || el.startSlur),
                 hasSlurEnd: !!(p.endSlur || el.endSlur),
                 isTriplet: isTriplet,
                 startTriplet: el.startTriplet,
                 endTriplet: el.endTriplet,
                 lyric: lyric,
                 relativeStartTime: beatPosition,
                 timePercent: currentAccumulatedDuration / tuneDuration.value,
                 absoluteTime: currentAccumulatedDuration,
                 graceNotes: graceNotesData.length > 0 ? graceNotesData : null // 倚音数据
               }
               
               // Tie/Slur logic (same as before)
               const noteIndex = currentMeasure.notes.length
               const currentMeasureIdx = allMeasures.length
               currentMeasure.notes.push(noteObj)
               currentMeasure.totalDuration += duration
               beatPosition += duration
               currentAccumulatedDuration += duration
               
               globalNotes.push({ measureIdx: currentMeasureIdx, noteIdx: noteIndex, note: noteObj })
                              // Tie Logic
                if (pendingTie && pendingTie.pitch === noteObj.pitch) {
                   if (pendingTie.measureIdx === currentMeasureIdx) {
                     currentMeasure.ties.push({ startIdx: pendingTie.noteIdx, endIdx: noteIndex })
                   } else {
                     // 跨小节连音线：收集信息以便在 Row 级别渲染
                     crossMeasureTies.push({
                       startMeasureIdx: pendingTie.measureIdx,
                       startNoteIdx: pendingTie.noteIdx,
                       endMeasureIdx: currentMeasureIdx,
                       endNoteIdx: noteIndex,
                       pitch: noteObj.pitch
                     })
                     noteObj.hasTieEnd = true
                   }
                   pendingTie = null
                }
                if (noteObj.hasTieStart) pendingTie = { measureIdx: currentMeasureIdx, noteIdx: noteIndex, pitch: noteObj.pitch }
               
               // Slur Logic (Simplified)
               if (noteObj.hasSlurStart) {
                 inSlur = true
                 slurStartInfo = { measureIdx: currentMeasureIdx, noteIdx: noteIndex }
               }
               if (noteObj.hasSlurEnd && inSlur && slurStartInfo) {
                 if (slurStartInfo.measureIdx === currentMeasureIdx) {
                   currentMeasure.slurs.push({ startIdx: slurStartInfo.noteIdx, endIdx: noteIndex })
                 } else {
                   // Cross-measure slur
                   crossMeasureSlurs.push({
                     startMeasureIdx: slurStartInfo.measureIdx,
                     startNoteIdx: slurStartInfo.noteIdx,
                     endMeasureIdx: currentMeasureIdx,
                     endNoteIdx: noteIndex
                   })
                 }
                 inSlur = false
                 slurStartInfo = null
               }
            }
          } else if (el.el_type === 'part') {
            // P: 标记会被解析为 part 类型，直接使用其 title
            currentPart = el.title || '';
            console.log('[JianpuScore] Found Part (type=part):', currentPart);
          } else if (el.el_type === 'text') {
            // 尝试从文本中识别段落标记
            const raw = el.text || '';
            if (/^(part|Part)\s+/i.test(raw)) {
                currentPart = raw.replace(/^(part|Part)\s*/i, '').trim();
                console.log('[JianpuScore] Found Part (from text):', currentPart);
            } else if (['前奏', '间奏', '尾奏', '主歌', '副歌'].some(k => raw.includes(k))) {
                currentPart = raw.trim();
                console.log('[JianpuScore] Found Part (keyword):', currentPart);
            }
          } else {
            // Debug: 查看是否有未处理的元素可能是 part 标记
            if (el.el_type !== 'bar' && el.el_type !== 'note' && el.el_type !== 'clef' && el.el_type !== 'key' && el.el_type !== 'meter') {
               console.log('[JianpuScore] Unhandled element type:', el.el_type, el);
            }
          }
        })
      })
    })
  })
  
  // Last measure
  if (currentMeasure.notes.length > 0) {
      currentMeasure.measureNumber = measureIndex + 1
      currentMeasure.expectedDuration = expectedMeasureDuration
      currentMeasure.durationStatus = 'ok' // 最后一小节通常不满，视为OK
      if (currentMeasure.totalDuration - expectedMeasureDuration > 0.01) currentMeasure.durationStatus = 'overflow'
      
      if (currentPart) {
        currentMeasure.part = currentPart;
      }
      layoutMeasureWithBeams(currentMeasure)
      allMeasures.push(currentMeasure)
  }

  // ==========================================================
  // 新增：后处理，为段落的首尾小节添加括号标志
  // ==========================================================
  const partSections = {}; // 用来存储每个 part 的起止索引
  allMeasures.forEach((measure, index) => {
      if (measure.part) {
          if (!partSections[measure.part]) {
              partSections[measure.part] = { start: index, end: index };
          } else {
              partSections[measure.part].end = index;
          }
      }
  });

  Object.keys(partSections).forEach(partName => {
      // 我们只为“前奏”、“间奏”、“尾奏”添加括号
      if (partName.includes('前奏') || partName.includes('间奏') || partName.includes('尾奏')) {
          const section = partSections[partName];
          if (allMeasures[section.start]) {
              allMeasures[section.start].hasBracketStart = true;
              // 重新布局以适应括号空间
              layoutMeasureWithBeams(allMeasures[section.start]);
          }
          if (allMeasures[section.end]) {
              allMeasures[section.end].hasBracketEnd = true;
              // 重新布局（虽然结束括号通常不需要额外空间，但保持一致）
              layoutMeasureWithBeams(allMeasures[section.end]);
          }
      }
  });

  totalNotes.value = noteCount
  totalMeasures.value = allMeasures.length
  
  // Emit measure issues for editor highlighting
  const issues = allMeasures
    .filter(m => m.durationStatus !== 'ok')
    .map(m => ({
      measureNumber: m.measureNumber,
      status: m.durationStatus,
      expected: m.expectedDuration,
      actual: m.totalDuration,
      diff: m.durationDiff
    }))
  
  // Use setTimeout to avoid emit during render
  setTimeout(() => {
    emit('measure-issues', issues)
  }, 0)
  
  // Group Rows
  // 重置
  const rows = []
  let currentRow = { measures: [], crossMeasureTies: [], crossMeasureSlurs: [], outgoingTies: [], incomingTies: [], outgoingSlurs: [], incomingSlurs: [], throughSlurs: [] }
  allMeasures.forEach((m, idx) => {
    const measureIdxInRow = currentRow.measures.length
    currentRow.measures.push({ ...m, x: measureIdxInRow * (measureWidth.value + config.value.MEASURE_GAP), globalMeasureIdx: idx }) // 增加间距
    
    // Check if row is full
    if (currentRow.measures.length >= measuresPerRow.value) {
      // 查找属于这一行的跨小节 tie
      const rowStartMeasureIdx = idx - currentRow.measures.length + 1
      const rowEndMeasureIdx = idx
      
      crossMeasureTies.forEach(ct => {
        const s = ct.startMeasureIdx
        const e = ct.endMeasureIdx
        // Case 1: Fully inside row
        if (s >= rowStartMeasureIdx && e <= rowEndMeasureIdx) {
          currentRow.crossMeasureTies.push({
            startMeasureIdx: s - rowStartMeasureIdx,
            startNoteIdx: ct.startNoteIdx,
            endMeasureIdx: e - rowStartMeasureIdx,
            endNoteIdx: ct.endNoteIdx
          })
        }
        // Case 2: Starts in row, ends later (Outgoing)
        else if (s >= rowStartMeasureIdx && s <= rowEndMeasureIdx && e > rowEndMeasureIdx) {
           currentRow.outgoingTies.push({
             startMeasureIdx: s - rowStartMeasureIdx,
             startNoteIdx: ct.startNoteIdx,
             pitch: ct.pitch
           })
        }
        // Case 3: Starts before, ends in row (Incoming)
        else if (s < rowStartMeasureIdx && e >= rowStartMeasureIdx && e <= rowEndMeasureIdx) {
           currentRow.incomingTies.push({
             endMeasureIdx: e - rowStartMeasureIdx,
             endNoteIdx: ct.endNoteIdx,
             pitch: ct.pitch
           })
        }
      })
      
      // 查找属于这一行的跨小节 slur
      crossMeasureSlurs.forEach(cs => {
        const s = cs.startMeasureIdx
        const e = cs.endMeasureIdx
        if (s >= rowStartMeasureIdx && e <= rowEndMeasureIdx) {
          currentRow.crossMeasureSlurs.push({
            startMeasureIdx: s - rowStartMeasureIdx,
            startNoteIdx: cs.startNoteIdx,
            endMeasureIdx: e - rowStartMeasureIdx,
            endNoteIdx: cs.endNoteIdx
          })
        }
        // Case 2: Starts in row, ends later (Outgoing)
        else if (s >= rowStartMeasureIdx && s <= rowEndMeasureIdx && e > rowEndMeasureIdx) {
           currentRow.outgoingSlurs.push({
             startMeasureIdx: s - rowStartMeasureIdx,
             startNoteIdx: cs.startNoteIdx
           })
        }
        // Case 3: Starts before, ends in row (Incoming)
        else if (s < rowStartMeasureIdx && e >= rowStartMeasureIdx && e <= rowEndMeasureIdx) {
           currentRow.incomingSlurs.push({
             endMeasureIdx: e - rowStartMeasureIdx,
             endNoteIdx: cs.endNoteIdx
           })
        }
        // Case 4: Starts before, ends after (Through)
        else if (s < rowStartMeasureIdx && e > rowEndMeasureIdx) {
           currentRow.throughSlurs.push({
             // No specific note needed, just draw across
           })
        }
      })
      rows.push(currentRow)
      currentRow = { measures: [], crossMeasureTies: [], crossMeasureSlurs: [], outgoingTies: [], incomingTies: [], outgoingSlurs: [], incomingSlurs: [], throughSlurs: [] }
    }
  })
  if (currentRow.measures.length > 0) {
    // 查找属于这一行的跨小节 tie
    const rowStartMeasureIdx = allMeasures.length - currentRow.measures.length
    const rowEndMeasureIdx = allMeasures.length - 1
    
    crossMeasureTies.forEach(ct => {
      const s = ct.startMeasureIdx
      const e = ct.endMeasureIdx
      if (s >= rowStartMeasureIdx && e <= rowEndMeasureIdx) {
        currentRow.crossMeasureTies.push({
          startMeasureIdx: s - rowStartMeasureIdx,
          startNoteIdx: ct.startNoteIdx,
          endMeasureIdx: e - rowStartMeasureIdx,
          endNoteIdx: ct.endNoteIdx
        })
      }
      // Case 2: Starts in row, ends later (Outgoing) - Last row shouldn't have outgoing usually unless incomplete score
      else if (s >= rowStartMeasureIdx && s <= rowEndMeasureIdx && e > rowEndMeasureIdx) {
           currentRow.outgoingTies.push({
             startMeasureIdx: s - rowStartMeasureIdx,
             startNoteIdx: ct.startNoteIdx,
             pitch: ct.pitch
           })
      }
      // Case 3: Starts before, ends in row (Incoming)
      else if (s < rowStartMeasureIdx && e >= rowStartMeasureIdx && e <= rowEndMeasureIdx) {
           currentRow.incomingTies.push({
             endMeasureIdx: e - rowStartMeasureIdx,
             endNoteIdx: ct.endNoteIdx,
             pitch: ct.pitch
           })
      }
    })
    // 查找属于这一行的跨小节 slur
    crossMeasureSlurs.forEach(cs => {
      const s = cs.startMeasureIdx
      const e = cs.endMeasureIdx
      if (s >= rowStartMeasureIdx && e <= rowEndMeasureIdx) {
        currentRow.crossMeasureSlurs.push({
          startMeasureIdx: s - rowStartMeasureIdx,
          startNoteIdx: cs.startNoteIdx,
          endMeasureIdx: e - rowStartMeasureIdx,
          endNoteIdx: cs.endNoteIdx
        })
      }
      // Case 2: Starts in row, ends later (Outgoing)
      else if (s >= rowStartMeasureIdx && s <= rowEndMeasureIdx && e > rowEndMeasureIdx) {
           currentRow.outgoingSlurs.push({
             startMeasureIdx: s - rowStartMeasureIdx,
             startNoteIdx: cs.startNoteIdx
           })
      }
      // Case 3: Starts before, ends in row (Incoming)
      else if (s < rowStartMeasureIdx && e >= rowStartMeasureIdx && e <= rowEndMeasureIdx) {
           currentRow.incomingSlurs.push({
             endMeasureIdx: e - rowStartMeasureIdx,
             endNoteIdx: cs.endNoteIdx
           })
      }
      // Case 4: Starts before, ends after (Through)
      else if (s < rowStartMeasureIdx && e > rowEndMeasureIdx) {
           currentRow.throughSlurs.push({})
      }
    })
    rows.push(currentRow)
  }
  
  return rows
})

const rowHeight = computed(() => config.value.ROW_HEIGHT)

const svgWidth = computed(() => {
  if (computedRows.value.length === 0) return 400
  // Width based on measures per row
  const padding = isMobile.value ? 2 : 40
  return measuresPerRow.value * (measureWidth.value + config.value.MEASURE_GAP) + padding
})

const svgHeight = computed(() => {
  return computedRows.value.length * rowHeight.value + 40
})
</script>

<style scoped>
.jianpu-score {
  font-family: 'SimSun', 'Songti SC', 'STSong', serif;
  background: #fff;
  padding: 30px;
}

@media (max-width: 500px) {
  .jianpu-score {
    padding: 0px;
    border: 1px solid #ccc; /* Debug border */
  }
  .note-number {
    font-size: 24px !important;
  }
  .lyric-text {
    font-size: 16px !important;
  }
}

@font-face {
  font-family: 'JianpuPoints';
  src: url('/fonts/JianpuDigits.woff2') format('woff2');
  font-weight: normal;
  font-style: normal;
}


.header-info {
  text-align: center;
  margin-bottom: 30px;
}

.title {
  font-size: 32px;
  font-weight: bold;
  color: #000;
  margin-bottom: 12px;
  letter-spacing: 4px;
}

.meta-row {
  font-size: 16px;
  color: #333;
  display: flex;
  gap: 40px;
  justify-content: center;
}

.music-svg {
  display: block;
  margin: 0 auto;
}

/* SVG Styles */
.note-number {
  font-size: 28px;
  font-family: 'JianpuPoints', 'Times New Roman', serif;
  font-weight: normal;
  fill: #000;
  text-anchor: middle;
  cursor: pointer;
}

.note-number.is-rest {
  fill: #333;
}

.accidental {
  font-size: 16px;
  fill: #000;
  font-weight: bold;
}

.octave-dot {
  fill: #000;
}

.underline {
  stroke: #000;
  stroke-width: 2;
  stroke-linecap: round;
}

.aug-dot {
  fill: #000;
}

.dash {
  stroke: #000;
  stroke-width: 4;
  stroke-linecap: round;
}

.bar-line {
  stroke: #000;
  stroke-width: 1.5;
}

.bar-thick {
  fill: #000;
}

.repeat-dot {
  fill: #000;
}

.part-bracket-text {
  font-size: 34px;
  font-family: 'JianpuPoints', 'Times New Roman', serif;
  font-weight: normal;
  fill: #000;
  text-anchor: middle;
}

.highlight-bg {
  fill: rgba(208, 48, 80, 0.2);
  rx: 4;
}

/* Tie line (连音线 - 音符上方弧线，现在是填充形状) */
.tie-line {
  fill: #000;
  stroke: none;
}

/* Slur line (圆滑线 - 音符上方弧线，现在是填充形状) */
.slur-line {
  fill: #000;
  stroke: none;
}

/* Beams (合并的减时线) */
.beam-line {
  stroke: #000;
  stroke-width: 2.5; /* Slightly thicker for better visibility */
  stroke-linecap: round;
}

/* Grace notes (倚音) */
.grace-note-group .note-number {
  font-size: 18px;
  font-weight: normal;
}

.grace-note-group .octave-dot {
  r: 2;
}

.grace-note-group .underline {
  stroke-width: 1.5;
}

.note-number.is-grace {
  fill: #333;
}

.grace-slash {
  stroke: #000;
  stroke-width: 1.5;
}

/* Grace notes container */
.grace-notes-container {
  pointer-events: none; /* 倚音不响应点击 */
}

/* 微型倚音数字 (约50%大小) */
.grace-note-number {
  font-size: 14px;
  font-family: 'JianpuPoints', 'Times New Roman', serif;
  font-weight: normal;
  fill: #000;
  text-anchor: middle;
}

/* 倚音八度点 */
.grace-octave-dot {
  fill: #000;
}

/* 倚音组共享的微型下划线 */
.grace-underline {
  stroke: #000;
  stroke-width: 1;
  stroke-linecap: round;
}

/* 倚音到主音的连接弧线 */
.grace-to-main-slur {
  fill: #000;
  stroke: none;
  opacity: 0.9;
}

/* 倚音组内部弧线 */
.grace-slur {
  fill: #000;
  stroke: none;
  opacity: 0.9;
}

/* 倚音三连音标记 */
.grace-triplet-mark {
  font-size: 9px;
  font-style: italic;
  font-weight: bold;
  fill: #000;
  text-anchor: middle;
}

/* Lyrics */
.lyric-text {
  font-size: 20px;
  fill: #000;
  text-anchor: middle;
  font-family: 'SimSun', 'Songti SC', 'STSong', serif;
}

/* Interactive Interaction */
.clickable-note {
  cursor: pointer;
}

.clickable-note:hover .note-number {
  fill: #d03050; /* Highlight color on hover */
  font-weight: bold;
}

/* Triplet bracket */
.triplet-bracket .triplet-line {
  stroke: #444;
  stroke-width: 1;
}

.triplet-number {
  font-size: 12px; /* Slightly larger */
  font-style: italic;
  font-weight: bold;
  fill: #444;
  text-anchor: middle;
}

/* Duration warning backgrounds */
.duration-warning-bg.overflow {
  fill: rgba(255, 77, 79, 0.15);
}

.duration-warning-bg.underflow {
  fill: rgba(250, 173, 20, 0.15);
}

/* Duration status indicator */
.duration-label {
  font-size: 10px;
  text-anchor: end;
  font-weight: bold;
}

.duration-label.overflow {
  fill: #ff4d4f;
}

.duration-label.underflow {
  fill: #faad14;
}

.measure-number {
  font-size: 12px;
  font-family: 'SimSun', 'Songti SC', 'STSong', serif;
  font-weight: bold;
  fill: #666;
  text-anchor: end;
  user-select: none;
}

/* Debug Panel */
.debug-panel {
  margin-top: 20px;
  padding: 12px;
  background: #f0f0f0;
  border-radius: 4px;
  font-size: 12px;
  font-family: monospace;
}

.debug-panel .warning-text {
  color: #ff4d4f;
  font-weight: bold;
}
</style>
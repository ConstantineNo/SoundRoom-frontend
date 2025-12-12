<template>
  <div class="jianpu-score" v-if="tune">
    <!-- Header -->
    <div class="header-info">
      <div v-if="tune.metaText && tune.metaText.title" class="title">{{ tune.metaText.title }}</div>
      <div class="meta-row">
        <span v-if="keyDisplay">1={{ keyDisplay }}</span>
        <span v-if="meterDisplay">{{ meterDisplay }}</span>
      </div>
    </div>

    <!-- SVG Music Body -->
    <svg :width="svgWidth" :height="svgHeight" class="music-svg">
      <!-- Rows -->
      <g v-for="(row, rowIdx) in computedRows" :key="rowIdx" :transform="`translate(0, ${rowIdx * rowHeight})`">
        <!-- Measures in this row -->
        <g v-for="(measure, mIdx) in row.measures" :key="mIdx" :transform="`translate(${measure.x}, 0)`">
          <!-- Notes in this measure -->
          <g v-for="(note, nIdx) in measure.notes" :key="nIdx" :transform="`translate(${note.x}, 0)`">
            <!-- Highlight rect -->
            <rect 
              v-if="activeIds.has(note.id)"
              class="highlight-bg"
              :x="-5" :y="20" :width="note.width + 10" :height="60"
            />
            
            <!-- Accidental -->
            <text v-if="note.accidental" class="accidental" :x="-2" y="55">{{ note.accidental }}</text>
            
            <!-- High octave dots -->
            <template v-if="note.highDots > 0">
              <circle v-for="d in note.highDots" :key="'h'+d" 
                class="octave-dot" 
                :cx="12" :cy="25 - (d-1)*8" r="2.5"
              />
            </template>
            
            <!-- Main number -->
            <text class="note-number" :class="{ 'is-rest': note.isRest }" x="10" y="58">{{ note.number }}</text>
            
            <!-- Low octave dots -->
            <template v-if="note.lowDots > 0">
              <circle v-for="d in note.lowDots" :key="'l'+d" 
                class="octave-dot" 
                :cx="12" :cy="75 + (d-1)*8 + note.underlines * 6" r="2.5"
              />
            </template>
            
            <!-- Underlines -->
            <template v-if="note.underlines > 0">
              <line v-for="u in note.underlines" :key="'u'+u"
                class="underline"
                :x1="2" :y1="68 + (u-1)*6" :x2="22" :y2="68 + (u-1)*6"
              />
            </template>
            
            <!-- Augmentation dot -->
            <circle v-if="note.augDot" class="aug-dot" :cx="28" :cy="55" r="2"/>
            
            <!-- Dashes for long notes -->
            <template v-if="note.dashes > 0">
              <line v-for="d in note.dashes" :key="'d'+d"
                class="dash"
                :x1="30 + (d-1)*20" :y1="50" :x2="45 + (d-1)*20" :y2="50"
              />
            </template>
          </g>
          
          <!-- Bar line at end of measure -->
          <line class="bar-line" :x1="measure.width" y1="25" :x2="measure.width" y2="75"/>
        </g>
      </g>
    </svg>
    
    <!-- Debug Panel -->
    <div v-if="debugMode" class="debug-panel">
      <div><strong>Debug Info:</strong></div>
      <div>Active Note IDs: {{ activeNoteIds.join(', ') || 'None' }}</div>
      <div>Total Notes Parsed: {{ totalNotes }}</div>
      <div>Measures: {{ totalMeasures }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  tune: { type: Object, default: null },
  activeNoteIds: { type: Array, default: () => [] },
  debugMode: { type: Boolean, default: false }
})

const activeIds = computed(() => new Set(props.activeNoteIds))

// Layout constants
const NOTE_WIDTH = 30
const DASH_WIDTH = 20
const MEASURE_PADDING = 20
const MEASURES_PER_ROW = 4
const rowHeight = 120

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

// Duration to rhythm info
const getDurationInfo = (duration) => {
  const ratio = duration / 0.25
  let dashes = 0, underlines = 0, augDot = false
  
  if (Math.abs(ratio - 1.5) < 0.05) { augDot = true }
  else if (Math.abs(ratio - 0.75) < 0.05) { underlines = 1; augDot = true }
  else if (Math.abs(ratio - 3) < 0.05) { dashes = 2; augDot = true }
  else if (Math.abs(ratio - 0.375) < 0.05) { underlines = 2; augDot = true }
  else {
    if (ratio >= 2) dashes = Math.round(ratio) - 1
    else if (ratio < 0.99) {
      if (ratio <= 0.51) underlines = 1
      if (ratio <= 0.26) underlines = 2
      if (ratio <= 0.13) underlines = 3
    }
  }
  return { dashes, underlines, augDot }
}

// Computed displays
const keyDisplay = computed(() => {
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

// Main computation
const totalNotes = ref(0)
const totalMeasures = ref(0)

const computedRows = computed(() => {
  if (!props.tune?.lines) return []
  
  let keyRoot = 0
  const allMeasures = []
  let currentMeasure = { notes: [], width: 0 }
  let noteCount = 0
  
  props.tune.lines.forEach(line => {
    if (!line.staff) return
    line.staff.forEach(staff => {
      if (staff.key) keyRoot = getKeyRootPitch(staff.key)
      staff.voices.forEach(voice => {
        voice.forEach(el => {
          const elId = el._myId || null
          
          if (el.el_type === 'bar') {
            if (currentMeasure.notes.length > 0) {
              currentMeasure.width += MEASURE_PADDING
              allMeasures.push(currentMeasure)
              currentMeasure = { notes: [], width: 0 }
            }
          } else if (el.el_type === 'note') {
            noteCount++
            const rhythm = getDurationInfo(el.duration)
            const noteWidth = NOTE_WIDTH + rhythm.dashes * DASH_WIDTH
            
            if (el.rest) {
              currentMeasure.notes.push({
                id: elId,
                x: currentMeasure.width,
                number: 0,
                isRest: true,
                highDots: 0, lowDots: 0, accidental: null,
                ...rhythm,
                width: noteWidth
              })
            } else if (el.pitches?.[0]) {
              const p = el.pitches[0]
              const jData = pitchToJianpu(p.pitch, keyRoot)
              currentMeasure.notes.push({
                id: elId,
                x: currentMeasure.width,
                number: jData.number,
                isRest: false,
                highDots: jData.octave > 0 ? jData.octave : 0,
                lowDots: jData.octave < 0 ? Math.abs(jData.octave) : 0,
                accidental: p.accidental ? (ACCIDENTAL_SYMBOLS[p.accidental] || null) : null,
                ...rhythm,
                width: noteWidth
              })
            }
            currentMeasure.width += noteWidth
          }
        })
      })
    })
  })
  
  if (currentMeasure.notes.length > 0) {
    currentMeasure.width += MEASURE_PADDING
    allMeasures.push(currentMeasure)
  }
  
  totalNotes.value = noteCount
  totalMeasures.value = allMeasures.length
  
  // Group into rows
  const rows = []
  let rowX = 0
  let currentRow = { measures: [] }
  
  allMeasures.forEach((m, idx) => {
    currentRow.measures.push({ ...m, x: rowX })
    rowX += m.width
    
    if ((idx + 1) % MEASURES_PER_ROW === 0) {
      rows.push(currentRow)
      currentRow = { measures: [] }
      rowX = 0
    }
  })
  
  if (currentRow.measures.length > 0) {
    rows.push(currentRow)
  }
  
  return rows
})

const svgWidth = computed(() => {
  if (computedRows.value.length === 0) return 400
  const maxWidth = Math.max(...computedRows.value.map(row => 
    row.measures.reduce((sum, m) => sum + m.width, 0)
  ))
  return Math.max(400, maxWidth + 40)
})

const svgHeight = computed(() => {
  return computedRows.value.length * rowHeight + 40
})
</script>

<style scoped>
.jianpu-score {
  font-family: 'SimSun', 'Songti SC', serif;
  background: #fff;
  padding: 24px;
}

.header-info {
  text-align: center;
  margin-bottom: 24px;
}

.title {
  font-size: 28px;
  font-weight: bold;
  color: #222;
  margin-bottom: 8px;
}

.meta-row {
  font-size: 14px;
  color: #555;
  display: flex;
  gap: 24px;
  justify-content: center;
}

.music-svg {
  display: block;
  margin: 0 auto;
}

/* SVG Styles */
.note-number {
  font-size: 22px;
  font-family: 'Times New Roman', serif;
  fill: #222;
  text-anchor: middle;
}

.note-number.is-rest {
  fill: #666;
}

.accidental {
  font-size: 14px;
  fill: #222;
}

.octave-dot {
  fill: #222;
}

.underline {
  stroke: #222;
  stroke-width: 1.5;
}

.aug-dot {
  fill: #222;
}

.dash {
  stroke: #222;
  stroke-width: 2;
}

.bar-line {
  stroke: #666;
  stroke-width: 1;
}

.highlight-bg {
  fill: rgba(208, 48, 80, 0.2);
  rx: 4;
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
</style>

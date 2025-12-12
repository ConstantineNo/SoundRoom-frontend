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
          <!-- Warning background for overflowing measures -->
          <rect 
            v-if="measure.overflow"
            class="overflow-warning-bg"
            :x="0" :y="15" :width="measureWidth" :height="70"
          />
          
          <!-- Notes in this measure -->
          <g v-for="(note, nIdx) in measure.notes" :key="nIdx" :transform="`translate(${note.x}, 0)`">
            <!-- Highlight rect (check both id and originalId for split rests) -->
            <rect 
              v-if="activeIds.has(note.id) || (note.originalId && activeIds.has(note.originalId))"
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
            
            <!-- Augmentation dot (only for non-rest notes) -->
            <circle v-if="note.augDot && !note.isRest" class="aug-dot" :cx="28" :cy="55" r="2"/>
            
            <!-- Dashes for long notes (only for non-rest notes) -->
            <template v-if="note.dashes > 0 && !note.isRest">
              <line v-for="d in note.dashes" :key="'d'+d"
                class="dash"
                :x1="30 + (d-1)*20" :y1="50" :x2="45 + (d-1)*20" :y2="50"
              />
            </template>
          </g>
          
          <!-- Tie/Slur lines -->
          <template v-for="(tie, tIdx) in measure.ties" :key="'tie'+tIdx">
            <path 
              class="tie-line"
              :d="getTiePath(tie)"
            />
          </template>
          
          <!-- Bar line at end of measure -->
          <line class="bar-line" :x1="measureWidth" y1="25" :x2="measureWidth" y2="75"/>
        </g>
      </g>
    </svg>
    
    <!-- Debug Panel -->
    <div v-if="debugMode" class="debug-panel">
      <div><strong>Debug Info:</strong></div>
      <div>Active Note IDs: {{ activeNoteIds.join(', ') || 'None' }}</div>
      <div>Total Notes Parsed: {{ totalNotes }}</div>
      <div>Measures: {{ totalMeasures }}</div>
      <div>Overflow Measures: {{ overflowMeasures }}</div>
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
const measureWidth = 200 // Fixed measure width for uniform appearance

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
  
  // For regular notes
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
      width: NOTE_WIDTH,
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
      width: NOTE_WIDTH,
      duration: remaining
    })
  }
  
  return notes
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

// Calculate tie path
const getTiePath = (tie) => {
  const x1 = tie.startX + 15
  const x2 = tie.endX + 5
  const y = 35 // Above the notes
  const midX = (x1 + x2) / 2
  const height = 10
  return `M ${x1} ${y} Q ${midX} ${y - height} ${x2} ${y}`
}

// Main computation
const totalNotes = ref(0)
const totalMeasures = ref(0)
const overflowMeasures = ref(0)

const computedRows = computed(() => {
  if (!props.tune?.lines) return []
  
  let keyRoot = 0
  const allMeasures = []
  let currentMeasure = { notes: [], ties: [], totalDuration: 0 }
  let noteCount = 0
  const meter = getMeterInfo()
  // Calculate max duration for a measure (in abcjs units: 1 = whole note)
  const maxMeasureDuration = meter.num / meter.den
  
  // Track notes for tie detection
  let prevNote = null
  let prevNoteX = 0
  
  props.tune.lines.forEach(line => {
    if (!line.staff) return
    line.staff.forEach(staff => {
      if (staff.key) keyRoot = getKeyRootPitch(staff.key)
      staff.voices.forEach(voice => {
        voice.forEach(el => {
          const elId = el._myId || null
          
          if (el.el_type === 'bar') {
            if (currentMeasure.notes.length > 0) {
              // Check for overflow
              currentMeasure.overflow = currentMeasure.totalDuration > maxMeasureDuration + 0.01
              allMeasures.push(currentMeasure)
              currentMeasure = { notes: [], ties: [], totalDuration: 0 }
              prevNote = null
              prevNoteX = 0
            }
          } else if (el.el_type === 'note') {
            noteCount++
            const duration = el.duration || 0.25
            
            if (el.rest) {
              // Split long rests into quarter note rests
              const restNotes = splitRestIntoQuarters(duration, elId, noteCount)
              restNotes.forEach(note => {
                note.x = currentMeasure.notes.length * (measureWidth - MEASURE_PADDING) / 4 // Evenly distribute
                currentMeasure.notes.push(note)
              })
              currentMeasure.totalDuration += duration
              prevNote = null
            } else if (el.pitches?.[0]) {
              const p = el.pitches[0]
              const jData = pitchToJianpu(p.pitch, keyRoot)
              const rhythm = getDurationInfo(duration, false)
              const noteWidth = NOTE_WIDTH + rhythm.dashes * DASH_WIDTH
              
              const noteX = currentMeasure.notes.length * (measureWidth - MEASURE_PADDING) / 4
              
              const noteObj = {
                id: elId,
                x: noteX,
                number: jData.number,
                isRest: false,
                highDots: jData.octave > 0 ? jData.octave : 0,
                lowDots: jData.octave < 0 ? Math.abs(jData.octave) : 0,
                accidental: p.accidental ? (ACCIDENTAL_SYMBOLS[p.accidental] || null) : null,
                ...rhythm,
                width: noteWidth,
                duration: duration,
                pitch: p.pitch,
                startTie: p.startTie,
                endTie: p.endTie
              }
              
              currentMeasure.notes.push(noteObj)
              currentMeasure.totalDuration += duration
              
              // Check for tie with previous note
              if (prevNote && prevNote.startTie && p.endTie && prevNote.pitch === p.pitch) {
                currentMeasure.ties.push({
                  startX: prevNoteX,
                  endX: noteX
                })
              }
              
              prevNote = { ...noteObj, startTie: p.startTie }
              prevNoteX = noteX
            }
          }
        })
      })
    })
  })
  
  if (currentMeasure.notes.length > 0) {
    currentMeasure.overflow = currentMeasure.totalDuration > maxMeasureDuration + 0.01
    allMeasures.push(currentMeasure)
  }
  
  totalNotes.value = noteCount
  totalMeasures.value = allMeasures.length
  overflowMeasures.value = allMeasures.filter(m => m.overflow).length
  
  // Group into rows
  const rows = []
  let currentRow = { measures: [] }
  
  allMeasures.forEach((m, idx) => {
    const rowIdx = currentRow.measures.length
    currentRow.measures.push({ 
      ...m, 
      x: rowIdx * (measureWidth + 5), // Small gap between measures
      width: measureWidth 
    })
    
    if ((idx + 1) % MEASURES_PER_ROW === 0) {
      rows.push(currentRow)
      currentRow = { measures: [] }
    }
  })
  
  if (currentRow.measures.length > 0) {
    rows.push(currentRow)
  }
  
  return rows
})

const svgWidth = computed(() => {
  if (computedRows.value.length === 0) return 400
  // Fixed width based on measures per row
  return MEASURES_PER_ROW * (measureWidth + 5) + 40
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

/* Tie/Slur line */
.tie-line {
  fill: none;
  stroke: #222;
  stroke-width: 1.5;
}

/* Overflow warning */
.overflow-warning-bg {
  fill: rgba(255, 77, 79, 0.15);
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

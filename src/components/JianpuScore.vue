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
          <!-- Warning background for duration issues -->
          <rect 
            v-if="measure.durationStatus === 'overflow'"
            class="duration-warning-bg overflow"
            :x="0" :y="15" :width="measureWidth" :height="70"
          />
          <rect 
            v-if="measure.durationStatus === 'underflow'"
            class="duration-warning-bg underflow"
            :x="0" :y="15" :width="measureWidth" :height="70"
          />
          
          <!-- Duration status indicator -->
          <g v-if="measure.durationStatus !== 'ok'" class="duration-indicator">
            <text 
              :x="measureWidth - 5" 
              y="18" 
              class="duration-label"
              :class="measure.durationStatus"
            >
              {{ measure.durationStatus === 'overflow' ? '⚠超' : '⚠缺' }}
            </text>
          </g>
          
          <!-- Notes in this measure -->
          <g v-for="(note, nIdx) in measure.notes" :key="nIdx" :transform="`translate(${note.x}, 0)`">
            <!-- Highlight rect (check both id and originalId for split rests) -->
            <rect 
              v-if="activeIds.has(note.id) || (note.originalId && activeIds.has(note.originalId))"
              class="highlight-bg"
              :x="-5" :y="20" :width="(note.displayWidth || NOTE_WIDTH) + 10" :height="60"
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
          
          <!-- Triplet brackets -->
          <template v-for="(triplet, tpIdx) in measure.tripletGroups" :key="'triplet'+tpIdx">
            <g class="triplet-bracket">
              <!-- Left vertical line -->
              <line :x1="triplet.startX" :y1="15" :x2="triplet.startX" :y2="20" class="triplet-line"/>
              <!-- Horizontal line -->
              <line :x1="triplet.startX" :y1="15" :x2="triplet.endX" :y2="15" class="triplet-line"/>
              <!-- Right vertical line -->
              <line :x1="triplet.endX" :y1="15" :x2="triplet.endX" :y2="20" class="triplet-line"/>
              <!-- Number 3 in the middle -->
              <text :x="(triplet.startX + triplet.endX) / 2" y="14" class="triplet-number">3</text>
            </g>
          </template>
          
          <!-- Bar line at end of measure - different types -->
          <g class="bar-lines" :transform="`translate(${measureWidth - 2}, 0)`">
            <!-- Normal thin bar -->
            <line v-if="measure.barType === 'bar_thin'" class="bar-line" x1="0" y1="25" x2="0" y2="75"/>
            
            <!-- Double bar (thin-thin) -->
            <template v-if="measure.barType === 'bar_dbl_thin'">
              <line class="bar-line" x1="-4" y1="25" x2="-4" y2="75"/>
              <line class="bar-line" x1="0" y1="25" x2="0" y2="75"/>
            </template>
            
            <!-- Final bar (thin-thick) -->
            <template v-if="measure.barType === 'bar_thin_thick'">
              <line class="bar-line" x1="-6" y1="25" x2="-6" y2="75"/>
              <rect class="bar-thick" x="-2" y="25" width="4" height="50"/>
            </template>
            
            <!-- Left repeat |: -->
            <template v-if="measure.barType === 'bar_left_repeat'">
              <rect class="bar-thick" x="-6" y="25" width="4" height="50"/>
              <line class="bar-line" x1="0" y1="25" x2="0" y2="75"/>
              <circle class="repeat-dot" cx="6" cy="42" r="2.5"/>
              <circle class="repeat-dot" cx="6" cy="58" r="2.5"/>
            </template>
            
            <!-- Right repeat :| -->
            <template v-if="measure.barType === 'bar_right_repeat'">
              <circle class="repeat-dot" cx="-12" cy="42" r="2.5"/>
              <circle class="repeat-dot" cx="-12" cy="58" r="2.5"/>
              <line class="bar-line" x1="-6" y1="25" x2="-6" y2="75"/>
              <rect class="bar-thick" x="-2" y="25" width="4" height="50"/>
            </template>
            
            <!-- Double repeat :|: -->
            <template v-if="measure.barType === 'bar_dbl_repeat'">
              <circle class="repeat-dot" cx="-16" cy="42" r="2.5"/>
              <circle class="repeat-dot" cx="-16" cy="58" r="2.5"/>
              <line class="bar-line" x1="-10" y1="25" x2="-10" y2="75"/>
              <rect class="bar-thick" x="-6" y="25" width="4" height="50"/>
              <line class="bar-line" x1="2" y1="25" x2="2" y2="75"/>
              <circle class="repeat-dot" cx="8" cy="42" r="2.5"/>
              <circle class="repeat-dot" cx="8" cy="58" r="2.5"/>
            </template>
          </g>
        </g>
      </g>
    </svg>
    
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
import { computed, ref, watch } from 'vue'

const props = defineProps({
  tune: { type: Object, default: null },
  activeNoteIds: { type: Array, default: () => [] },
  debugMode: { type: Boolean, default: false }
})

const emit = defineEmits(['measure-issues'])

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
  // 附点二分音符 (3拍) = 附点 + 2条延音线
  else if (Math.abs(ratio - 3) < 0.05) { 
    dashes = 2 
    augDot = true 
  }
  // 附点十六分音符 (0.375拍)
  else if (Math.abs(ratio - 0.375) < 0.05) { 
    underlines = 2 
    augDot = true 
  }
  // 二分音符 (2拍) = 1条延音线
  else if (Math.abs(ratio - 2) < 0.05) {
    dashes = 1
  }
  // 全音符 (4拍) = 3条延音线
  else if (Math.abs(ratio - 4) < 0.05) {
    dashes = 3
  }
  // 其他长音符
  else if (ratio > 2) {
    dashes = Math.round(ratio) - 1
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

// Calculate appropriate width for each note based on its properties
const getNoteDisplayWidth = (note) => {
  // Base width for the note digit
  let width = NOTE_WIDTH
  
  // Add width for dashes (延音线)
  if (note.dashes > 0) {
    width += note.dashes * DASH_WIDTH
  }
  
  // Add width for augmentation dot
  if (note.augDot) {
    width += 8
  }
  
  return width
}

// Layout notes within a measure - calculates x positions
const layoutMeasureNotes = (measure) => {
  if (!measure.notes || measure.notes.length === 0) return
  
  const availableWidth = measureWidth - MEASURE_PADDING * 2
  
  // First pass: calculate total minimum width needed
  let totalMinWidth = 0
  measure.notes.forEach(note => {
    note.displayWidth = getNoteDisplayWidth(note)
    totalMinWidth += note.displayWidth
  })
  
  // Calculate scale factor if we need to compress
  const scaleFactor = totalMinWidth > availableWidth ? availableWidth / totalMinWidth : 1
  
  // Second pass: assign x positions
  let currentX = 0
  measure.notes.forEach((note, idx) => {
    note.x = currentX
    currentX += note.displayWidth * scaleFactor
  })
  
  // Update tie start/end x positions
  measure.ties.forEach(tie => {
    const startNote = measure.notes[tie.startIdx]
    const endNote = measure.notes[tie.endIdx]
    if (startNote && endNote) {
      tie.startX = startNote.x + NOTE_WIDTH / 2
      tie.endX = endNote.x + NOTE_WIDTH / 2
    }
  })
  
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
        endX: note.x + NOTE_WIDTH
      })
      inTriplet = false
      tripletStart = -1
    }
  })
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
const underflowMeasures = ref(0)

const computedRows = computed(() => {
  if (!props.tune?.lines) return []
  
  let keyRoot = 0
  const allMeasures = []
  let currentMeasure = { notes: [], ties: [], totalDuration: 0, barType: 'bar_thin' }
  let noteCount = 0
  let measureIndex = 0
  const meter = getMeterInfo()
  // Calculate expected duration for a measure (in abcjs units: 1 = whole note)
  const expectedMeasureDuration = meter.num / meter.den
  
  // Track for tie detection - need to track across measures too
  let prevNoteForTie = null
  
  // Accumulated beat position for grouping
  let beatPosition = 0
  
  props.tune.lines.forEach(line => {
    if (!line.staff) return
    line.staff.forEach(staff => {
      if (staff.key) keyRoot = getKeyRootPitch(staff.key)
      staff.voices.forEach(voice => {
        voice.forEach(el => {
          const elId = el._myId || null
          
          if (el.el_type === 'bar') {
            // Only push measure if it has notes (avoid empty first measure)
            if (currentMeasure.notes.length > 0) {
              measureIndex++
              // Check duration status
              const diff = currentMeasure.totalDuration - expectedMeasureDuration
              if (diff > 0.01) {
                currentMeasure.durationStatus = 'overflow'
                currentMeasure.durationDiff = diff
              } else if (diff < -0.01) {
                currentMeasure.durationStatus = 'underflow'
                currentMeasure.durationDiff = diff
              } else {
                currentMeasure.durationStatus = 'ok'
                currentMeasure.durationDiff = 0
              }
              currentMeasure.measureNumber = measureIndex
              currentMeasure.expectedDuration = expectedMeasureDuration
              
              // Determine bar type from el.type
              currentMeasure.barType = el.type || 'bar_thin'
              
              // Recalculate note positions based on actual content
              layoutMeasureNotes(currentMeasure)
              
              allMeasures.push(currentMeasure)
            }
            // Start new measure - reset prevNoteForTie to null
            // Cross-measure ties are complex and would need separate handling
            currentMeasure = { notes: [], ties: [], totalDuration: 0, barType: 'bar_thin' }
            beatPosition = 0
            prevNoteForTie = null
          } else if (el.el_type === 'note') {
            noteCount++
            const duration = el.duration || 0.25
            
            if (el.rest) {
              // Split long rests into multiple quarter note rests
              const restNotes = splitRestIntoQuarters(duration, elId, noteCount)
              restNotes.forEach(note => {
                note.beatGroup = Math.floor(beatPosition / 0.25)
                currentMeasure.notes.push(note)
                beatPosition += note.duration
              })
              currentMeasure.totalDuration += duration
              prevNoteForTie = null
            } else if (el.pitches?.[0]) {
              const p = el.pitches[0]
              const jData = pitchToJianpu(p.pitch, keyRoot)
              const rhythm = getDurationInfo(duration, false)
              
              // Check for triplet
              const isTriplet = el.startTriplet || el.endTriplet || (el.triplet !== undefined)
              
              // Check tie flags - try both pitch level and element level
              const hasStartTie = !!(p.startTie || el.startTie)
              const hasEndTie = !!(p.endTie || el.endTie)
              
              const noteObj = {
                id: elId,
                x: 0, // Will be calculated later
                number: jData.number,
                isRest: false,
                highDots: jData.octave > 0 ? jData.octave : 0,
                lowDots: jData.octave < 0 ? Math.abs(jData.octave) : 0,
                accidental: p.accidental ? (ACCIDENTAL_SYMBOLS[p.accidental] || null) : null,
                ...rhythm,
                duration: duration,
                pitch: p.pitch,
                hasTieStart: hasStartTie,
                hasTieEnd: hasEndTie,
                beatGroup: Math.floor(beatPosition / 0.25),
                isTriplet: isTriplet,
                startTriplet: el.startTriplet,
                endTriplet: el.endTriplet
              }
              
              // Record current note index before adding
              const noteIndex = currentMeasure.notes.length
              
              currentMeasure.notes.push(noteObj)
              currentMeasure.totalDuration += duration
              beatPosition += duration
              
              // Check for tie - if previous note has startTie and this note has same pitch
              if (prevNoteForTie && prevNoteForTie.hasTieStart && 
                  prevNoteForTie.pitch === noteObj.pitch) {
                currentMeasure.ties.push({
                  startIdx: prevNoteForTie.index,
                  endIdx: noteIndex
                })
              }
              
              // Store current note info for next iteration
              prevNoteForTie = {
                ...noteObj,
                index: noteIndex
              }
            }
          }
        })
      })
    })
  })
  
  // Handle last measure (without trailing bar)
  if (currentMeasure.notes.length > 0) {
    measureIndex++
    const diff = currentMeasure.totalDuration - expectedMeasureDuration
    if (diff > 0.01) {
      currentMeasure.durationStatus = 'overflow'
      currentMeasure.durationDiff = diff
    } else if (diff < -0.01) {
      currentMeasure.durationStatus = 'underflow'
      currentMeasure.durationDiff = diff
    } else {
      currentMeasure.durationStatus = 'ok'
      currentMeasure.durationDiff = 0
    }
    currentMeasure.measureNumber = measureIndex
    currentMeasure.expectedDuration = expectedMeasureDuration
    layoutMeasureNotes(currentMeasure)
    allMeasures.push(currentMeasure)
  }
  
  totalNotes.value = noteCount
  totalMeasures.value = allMeasures.length
  overflowMeasures.value = allMeasures.filter(m => m.durationStatus === 'overflow').length
  underflowMeasures.value = allMeasures.filter(m => m.durationStatus === 'underflow').length
  
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

.bar-thick {
  fill: #444;
}

.repeat-dot {
  fill: #444;
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

/* Triplet bracket */
.triplet-bracket .triplet-line {
  stroke: #444;
  stroke-width: 1;
}

.triplet-bracket .triplet-number {
  font-size: 10px;
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

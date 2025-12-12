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
            :x="0" :y="10" :width="measureWidth" :height="60"
          />
          <rect 
            v-if="measure.durationStatus === 'underflow'"
            class="duration-warning-bg underflow"
            :x="0" :y="10" :width="measureWidth" :height="60"
          />
          
          <!-- Duration status indicator -->
          <g v-if="measure.durationStatus !== 'ok'" class="duration-indicator">
            <text 
              :x="measureWidth - 5" 
              y="8" 
              class="duration-label"
              :class="measure.durationStatus"
            >
              {{ measure.durationStatus === 'overflow' ? '⚠超' : '⚠缺' }}
            </text>
          </g>
          
          <!-- Notes in this measure -->
          <g v-for="(note, nIdx) in measure.notes" :key="nIdx" 
             :transform="`translate(${note.x}, 0)` + (note.isGrace ? ' scale(0.65)' : '')"
             :class="{ 'grace-note-group': note.isGrace }">
            <!-- Highlight rect (check both id and originalId for split rests) -->
            <rect 
              v-if="!note.isGrace && (activeIds.has(note.id) || (note.originalId && activeIds.has(note.originalId)))"
              class="highlight-bg"
              :x="-5" :y="15" :width="(note.displayWidth || NOTE_WIDTH) + 10" :height="55"
            />
            
            <!-- Accidental -->
            <text v-if="note.accidental" class="accidental" :x="0" y="48">{{ note.accidental }}</text>
            
            <!-- High octave dots -->
            <template v-if="note.highDots > 0">
              <circle v-for="d in note.highDots" :key="'h'+d" 
                class="octave-dot" 
                :cx="15" :cy="22 - (d-1)*10" r="3"
              />
            </template>
            
            <!-- Main number -->
            <text class="note-number" :class="{ 'is-rest': note.isRest, 'is-grace': note.isGrace }" x="15" y="50">{{ note.number }}</text>
            
            <!-- Low octave dots -->
            <template v-if="note.lowDots > 0">
              <circle v-for="d in note.lowDots" :key="'l'+d" 
                class="octave-dot" 
                :cx="15" :cy="68 + (d-1)*10 + note.underlines * 5" r="3"
              />
            </template>
            
            <!-- Underlines for short notes -->
            <template v-if="note.underlines > 0">
              <line v-for="u in note.underlines" :key="'u'+u"
                class="underline"
                :x1="3" :y1="60 + (u-1)*5" :x2="27" :y2="60 + (u-1)*5"
              />
            </template>
            
            <!-- Augmentation dot (only for non-rest, non-grace notes) -->
            <circle v-if="note.augDot && !note.isRest && !note.isGrace" class="aug-dot" :cx="32" :cy="45" r="3"/>
            
            <!-- Dashes for long notes (延音线) -->
            <template v-if="note.dashes > 0 && !note.isRest && !note.isGrace">
              <line v-for="d in note.dashes" :key="'d'+d"
                class="dash"
                :x1="32 + (d-1)*25" :y1="45" :x2="52 + (d-1)*25" :y2="45"
              />
            </template>
          </g>
          
          <!-- Tie lines (same pitch) -->
          <template v-for="(tie, tIdx) in measure.ties" :key="'tie'+tIdx">
            <path 
              class="tie-line"
              :d="getTiePath(tie)"
            />
          </template>
          
          <!-- Slur lines (different pitches) -->
          <template v-for="(slur, sIdx) in measure.slurs" :key="'slur'+sIdx">
            <path 
              class="slur-line"
              :d="getSlurPath(slur)"
            />
          </template>
          
          <!-- Triplet brackets (三连音) -->
          <template v-for="(triplet, tpIdx) in measure.tripletGroups" :key="'triplet'+tpIdx">
            <g class="triplet-bracket">
              <!-- Left vertical line -->
              <line :x1="triplet.startX + 5" :y1="12" :x2="triplet.startX + 5" :y2="18" class="triplet-line"/>
              <!-- Horizontal line -->
              <line :x1="triplet.startX + 5" :y1="12" :x2="triplet.endX + 25" :y2="12" class="triplet-line"/>
              <!-- Right vertical line -->
              <line :x1="triplet.endX + 25" :y1="12" :x2="triplet.endX + 25" :y2="18" class="triplet-line"/>
              <!-- Number 3 in the middle -->
              <text :x="(triplet.startX + triplet.endX + 30) / 2" y="10" class="triplet-number">3</text>
            </g>
          </template>
          
          <!-- Left bar line at start of measure (for left repeat) -->
          <g v-if="measure.startBarType === 'bar_left_repeat'" class="bar-lines" transform="translate(2, 0)">
            <rect class="bar-thick" x="-2" y="20" width="3" height="45"/>
            <line class="bar-line" x1="4" y1="20" x2="4" y2="65"/>
            <circle class="repeat-dot" cx="10" cy="35" r="3"/>
            <circle class="repeat-dot" cx="10" cy="50" r="3"/>
          </g>
          
          <!-- Bar line at end of measure - different types -->
          <g class="bar-lines" :transform="`translate(${measureWidth - 2}, 0)`">
            <!-- Normal thin bar -->
            <line v-if="measure.barType === 'bar_thin'" class="bar-line" x1="0" y1="20" x2="0" y2="65"/>
            
            <!-- Double bar (thin-thin) -->
            <template v-if="measure.barType === 'bar_dbl_thin'">
              <line class="bar-line" x1="-4" y1="20" x2="-4" y2="65"/>
              <line class="bar-line" x1="0" y1="20" x2="0" y2="65"/>
            </template>
            
            <!-- Final bar (thin-thick) -->
            <template v-if="measure.barType === 'bar_thin_thick'">
              <line class="bar-line" x1="-6" y1="20" x2="-6" y2="65"/>
              <rect class="bar-thick" x="-2" y="20" width="3" height="45"/>
            </template>
            
            <!-- Left repeat |: -->
            <template v-if="measure.barType === 'bar_left_repeat'">
              <rect class="bar-thick" x="-6" y="20" width="3" height="45"/>
              <line class="bar-line" x1="0" y1="20" x2="0" y2="65"/>
              <circle class="repeat-dot" cx="6" cy="35" r="3"/>
              <circle class="repeat-dot" cx="6" cy="50" r="3"/>
            </template>
            
            <!-- Right repeat :| -->
            <template v-if="measure.barType === 'bar_right_repeat'">
              <circle class="repeat-dot" cx="-12" cy="35" r="3"/>
              <circle class="repeat-dot" cx="-12" cy="50" r="3"/>
              <line class="bar-line" x1="-6" y1="20" x2="-6" y2="65"/>
              <rect class="bar-thick" x="-2" y="20" width="3" height="45"/>
            </template>
            
            <!-- Double repeat :|: -->
            <template v-if="measure.barType === 'bar_dbl_repeat'">
              <circle class="repeat-dot" cx="-16" cy="35" r="3"/>
              <circle class="repeat-dot" cx="-16" cy="50" r="3"/>
              <line class="bar-line" x1="-10" y1="20" x2="-10" y2="65"/>
              <rect class="bar-thick" x="-6" y="20" width="3" height="45"/>
              <line class="bar-line" x1="2" y1="20" x2="2" y2="65"/>
              <circle class="repeat-dot" cx="8" cy="35" r="3"/>
              <circle class="repeat-dot" cx="8" cy="50" r="3"/>
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
const NOTE_WIDTH = 40  // 增大音符宽度
const DASH_WIDTH = 25  // 增大延音线间距
const MEASURE_PADDING = 15
const MEASURES_PER_ROW = 4
const rowHeight = 100  // 调整行高
const measureWidth = 220 // 增大小节宽度

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
    // Grace notes are smaller
    if (note.isGrace) {
      note.displayWidth = NOTE_WIDTH * 0.6
    } else {
      note.displayWidth = getNoteDisplayWidth(note)
    }
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
  
  // Update slur start/end x positions
  if (measure.slurs) {
    measure.slurs.forEach(slur => {
      const startNote = measure.notes[slur.startIdx]
      const endNote = measure.notes[slur.endIdx]
      if (startNote && endNote) {
        slur.startX = startNote.x + NOTE_WIDTH / 2
        slur.endX = endNote.x + NOTE_WIDTH / 2
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

// Calculate tie path (arc above notes, for same pitch) - 连音线在音符下方
const getTiePath = (tie) => {
  if (!tie.startX || !tie.endX) return ''
  const x1 = tie.startX + 15
  const x2 = tie.endX + 15
  const y = 65 // Below the notes
  const midX = (x1 + x2) / 2
  const distance = Math.abs(x2 - x1)
  const height = Math.min(12, Math.max(8, distance * 0.2)) // Arc height scales with distance
  return `M ${x1} ${y} Q ${midX} ${y + height} ${x2} ${y}`
}

// Calculate slur path (curved line below notes, for different pitches) - 圆滑线也在下方
const getSlurPath = (slur) => {
  if (!slur.startX || !slur.endX) return ''
  const x1 = slur.startX + 15
  const x2 = slur.endX + 15
  const y = 70 // Below the notes
  const midX = (x1 + x2) / 2
  const distance = Math.abs(x2 - x1)
  const height = Math.min(15, Math.max(10, distance * 0.25))
  return `M ${x1} ${y} Q ${midX} ${y + height} ${x2} ${y}`
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
  let currentMeasure = { notes: [], ties: [], slurs: [], totalDuration: 0, barType: 'bar_thin', startBarType: null }
  let noteCount = 0
  let measureIndex = 0
  const meter = getMeterInfo()
  // Calculate expected duration for a measure (in abcjs units: 1 = whole note)
  const expectedMeasureDuration = meter.num / meter.den
  
  // Track for tie detection - global tracking across all measures
  // key: pitch, value: { measureIdx, noteIdx, note }
  let pendingTie = null
  
  // Track for slur detection - global tracking
  let slurStartInfo = null // { measureIdx, noteIdx }
  let inSlur = false
  
  // Track pending left repeat for next measure
  let pendingStartBarType = null
  
  // Accumulated beat position for grouping
  let beatPosition = 0
  
  // Store all notes globally for cross-measure tie/slur resolution
  const globalNotes = []
  
  props.tune.lines.forEach(line => {
    if (!line.staff) return
    line.staff.forEach(staff => {
      if (staff.key) keyRoot = getKeyRootPitch(staff.key)
      staff.voices.forEach(voice => {
        voice.forEach(el => {
          const elId = el._myId || null
          
          if (el.el_type === 'bar') {
            // Debug bar type
            console.log('Bar type:', el.type)
            
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
              const barType = el.type || 'bar_thin'
              
              // Handle bar types - right repeat goes to current measure end
              // left repeat goes to next measure start
              // Support different abcjs bar type names
              if (barType === 'bar_left_repeat' || barType === 'bar_thick_thin') {
                // Left repeat |: put at start of NEXT measure
                currentMeasure.barType = 'bar_thin'
                pendingStartBarType = 'bar_left_repeat'
              } else if (barType === 'bar_dbl_repeat') {
                // Double repeat :|: right repeat at current end, left repeat at next start
                currentMeasure.barType = 'bar_right_repeat'
                pendingStartBarType = 'bar_left_repeat'
              } else if (barType === 'bar_right_repeat') {
                // Right repeat :| at end of current measure
                currentMeasure.barType = 'bar_right_repeat'
              } else {
                currentMeasure.barType = barType
              }
              
              // Recalculate note positions based on actual content
              layoutMeasureNotes(currentMeasure)
              
              allMeasures.push(currentMeasure)
            } else if (el.type === 'bar_left_repeat' || el.type === 'bar_thick_thin') {
              // First bar is a left repeat - save for first measure
              pendingStartBarType = 'bar_left_repeat'
            }
            
            // Start new measure
            currentMeasure = { 
              notes: [], 
              ties: [], 
              slurs: [],
              totalDuration: 0, 
              barType: 'bar_thin',
              startBarType: pendingStartBarType
            }
            pendingStartBarType = null
            beatPosition = 0
            // Ties and slurs can cross barlines - don't reset them
          } else if (el.el_type === 'note') {
            noteCount++
            const duration = el.duration || 0.25
            
            // Check for grace notes first
            if (el.gracenotes && el.gracenotes.length > 0) {
              // Process grace notes - they appear before the main note
              el.gracenotes.forEach((grace, graceIdx) => {
                const graceData = pitchToJianpu(grace.pitch, keyRoot)
                const graceNote = {
                  id: `${elId}_grace_${graceIdx}`,
                  x: 0,
                  number: graceData.number,
                  isRest: false,
                  isGrace: true,
                  highDots: graceData.octave > 0 ? graceData.octave : 0,
                  lowDots: graceData.octave < 0 ? Math.abs(graceData.octave) : 0,
                  accidental: grace.accidental ? (ACCIDENTAL_SYMBOLS[grace.accidental] || null) : null,
                  dashes: 0,
                  underlines: 2, // Grace notes are typically 16th notes
                  augDot: false,
                  duration: 0, // Grace notes don't take time
                  pitch: grace.pitch
                }
                currentMeasure.notes.push(graceNote)
              })
            }
            
            if (el.rest) {
              // Split long rests into multiple quarter note rests
              const restNotes = splitRestIntoQuarters(duration, elId, noteCount)
              restNotes.forEach(note => {
                note.beatGroup = Math.floor(beatPosition / 0.25)
                currentMeasure.notes.push(note)
                beatPosition += note.duration
              })
              currentMeasure.totalDuration += duration
              // Rests break ties
              pendingTie = null
            } else if (el.pitches?.[0]) {
              const p = el.pitches[0]
              const jData = pitchToJianpu(p.pitch, keyRoot)
              const rhythm = getDurationInfo(duration, false)
              
              // Check for triplet
              const isTriplet = el.startTriplet || el.endTriplet || (el.triplet !== undefined)
              
              // Check tie flags - try both pitch level and element level
              const hasStartTie = !!(p.startTie || el.startTie)
              const hasEndTie = !!(p.endTie || el.endTie)
              
              // Check slur flags
              const hasStartSlur = !!(p.startSlur || el.startSlur)
              const hasEndSlur = !!(p.endSlur || el.endSlur)
              
              const noteObj = {
                id: elId,
                x: 0, // Will be calculated later
                number: jData.number,
                isRest: false,
                isGrace: false,
                highDots: jData.octave > 0 ? jData.octave : 0,
                lowDots: jData.octave < 0 ? Math.abs(jData.octave) : 0,
                accidental: p.accidental ? (ACCIDENTAL_SYMBOLS[p.accidental] || null) : null,
                ...rhythm,
                duration: duration,
                pitch: p.pitch,
                hasTieStart: hasStartTie,
                hasTieEnd: hasEndTie,
                hasSlurStart: hasStartSlur,
                hasSlurEnd: hasEndSlur,
                beatGroup: Math.floor(beatPosition / 0.25),
                isTriplet: isTriplet,
                startTriplet: el.startTriplet,
                endTriplet: el.endTriplet
              }
              
              // Record current note index before adding
              const noteIndex = currentMeasure.notes.length
              const currentMeasureIdx = allMeasures.length // Index of current measure (before it's pushed)
              
              currentMeasure.notes.push(noteObj)
              currentMeasure.totalDuration += duration
              beatPosition += duration
              
              // Track global note position
              globalNotes.push({
                measureIdx: currentMeasureIdx,
                noteIdx: noteIndex,
                note: noteObj
              })
              
              // Check for tie end - if we have a pending tie start with same pitch
              if (pendingTie && pendingTie.pitch === noteObj.pitch) {
                // Same measure tie
                if (pendingTie.measureIdx === currentMeasureIdx) {
                  currentMeasure.ties.push({
                    startIdx: pendingTie.noteIdx,
                    endIdx: noteIndex
                  })
                }
                // Cross-measure tie - we'll need to handle this differently
                // For now, just clear the pending tie
                pendingTie = null
              }
              
              // If this note starts a tie, record it
              if (hasStartTie) {
                pendingTie = {
                  measureIdx: currentMeasureIdx,
                  noteIdx: noteIndex,
                  pitch: noteObj.pitch
                }
              }
              
              // Check for slur start
              if (hasStartSlur) {
                inSlur = true
                slurStartInfo = { measureIdx: currentMeasureIdx, noteIdx: noteIndex }
              }
              
              // Check for slur end
              if (hasEndSlur && inSlur && slurStartInfo) {
                // Same measure slur
                if (slurStartInfo.measureIdx === currentMeasureIdx) {
                  currentMeasure.slurs.push({
                    startIdx: slurStartInfo.noteIdx,
                    endIdx: noteIndex
                  })
                }
                // Cross-measure slur would need special handling
                inSlur = false
                slurStartInfo = null
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
  font-family: 'SimSun', 'Songti SC', 'STSong', serif;
  background: #fff;
  padding: 30px;
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
  font-family: 'Times New Roman', 'SimSun', serif;
  font-weight: 500;
  fill: #000;
  text-anchor: middle;
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
  stroke-width: 2.5;
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

.highlight-bg {
  fill: rgba(208, 48, 80, 0.2);
  rx: 4;
}

/* Tie line (连音线 - 音符下方弧线) */
.tie-line {
  fill: none;
  stroke: #000;
  stroke-width: 1.5;
}

/* Slur line (圆滑线 - 音符下方弧线) */
.slur-line {
  fill: none;
  stroke: #000;
  stroke-width: 1.5;
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

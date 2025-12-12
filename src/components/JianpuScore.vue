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

    <!-- Music Lines (3 measures per line) -->
    <div class="music-body">
      <div v-for="(row, rowIdx) in displayRows" :key="rowIdx" class="music-row">
        <div v-for="(measure, mIdx) in row" :key="mIdx" class="measure">
          <template v-for="(el, elIdx) in measure.elements" :key="elIdx">
            <!-- Note -->
            <span 
              v-if="el.type === 'note'" 
              class="note"
              :class="{ 'highlight': activeIds.has(el.id) }"
            >
              <span v-if="el.accidental" class="acc">{{ el.accidental }}</span>
              <span class="note-inner">
                <span v-if="el.highDots" class="dot-high">{{ '·'.repeat(el.highDots) }}</span>
                <span class="num">{{ el.number }}</span>
                <span v-if="el.lowDots" class="dot-low">{{ '·'.repeat(el.lowDots) }}</span>
                <span v-if="el.underlineCount" class="underlines">
                  <span v-for="n in el.underlineCount" :key="n" class="uline"></span>
                </span>
              </span>
              <span v-if="el.dots" class="aug">·</span>
              <span v-for="d in el.dashes" :key="d" class="dash">-</span>
            </span>

            <!-- Rest -->
            <span 
              v-else-if="el.type === 'rest'" 
              class="note rest"
              :class="{ 'highlight': activeIds.has(el.id) }"
            >
              <span class="note-inner">
                <span class="num">0</span>
                <span v-if="el.underlineCount" class="underlines">
                  <span v-for="n in el.underlineCount" :key="n" class="uline"></span>
                </span>
              </span>
              <span v-for="d in el.dashes" :key="d" class="dash">-</span>
            </span>
          </template>
          <!-- Bar line at the end of each measure -->
          <span class="bar">|</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  tune: { type: Object, default: null },
  activeNoteIds: { type: Array, default: () => [] }
})

const activeIds = computed(() => new Set(props.activeNoteIds))

// Constants
const MEASURES_PER_ROW = 3
const KEY_ROOT_PITCH = { 'C': 0, 'D': 1, 'E': 2, 'F': 3, 'G': 4, 'A': 5, 'B': 6 }
const ACCIDENTAL_SYMBOLS = { 'sharp': '#', 'flat': '♭', 'natural': '♮', 'dblsharp': '×', 'dblflat': '♭♭' }

// Convert diatonic pitch to Jianpu
const pitchToJianpu = (diatonicPitch, keyRootPitch) => {
  let relativePitch = diatonicPitch - keyRootPitch
  let octave = 0
  while (relativePitch < 0) { relativePitch += 7; octave-- }
  while (relativePitch >= 7) { relativePitch -= 7; octave++ }
  return { number: relativePitch + 1, octave }
}

const getKeyRootPitch = (keyObj) => {
  if (!keyObj || !keyObj.root) return 0
  return KEY_ROOT_PITCH[keyObj.root.toUpperCase()] || 0
}

// Duration to rhythm info
const getDurationInfo = (duration) => {
  const ratio = duration / 0.25
  let dashes = 0, underlines = 0, dots = 0
  
  if (Math.abs(ratio - 1.5) < 0.05) { dots = 1 }
  else if (Math.abs(ratio - 0.75) < 0.05) { underlines = 1; dots = 1 }
  else if (Math.abs(ratio - 3) < 0.05) { dashes = 2; dots = 1 }
  else if (Math.abs(ratio - 0.375) < 0.05) { underlines = 2; dots = 1 }
  else {
    if (ratio >= 2) dashes = Math.round(ratio) - 1
    else if (ratio < 0.99) {
      if (ratio <= 0.51) underlines = 1
      if (ratio <= 0.26) underlines = 2
      if (ratio <= 0.13) underlines = 3
    }
  }
  return { dashes, underlineCount: underlines, dots }
}

// Computed: Key and Meter display
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
  if (m.type === 'cut_time') return '2/2'
  return null
})

// Main: Parse tune into measures, then group into rows
const displayRows = computed(() => {
  if (!props.tune?.lines) return []
  
  let currentKeyRoot = 0
  const allMeasures = [] // Array of { elements: [] }
  let currentMeasure = { elements: [] }
  
  props.tune.lines.forEach(line => {
    if (!line.staff) return
    
    line.staff.forEach(staff => {
      if (staff.key) currentKeyRoot = getKeyRootPitch(staff.key)
      
      staff.voices.forEach(voice => {
        voice.forEach(el => {
          const elId = el._myId || null
          
          if (el.el_type === 'bar') {
            // End current measure
            if (currentMeasure.elements.length > 0) {
              allMeasures.push(currentMeasure)
              currentMeasure = { elements: [] }
            }
          } else if (el.el_type === 'note') {
            if (el.rest) {
              currentMeasure.elements.push({
                type: 'rest',
                id: elId,
                ...getDurationInfo(el.duration)
              })
            } else if (el.pitches?.[0]) {
              const p = el.pitches[0]
              const jData = pitchToJianpu(p.pitch, currentKeyRoot)
              const rhythm = getDurationInfo(el.duration)
              currentMeasure.elements.push({
                type: 'note',
                id: elId,
                number: jData.number,
                highDots: jData.octave > 0 ? jData.octave : 0,
                lowDots: jData.octave < 0 ? Math.abs(jData.octave) : 0,
                accidental: p.accidental ? (ACCIDENTAL_SYMBOLS[p.accidental] || null) : null,
                ...rhythm
              })
            }
          }
        })
      })
    })
  })
  
  // Push last measure if not empty
  if (currentMeasure.elements.length > 0) {
    allMeasures.push(currentMeasure)
  }
  
  // Group measures into rows (MEASURES_PER_ROW per row)
  const rows = []
  for (let i = 0; i < allMeasures.length; i += MEASURES_PER_ROW) {
    rows.push(allMeasures.slice(i, i + MEASURES_PER_ROW))
  }
  
  return rows
})
</script>

<style scoped>
.jianpu-score {
  font-family: 'SimSun', 'Songti SC', 'Noto Serif SC', serif;
  background: #fff;
  padding: 24px;
  color: #222;
  line-height: 1.2;
}

.header-info {
  text-align: center;
  margin-bottom: 32px;
}

.title {
  font-size: 28px;
  font-weight: bold;
  margin-bottom: 8px;
}

.meta-row {
  font-size: 14px;
  color: #555;
  display: flex;
  gap: 24px;
  justify-content: center;
}

.music-body {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.music-row {
  display: flex;
  align-items: flex-start;
  gap: 0;
  border-bottom: 1px solid #eee;
  padding-bottom: 16px;
}

.measure {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px;
  padding: 0 8px;
  min-height: 48px;
}

.bar {
  font-size: 24px;
  color: #666;
  font-weight: 300;
  margin-left: 4px;
}

/* Note container */
.note {
  display: inline-flex;
  align-items: baseline;
  margin: 0 2px;
  position: relative;
}

.acc {
  font-size: 12px;
  margin-right: 1px;
  vertical-align: super;
}

.note-inner {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  position: relative;
}

.num {
  font-size: 20px;
  font-weight: 500;
  line-height: 1;
}

.dot-high, .dot-low {
  font-size: 10px;
  line-height: 0.6;
  letter-spacing: -1px;
}

.dot-high {
  margin-bottom: -4px;
}

.dot-low {
  margin-top: -4px;
}

.underlines {
  display: flex;
  flex-direction: column;
  gap: 2px;
  position: absolute;
  bottom: -8px;
  left: 50%;
  transform: translateX(-50%);
}

.uline {
  display: block;
  width: 14px;
  height: 1px;
  background: #222;
}

.aug {
  font-size: 14px;
  font-weight: bold;
  margin-left: 1px;
}

.dash {
  font-size: 20px;
  margin-left: 2px;
}

/* Highlighting */
.highlight .num,
.highlight .dash,
.highlight .acc {
  color: #d03050;
}
.highlight .uline {
  background: #d03050;
}
.highlight .dot-high,
.highlight .dot-low {
  color: #d03050;
}
</style>

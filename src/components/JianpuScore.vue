<template>
  <div class="jianpu-score" v-if="tune">
    <div class="header-info">
      <div v-if="tune.metaText && tune.metaText.title" class="title">{{ tune.metaText.title }}</div>
      <div class="meta-row">
        <span v-if="keyDisplay">1={{ keyDisplay }}</span>
        <span v-if="meterDisplay">{{ meterDisplay }}</span>
      </div>
    </div>

    <div class="lines-container">
      <div v-for="(line, lineIdx) in renderLines" :key="lineIdx" class="music-line">
        <template v-for="(el, elIdx) in line.elements" :key="el.id || elIdx">
          <!-- Note -->
          <div 
            v-if="el.type === 'note'" 
            class="element note-element"
            :class="{ 'highlight': activeIds.has(el.id) }"
          >
            <!-- Accidental Symbol -->
            <span v-if="el.accidental" class="accidental">{{ el.accidental }}</span>
            
            <!-- Main Note Number + Octave Dots -->
            <div class="note-body">
              <span class="octave-dot high" v-if="el.highDots > 0">{{ '·'.repeat(el.highDots) }}</span>
              <span class="number">{{ el.number }}</span>
              <span class="octave-dot low" v-if="el.lowDots > 0">{{ '·'.repeat(el.lowDots) }}</span>
            </div>

            <!-- Rhythm Underlines -->
            <div v-if="el.underlineCount > 0" class="underlines">
              <div v-for="n in el.underlineCount" :key="n" class="underline-mark"></div>
            </div>

            <!-- Augmentation Dot -->
            <span v-if="el.dots > 0" class="aug-dot">·</span>

            <!-- Dashes for long notes -->
            <template v-if="el.dashes > 0">
              <span v-for="d in el.dashes" :key="d" class="dash">-</span>
            </template>
          </div>

          <!-- Bar Line -->
          <div v-else-if="el.type === 'bar'" class="element bar-line">|</div>

          <!-- Rest -->
          <div 
            v-else-if="el.type === 'rest'" 
            class="element rest-element"
            :class="{ 'highlight': activeIds.has(el.id) }"
          >
            <div class="note-body">
              <span class="number">0</span>
            </div>
            <div v-if="el.underlineCount > 0" class="underlines">
               <div v-for="n in el.underlineCount" :key="n" class="underline-mark"></div>
            </div>
            <template v-if="el.dashes > 0">
              <span v-for="d in el.dashes" :key="d" class="dash">-</span>
            </template>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  tune: {
    type: Object,
    default: null
  },
  activeNoteIds: {
    type: Array,
    default: () => []
  }
})

const activeIds = computed(() => new Set(props.activeNoteIds))

// Note name to semitone offset from C
const NOTE_OFFSETS = {
  'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11
};

// Scale degree mapping (chromatic)
const SCALE_DEGREE = {
  0: '1', 1: '#1', 2: '2', 3: '#2', 4: '3', 
  5: '4', 6: '#4', 7: '5', 8: '#5', 9: '6', 10: '#6', 11: '7'
};

// Map accidental string to symbol
const ACCIDENTAL_SYMBOLS = {
  'sharp': '#',
  'flat': '♭',
  'natural': '♮',
  'dblsharp': '𝄪',
  'dblflat': '𝄫'
};

// Get key root MIDI note (C4 = 60 as base)
const getKeyRootMidi = (keyObj) => {
  if (!keyObj || !keyObj.root) return 60; // Default C
  let base = NOTE_OFFSETS[keyObj.root.toUpperCase()] || 0;
  if (keyObj.acc === 'sharp') base += 1;
  if (keyObj.acc === 'flat') base -= 1;
  return 60 + base;
}

// Convert MIDI pitch to Jianpu number with octave info
const midiToJianpu = (midiPitch, rootMidi) => {
  let semitoneDiff = midiPitch - rootMidi;
  
  let octave = 0;
  while (semitoneDiff < 0) { semitoneDiff += 12; octave--; }
  while (semitoneDiff >= 12) { semitoneDiff -= 12; octave++; }
  
  return {
    number: SCALE_DEGREE[semitoneDiff] || '?',
    octave: octave
  }
}

// Compute display key name
const keyDisplay = computed(() => {
  if (!props.tune || !props.tune.lines || !props.tune.lines[0]) return null;
  const line = props.tune.lines[0];
  if (line.staff && line.staff[0] && line.staff[0].key) {
    const k = line.staff[0].key;
    let s = k.root || 'C';
    if (k.acc === 'sharp') s += '#';
    if (k.acc === 'flat') s += '♭';
    return s;
  }
  return 'C';
})

const meterDisplay = computed(() => {
  if (!props.tune || !props.tune.lines || !props.tune.lines[0]) return null;
  const line = props.tune.lines[0];
  if (line.staff && line.staff[0] && line.staff[0].meter) {
    const m = line.staff[0].meter;
    if (m.type === 'specified' && m.value && m.value[0]) {
      return `${m.value[0].num}/${m.value[0].den}`;
    }
    if (m.type === 'common_time') return '4/4';
    if (m.type === 'cut_time') return '2/2';
  }
  return null;
})

// Main transformation logic
const renderLines = computed(() => {
  if (!props.tune || !props.tune.lines) return [];
  
  let currentKeyRoot = 60; // Default C
  const result = [];
  
  props.tune.lines.forEach((line) => {
    const lineElements = [];
    
    if (line.staff) {
      line.staff.forEach(staff => {
        // Update key
        if (staff.key) {
          currentKeyRoot = getKeyRootMidi(staff.key);
        }
        
        staff.voices.forEach(voice => {
          voice.forEach(el => {
            const elId = el._myId || null;
            
            if (el.el_type === 'note') {
              if (el.rest) {
                // Rest
                const dur = el.duration;
                const ratio = dur / 0.25; // 0.25 = quarter note
                
                let dashes = 0;
                let underlines = 0;
                
                if (ratio >= 2) {
                  dashes = Math.round(ratio) - 1;
                } else if (ratio < 0.99) {
                  if (ratio <= 0.51) underlines = 1;
                  if (ratio <= 0.26) underlines = 2;
                  if (ratio <= 0.13) underlines = 3;
                }
                
                lineElements.push({
                  type: 'rest',
                  id: elId,
                  dashes,
                  underlineCount: underlines
                });
              } else if (el.pitches && el.pitches[0]) {
                // Real Note
                const pitchObj = el.pitches[0];
                const midi = pitchObj.pitch;
                const jData = midiToJianpu(midi, currentKeyRoot);
                
                const dur = el.duration;
                const ratio = dur / 0.25;
                
                let dashes = 0;
                let underlines = 0;
                let dots = 0;
                
                // Dotted note detection
                if (Math.abs(ratio - 1.5) < 0.05) { dots = 1; } // Dotted quarter
                else if (Math.abs(ratio - 0.75) < 0.05) { underlines = 1; dots = 1; } // Dotted eighth
                else if (Math.abs(ratio - 3) < 0.05) { dashes = 2; dots = 1; } // Dotted half
                else {
                  if (ratio >= 2) dashes = Math.round(ratio) - 1;
                  else if (ratio < 0.99) {
                    if (ratio <= 0.51) underlines = 1;
                    if (ratio <= 0.26) underlines = 2;
                    if (ratio <= 0.13) underlines = 3;
                  }
                }

                let highDots = jData.octave > 0 ? jData.octave : 0;
                let lowDots = jData.octave < 0 ? Math.abs(jData.octave) : 0;
                
                // Accidental symbol
                let accSymbol = null;
                if (pitchObj.accidental) {
                  accSymbol = ACCIDENTAL_SYMBOLS[pitchObj.accidental] || pitchObj.accidental;
                }
                
                lineElements.push({
                  type: 'note',
                  id: elId,
                  number: jData.number,
                  highDots,
                  lowDots,
                  accidental: accSymbol,
                  dashes,
                  underlineCount: underlines,
                  dots
                });
              }
            } else if (el.el_type === 'bar') {
               lineElements.push({ type: 'bar' });
            }
          });
        });
      });
    }
    
    if (lineElements.length > 0) {
      result.push({ elements: lineElements });
    }
  });
  
  return result;
})
</script>

<style scoped>
.jianpu-score {
    font-family: 'Arial', 'Microsoft YaHei', sans-serif;
    background: #fff;
    padding: 20px;
    color: #333;
    user-select: none;
}
.header-info {
    text-align: center;
    margin-bottom: 24px;
}
.title {
    font-size: 24px;
    font-weight: bold;
    margin-bottom: 8px;
}
.meta-row {
    font-size: 14px;
    color: #666;
    display: flex;
    gap: 20px;
    justify-content: center;
}

.lines-container {
    display: flex;
    flex-direction: column;
    gap: 24px;
}

.music-line {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 4px;
    line-height: 1;
}

.element {
    display: inline-flex;
    flex-direction: row;
    align-items: flex-end;
    margin: 0 2px;
    position: relative;
    min-height: 32px;
}

.note-element, .rest-element {
    flex-direction: column;
    align-items: center;
    min-width: 18px;
}

.accidental {
    font-size: 12px;
    color: #333;
    position: absolute;
    top: 0;
    left: -8px;
}

.note-body {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: 500;
    line-height: 1;
}

.octave-dot {
    font-size: 10px;
    line-height: 0.6;
    color: #333;
}

.number {
    font-size: 18px;
    font-weight: 600;
}

.underlines {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 2px;
    width: 100%;
    align-items: center;
}
.underline-mark {
    width: 14px;
    height: 1px;
    background: #333;
}

.dash {
    font-size: 18px;
    margin-left: 4px;
    color: #333;
}

.aug-dot {
    position: absolute;
    right: -4px;
    bottom: 8px;
    font-size: 14px;
    font-weight: bold;
}

.bar-line {
    font-size: 24px;
    font-weight: 300;
    color: #666;
    margin: 0 6px;
    align-self: stretch;
    display: flex;
    align-items: center;
}

/* Highlighting */
.highlight .number,
.highlight .dash {
    color: #d03050;
}
.highlight .underline-mark {
    background-color: #d03050;
}
</style>

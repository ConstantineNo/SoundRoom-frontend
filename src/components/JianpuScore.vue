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
            class="note-group"
            :class="{ 'highlight': activeIds.has(el.id) }"
          >
            <div class="note-wrapper">
              <!-- High Octave Dots -->
              <div class="octave-dots high" v-if="el.highDots > 0">
                <span v-for="n in el.highDots" :key="n">·</span>
              </div>
              
              <!-- Main Number with Accidental -->
              <div class="note-main">
                <span v-if="el.accidental" class="accidental">{{ el.accidental }}</span>
                <span class="number">{{ el.number }}</span>
                <span v-if="el.dots > 0" class="aug-dot">·</span>
              </div>
              
              <!-- Low Octave Dots -->
              <div class="octave-dots low" v-if="el.lowDots > 0">
                <span v-for="n in el.lowDots" :key="n">·</span>
              </div>
              
              <!-- Underlines for short notes -->
              <div v-if="el.underlineCount > 0" class="underlines">
                <div v-for="n in el.underlineCount" :key="n" class="underline"></div>
              </div>
            </div>
            
            <!-- Dashes for long notes -->
            <span v-for="d in el.dashes" :key="d" class="dash"> -</span>
          </div>

          <!-- Bar Line -->
          <div v-else-if="el.type === 'bar'" class="bar-line">|</div>

          <!-- Rest -->
          <div 
            v-else-if="el.type === 'rest'" 
            class="note-group rest"
            :class="{ 'highlight': activeIds.has(el.id) }"
          >
            <div class="note-wrapper">
              <div class="note-main">
                <span class="number">0</span>
              </div>
              <div v-if="el.underlineCount > 0" class="underlines">
                <div v-for="n in el.underlineCount" :key="n" class="underline"></div>
              </div>
            </div>
            <span v-for="d in el.dashes" :key="d" class="dash"> -</span>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

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

// ============ PITCH CONVERSION LOGIC ============
// abcjs pitch is DIATONIC: C=0, D=1, E=2, F=3, G=4, A=5, B=6
// One octave = 7 diatonic steps

// Key root in diatonic pitch (C=0)
const KEY_ROOT_PITCH = {
  'C': 0, 'D': 1, 'E': 2, 'F': 3, 'G': 4, 'A': 5, 'B': 6
};

// Accidental symbols
const ACCIDENTAL_SYMBOLS = {
  'sharp': '#',
  'flat': '♭',
  'natural': '♮',
  'dblsharp': '×',
  'dblflat': '♭♭'
};

// Convert diatonic pitch to Jianpu number (1-7) with octave
const pitchToJianpu = (diatonicPitch, keyRootPitch) => {
  // Calculate relative position from key root
  let relativePitch = diatonicPitch - keyRootPitch;
  
  // Normalize to 0-6 range and calculate octave shift
  let octave = 0;
  while (relativePitch < 0) {
    relativePitch += 7;
    octave--;
  }
  while (relativePitch >= 7) {
    relativePitch -= 7;
    octave++;
  }
  
  // Convert to Jianpu number (1-7)
  const number = relativePitch + 1;
  
  return { number, octave };
}

// Get key root pitch from key object
const getKeyRootPitch = (keyObj) => {
  if (!keyObj || !keyObj.root) return 0; // Default C
  return KEY_ROOT_PITCH[keyObj.root.toUpperCase()] || 0;
}

// ============ COMPUTED PROPERTIES ============

const keyDisplay = computed(() => {
  if (!props.tune?.lines?.[0]?.staff?.[0]?.key) return 'C';
  const k = props.tune.lines[0].staff[0].key;
  let s = k.root || 'C';
  if (k.acc === 'sharp') s += '#';
  if (k.acc === 'flat') s += '♭';
  return s;
})

const meterDisplay = computed(() => {
  if (!props.tune?.lines?.[0]?.staff?.[0]?.meter) return null;
  const m = props.tune.lines[0].staff[0].meter;
  if (m.type === 'specified' && m.value?.[0]) {
    return `${m.value[0].num}/${m.value[0].den}`;
  }
  if (m.type === 'common_time') return '4/4';
  if (m.type === 'cut_time') return '2/2';
  return null;
})

// ============ MAIN RENDER LOGIC ============

const renderLines = computed(() => {
  if (!props.tune?.lines) return [];
  
  let currentKeyRoot = 0; // Default C
  const result = [];
  
  props.tune.lines.forEach((line) => {
    const lineElements = [];
    
    if (line.staff) {
      line.staff.forEach(staff => {
        // Update key root
        if (staff.key) {
          currentKeyRoot = getKeyRootPitch(staff.key);
        }
        
        staff.voices.forEach(voice => {
          voice.forEach(el => {
            const elId = el._myId || null;
            
            if (el.el_type === 'note') {
              if (el.rest) {
                // REST
                const rhythmInfo = getDurationInfo(el.duration);
                lineElements.push({
                  type: 'rest',
                  id: elId,
                  ...rhythmInfo
                });
              } else if (el.pitches?.[0]) {
                // NOTE
                const pitchObj = el.pitches[0];
                const diatonicPitch = pitchObj.pitch; // This is the diatonic pitch!
                
                const jData = pitchToJianpu(diatonicPitch, currentKeyRoot);
                const rhythmInfo = getDurationInfo(el.duration);
                
                // Accidental
                let accSymbol = null;
                if (pitchObj.accidental) {
                  accSymbol = ACCIDENTAL_SYMBOLS[pitchObj.accidental] || null;
                }
                
                lineElements.push({
                  type: 'note',
                  id: elId,
                  number: jData.number,
                  highDots: jData.octave > 0 ? jData.octave : 0,
                  lowDots: jData.octave < 0 ? Math.abs(jData.octave) : 0,
                  accidental: accSymbol,
                  ...rhythmInfo
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

// Calculate underlines, dashes, and dots from duration
// abcjs duration: 1.0 = whole note, 0.5 = half, 0.25 = quarter, etc.
function getDurationInfo(duration) {
  const quarterDur = 0.25;
  const ratio = duration / quarterDur;
  
  let dashes = 0;
  let underlines = 0;
  let dots = 0;
  
  // Dotted notes
  if (Math.abs(ratio - 1.5) < 0.05) {
    // Dotted quarter
    dots = 1;
  } else if (Math.abs(ratio - 0.75) < 0.05) {
    // Dotted eighth
    underlines = 1;
    dots = 1;
  } else if (Math.abs(ratio - 3) < 0.05) {
    // Dotted half
    dashes = 2;
    dots = 1;
  } else if (Math.abs(ratio - 0.375) < 0.05) {
    // Dotted sixteenth
    underlines = 2;
    dots = 1;
  } else {
    // Regular notes
    if (ratio >= 2) {
      // Half note or longer: add dashes
      dashes = Math.round(ratio) - 1;
    } else if (ratio < 0.99) {
      // Shorter than quarter: add underlines
      if (ratio <= 0.51) underlines = 1;  // Eighth
      if (ratio <= 0.26) underlines = 2;  // Sixteenth
      if (ratio <= 0.13) underlines = 3;  // Thirty-second
    }
  }
  
  return { dashes, underlineCount: underlines, dots };
}
</script>

<style scoped>
.jianpu-score {
  font-family: 'SimSun', 'Songti SC', serif;
  background: #fff;
  padding: 24px;
  color: #222;
}

.header-info {
  text-align: center;
  margin-bottom: 32px;
}

.title {
  font-size: 28px;
  font-weight: bold;
  margin-bottom: 12px;
}

.meta-row {
  font-size: 14px;
  color: #555;
  display: flex;
  gap: 24px;
  justify-content: center;
}

.lines-container {
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.music-line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px;
  min-height: 48px;
}

/* Note Group: contains wrapper + dashes */
.note-group {
  display: inline-flex;
  align-items: baseline;
}

/* Note Wrapper: contains dots, number, underlines */
.note-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 20px;
  position: relative;
}

/* Octave Dots */
.octave-dots {
  font-size: 10px;
  line-height: 1;
  letter-spacing: -2px;
}
.octave-dots.high {
  margin-bottom: -2px;
}
.octave-dots.low {
  margin-top: -2px;
}

/* Note Main: accidental + number + aug dot */
.note-main {
  display: flex;
  align-items: baseline;
  position: relative;
}

.accidental {
  font-size: 12px;
  margin-right: 1px;
}

.number {
  font-size: 20px;
  font-weight: 500;
}

.aug-dot {
  font-size: 16px;
  font-weight: bold;
  margin-left: 1px;
}

/* Underlines */
.underlines {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  margin-top: 1px;
}

.underline {
  height: 1px;
  width: 16px;
  background: #222;
  margin: 0 auto;
}

/* Dashes */
.dash {
  font-size: 20px;
  color: #222;
}

/* Bar Line */
.bar-line {
  font-size: 24px;
  color: #444;
  margin: 0 8px;
  font-weight: 300;
}

/* Highlighting */
.highlight .number,
.highlight .dash,
.highlight .accidental {
  color: #d03050;
}
.highlight .underline {
  background-color: #d03050;
}
.highlight .octave-dots {
  color: #d03050;
}
</style>

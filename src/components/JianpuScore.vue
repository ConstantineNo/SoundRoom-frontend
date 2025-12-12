<template>
  <div class="jianpu-score" v-if="tune">
    <div class="header-info" v-if="tune.metaText">
      <div v-if="tune.metaText.title" class="title">{{ tune.metaText.title }}</div>
      <div class="meta-row">
        <span v-if="keySig">1={{ keySig }}</span>
        <span v-if="meter">{{ meter }}</span>
      </div>
    </div>

    <div class="lines-container">
      <div v-for="(line, lineIdx) in renderLines" :key="lineIdx" class="music-line">
        <div v-for="(staff, staffIdx) in line.staffs" :key="staffIdx" class="staff">
          <div v-for="(voice, voiceIdx) in staff.voices" :key="voiceIdx" class="voice">
            <template v-for="(el, elIdx) in voice.elements" :key="el.id">
              <!-- Note -->
              <div 
                v-if="el.type === 'note'" 
                class="element note-element"
                :class="{ 'highlight': activeIds.has(el.id) }"
                :ref="(dom) => setRef(el.id, dom)"
              >
                <!-- Arc/Slur Start (Simplified) -->
                
                <!-- Accidentals -->
                <span v-if="el.accidental" class="accidental">{{el.accidental}}</span>
                
                <!-- Main Note Number + Octave Dot -->
                <div class="note-body">
                  <span class="octave-dot high" v-if="el.highDot">{{ el.highDot }}</span>
                  <span class="number">{{ el.number }}</span>
                  <span class="octave-dot low" v-if="el.lowDot">{{ el.lowDot }}</span>
                </div>

                <!-- Rhythm Underlines -->
                <div class="underlines">
                  <div v-for="n in el.underlineCount" :key="n" class="underline-mark"></div>
                </div>

                <!-- Augmentation Dots -->
                <span v-if="el.dots > 0" class="aug-dots">
                  {{ '·'.repeat(el.dots) }}
                </span>

                <!-- Dashes for long notes -->
                <span v-if="el.dashes > 0" class="dashes">
                  {{ ' -'.repeat(el.dashes) }}
                </span>
              </div>

              <!-- Bar Line -->
              <div v-else-if="el.type === 'bar'" class="element bar-line">
                |
              </div>

              <!-- Rest -->
              <div 
                v-else-if="el.type === 'rest'" 
                class="element rest-element"
                :class="{ 'highlight': activeIds.has(el.id) }"
                :ref="(dom) => setRef(el.id, dom)"
              >
                <div class="note-body">
                  <span class="number">0</span>
                </div>
                <div class="underlines">
                   <div v-for="n in el.underlineCount" :key="n" class="underline-mark"></div>
                </div>
                <span v-if="el.dashes > 0" class="dashes">
                  {{ ' -'.repeat(el.dashes) }}
                </span>
              </div>
            </template>
          </div>
        </div>
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
    type: Array, // IDs of notes currently playing
    default: () => []
  }
})

// Map note Refs for external access or internal verify
const elementRefs = ref({})
const setRef = (id, dom) => {
  if (dom) elementRefs.value[id] = dom
}

const activeIds = computed(() => new Set(props.activeNoteIds))

// Helper Consts
const NOTE_OFFSETS = {
  'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11
};
const SCALE_DEGREE = ['1', '#1', '2', '#2', '3', '4', '#4', '5', '#5', '6', '#6', '7'];

// --- Transformer Logic ---

const getRootSemitone = (keyName) => {
  if (!keyName) return 0; // C
  // Parse "G#m", "Eb" etc.
  // We only care about Root Key text usually provided by abcjs in keySignature property or root
  // abcjs visualObj keySignature usually has 'root', 'acc', 'mode'
  // But often we just parse the K: string if possible, or use root object.
  // visualObj.getFormattedK() might help? 
  // Let's rely on manual parsing if keySignature object is obscure, but visualObj usually has key props.
  // Actually, visualObj.lines[0].staff[0].key is the Key object.
  return 0; // TODO: extract correctly from props
} 

// We need to map actual MIDI pitch to Scale Degree based on the Key Scale.
// Simple Diatonic mapping:
// Find semitone offset from Root.
// round to nearest scale degree?
// Better: Movable Do.
// 1 = Root.
const midiToJianpu = (midiPitch, rootMidi) => {
  // normalize root to octave 0 (e.g. C = 0)
  // midiPitch 60 = Middle C.
  // rootMidi: e.g. G major -> G is 1. G4=67.
  
  let semitoneDiff = midiPitch - rootMidi;
  
  // Normalize octave
  let octave = 0;
  while (semitoneDiff < 0) { semitoneDiff += 12; octave--; }
  while (semitoneDiff >= 12) { semitoneDiff -= 12; octave++; }
  
  // Mapping scale degree
  // Major Scale: 0(1), 2(2), 4(3), 5(4), 7(5), 9(6), 11(7)
  const map = {
    0: '1', 1: '#1', 2: '2', 3: '#2', 4: '3', 5: '4', 6: '#4',
    7: '5', 8: '#5', 9: '6', 10: '#6', 11: '7'
  }
  
  return {
    number: map[semitoneDiff] || '?',
    octave: octave
  }
}

// Compute Root from Key
const getKeyRootMidi = (keyObj) => {
  // abcjs Key Object: { root: "G", acc: "", mode: "" }
  // root: char 'c' etc.
  if (!keyObj) return 60; // C4 default
  
  let base = NOTE_OFFSETS[keyObj.root.toUpperCase()] || 0;
  // If acc is "sharp", +1? abcjs keys usually normalized.
  // Let's assume standard root names.
  // If 'acc' prop exists?
  // Easier: Parse "root" property.
  // Let's pick a reference octave, say 4.
  // C4 = 60.
  // G4 = 67.
  // F4 = 65.
  // We need to find THE root note that corresponds to "1".
  // Usually the root nearest to middle C? 
  return 60 + base; // Simplified. Need to handle accidentals in signature.
}

const renderLines = computed(() => {
  if (!props.tune) return [];
  
  // Extract global key info from first staff?
  // Assume constant key for MVP, or track key changes.
  
  // First, find the Key.
  // visualObj doesn't always have a global key object on top.
  // Access key from first line staff?
  let currentKeyRoot = 60; // Default C
  // Try to find K: in raw? Or use structure
  // props.tune.getTotalTime() ... 
  
  // Let's process lines
  const processedLines = [];
  
  // Helper to id
  let uid = 0;
  
  props.tune.lines.forEach((line) => {
    const pLine = { staffs: [] };
    
    if (line.staff) {
      line.staff.forEach(staff => {
        // Update Key if present
        if (staff.key) {
           // Parse staff.key
           // staff.key might be an object: { root: 'G', acc: 'sharp', mode: 'major' ... }
           // Calculate MIDI for root.
           let rootBase = NOTE_OFFSETS[staff.key.root.toUpperCase()] || 0;
           if (staff.key.acc === 'sharp') rootBase += 1;
           if (staff.key.acc === 'flat') rootBase -= 1;
           currentKeyRoot = 60 + rootBase; 
           // Normalize: we want the C4-octave root? 
           // If Root is G, G4(67) is 1.
           // If Root is F, F4(65) is 1.
        }
        
        const pStaff = { voices: [] };
        
        staff.voices.forEach(voice => {
          const pVoice = { elements: [] };
          
          voice.forEach(el => {
              // Capture element for ID mapping later?
              // Assign ID strictly by visual sequence?
              
              // Note Element
              // abcjs element structure: { el_type: "note"|"bar", pitches: [{pitch:60, ...}], duration: 0.5 ... }
              
              // Unique ID using internal object reference if possible, otherwise generate
              // We will rely on Editor injecting an ID, or generate one.
              // Editor will inject ID into `el._myId`.
              const elId = el._myId || `gen_${uid++}`;
              
              if (el.el_type === 'note') {
                  // Handle Rest
                  if (el.rest) {
                      const duration = el.duration; // 1 = quarter note (usually in ABC default L:1/4? No, visualObj duration is normalized)
                      // visualObj duration: 1.0 is usually a quarter note? 
                      // Need to check abcjs normalization. Typically 1.0 = L unit?
                      // Actually abcjs normalizes relative to a whole note maybe?
                      // Wait, standard abcjs duration: .duration field.
                      // Let's observe: Q:1/4, L:1/8. 
                      // Note | 2 | in L:1/8 is duration 1.0? No, let's verify.
                      
                      // Assume we need logic for underlines.
                      // 1 Beat (Quarter) = No underline.
                      // 0.5 Beat (Eighth) = 1 underline.
                      // 0.25 Beat (16th) = 2 underlines.
                      
                      // We need "Base Duration" which is 1 beat.
                      // In standard 4/4, beat is 1/4 note.
                      // If abcjs duration 0.25 = quarter note? 
                      // Usually abcjs duration is relative to Whole Note = 1.0.
                      // So Quarter = 0.25. Eighth = 0.125.
                      
                      const wholeNotedur = el.duration;
                      const quarterDur = 0.25; 
                      const beatDur = quarterDur; // Assuming /4 beat
                      
                      const ratio = wholeNotedur / beatDur;
                      // ratio 1 = Quarter.
                      // ratio 0.5 = Eighth.
                      // ratio 2 = Half.
                      
                      let dashes = 0;
                      let underlines = 0;
                      
                      if (ratio >= 2) {
                          // 2 Beats -> 1 -
                          // 3 Beats -> 1 - -
                          dashes = Math.floor(ratio) - 1;
                      } else if (ratio < 1) {
                          // < 1 Beat
                          if (ratio <= 0.501) underlines = 1;
                          if (ratio <= 0.251) underlines = 2;
                          if (ratio <= 0.126) underlines = 3; 
                      }
                      
                      pVoice.elements.push({
                          type: 'rest',
                          id: elId,
                          dashes,
                          underlineCount: underlines
                      });
                  } else {
                      // Real Note
                      // pitches is array (chords). We take top note or first.
                      const pitchObj = el.pitches && el.pitches[0];
                      if (pitchObj) {
                          const midi = pitchObj.pitch;
                          const jData = midiToJianpu(midi, currentKeyRoot);
                          
                          // Duration Logic (Same as rest)
                          const wholeNotedur = el.duration;
                          const quarterDur = 0.25; 
                          const ratio = wholeNotedur / quarterDur;
                          
                          let dashes = 0;
                          let underlines = 0;
                          let dots = 0; // Augmentation dots?
                          // abcjs doesn't explicitly give dots count easily in `el` sometimes, but `duration` reflects it.
                          // Logic: if ratio is 1.5 -> Dotted Quarter.
                          // if ratio is 0.75 -> Dotted Eighth.
                          
                          // Simplified dot detection
                          // Check standard dotted values
                          const isDotted = (r) => Math.abs((r / 1.5) - 1) < 0.01 || Math.abs((r / 0.75) - 1) < 0.01;
                          if (Math.abs(ratio - 1.5) < 0.01) { dashes = 0; dots = 1; }
                          else if (Math.abs(ratio - 3) < 0.01) { dashes = 2; dots = 1; } // dotted half 3 beats
                          else if (Math.abs(ratio - 0.75) < 0.01) { underlines = 1; dots = 1; }
                          else {
                              // Normal logic
                              if (ratio >= 2) dashes = Math.floor(ratio) - 1;
                              else if (ratio < 0.99) {
                                  if (ratio <= 0.51) underlines = 1;
                                  if (ratio <= 0.26) underlines = 2;
                              }
                          }

                          // Unicode Dots
                          let hDot = null, lDot = null;
                          if (jData.octave > 0) hDot = '\u0307'.repeat(jData.octave);
                          if (jData.octave < 0) lDot = '\u0323'.repeat(Math.abs(jData.octave));
                          
                          pVoice.elements.push({
                              type: 'note',
                              id: elId,
                              number: jData.number,
                              highDot: hDot,
                              lowDot: lDot,
                              accidental: pitchObj.accidental, // 'sharp', 'flat', 'natural' -> transform to symbol?
                              // abcjs accidental usually needs mapping?
                              // el.pitches[0].accidental is undefined if in key? 
                              // If explicit accidental, it might be there.
                              dashes,
                              underlineCount: underlines,
                              dots
                          });
                      }
                  }
              } else if (el.el_type === 'bar') {
                 pVoice.elements.push({ type: 'bar' });
              }
          });
          
          pStaff.voices.push(pVoice);
        });
        
        pLine.staffs.push(pStaff);
      });
    }
    
    processedLines.push(pLine);
  });
  
  return processedLines;
})

const getMeta = computed(() => {
    return props.tune ? props.tune.metaText : {};
})
const keySig = computed(() => {
    // Attempt to extract string 
    return props.tune && props.tune.getKeySignature && props.tune.getKeySignature().root; 
})
const meter = computed(() => {
     return props.tune && props.tune.getMeter && props.tune.getMeter().type;
})

</script>

<style scoped>
.jianpu-score {
    font-family: 'Arial', sans-serif; /* Clean font */
    background: #fff;
    padding: 20px;
    color: #333;
    user-select: none;
}
.header-info {
    text-align: center;
    margin-bottom: 20px;
}
.title {
    font-size: 24px;
    font-weight: bold;
    margin-bottom: 10px;
}
.meta-row {
    font-size: 14px;
    color: #666;
    display: flex;
    gap: 20px;
    justify-content: center;
}
.music-line {
    display: flex;
    flex-direction: column;
    margin-bottom: 30px; /* Space between textual lines */
}
.staff {
    display: flex;
    flex-wrap: wrap; /* Allow wrapping if too long? Usually simple lines don't wrap internally in ABC structure but we might need to? */
    /* Actually abcjs pre-breaks lines. So we prefer no-wrap per line */
    align-items: flex-end; /* Align bottom */
}
.voice {
    display: flex;
    align-items: flex-end;
}
.element {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin: 0 4px; /* Spacing between notes */
    position: relative;
    min-width: 20px;
}
.note-body {
    display: flex;
    flex-direction: column; /* Stack dots vertical */
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: 500;
    line-height: 1;
    position: relative;
}
.octave-dot {
    font-size: 12px; /* Smaller dot */
    line-height: 0.5;
}
/* Unicode combining hack layout: simpler to separate strictly or use absolute? 
   Using separate spans for dots is cleaner for controlling spacing.
*/
.underlines {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 2px;
    width: 100%;
    align-items: center;
}
.underline-mark {
    width: 100%;
    height: 1px;
    background: #333;
    min-width: 12px;
}
.dashes {
    font-size: 18px;
    margin-left: 2px;
}
.aug-dots {
    position: absolute;
    right: -6px;
    bottom: 4px;
    font-size: 12px;
}
.bar-line {
    font-size: 20px;
    font-weight: 300;
    color: #999;
    margin: 0 8px;
    align-self: center; /* Center vertically in the line */
}

/* Highlighting */
.highlight .number, 
.highlight .dashes,
.highlight .underline-mark
{
    color: #d03050;
    background-color: #d03050; /* for underlines which are divs */
}
.highlight .number, .highlight .dashes {
    background-color: transparent; /* reset text bg */
}
</style>

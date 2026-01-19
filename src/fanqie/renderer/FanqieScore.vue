<template>
  <div class="fanqie-score" v-if="score" ref="containerRef">
    <!-- Header -->
    <div class="header-info">
      <h2 v-if="header.titles.length" class="title">{{ header.titles[0] }}</h2>
      <div v-if="header.titles.length > 1" class="subtitle">{{ header.titles[1] }}</div>
      <div class="meta-row">
        <span>1={{ header.key.root }}{{ accChar }}</span>
        <span v-if="header.meters.length">{{ header.meters[0].numerator }}/{{ header.meters[0].denominator }}</span>
        <span v-if="header.tempo">
           {{ header.tempo.bpm ? `J=${header.tempo.bpm}` : header.tempo.text }}
        </span>
      </div>
      <div class="authors" v-if="header.authors.length">
        <div v-for="author in header.authors" :key="author">{{ author }}</div>
      </div>
    </div>

    <!-- Body -->
    <div class="svg-container">
      <svg :width="svgWidth" :height="totalHeight">
        <g v-for="(line, lIdx) in layoutLines" :key="lIdx" :transform="`translate(0, ${line.y})`">
          <!-- Measures -->
          <g v-for="(measure, mIdx) in line.measures" :key="mIdx" :transform="`translate(${measure.x}, 0)`">
            
            <!-- Bar Line (Start/End) -->
            <!-- Usually render Left bar if it's start of line, else render Right bar of prev measure? -->
            <!-- Strategy: Render RIGHT bar of each measure. Left bar only for first measure if needed? -->
            <!-- Fanqie AST barType is at the END of the notes. -->
            
            <!-- Bar Line Rendering -->
            
            <!-- 1. Standard Bar Lines (Right side of measure) -->
            <line v-if="measure.barType === 'bar' || measure.barType === 'final'" 
                  :x1="measure.width" y1="10" :x2="measure.width" y2="50" 
                  class="bar-line" :class="{ 'bold': measure.barType === 'final' }" />
            
            <!-- Double Bar -->
            <g v-if="measure.barType === 'double'">
                 <line :x1="measure.width - 4" y1="10" :x2="measure.width - 4" y2="50" class="bar-line" />
                 <line :x1="measure.width" y1="10" :x2="measure.width" y2="50" class="bar-line" />
            </g>

            <!-- Left Repeat (Usually at Start of NEXT measure, but here we might render at end of empty measure) -->
            <!-- Style: Thick | Thin | : (Dots right) -->
            <!-- If we are rendering 'left_repeat' as an end bar type (from parser), we mimic standard notation: ||: -->
            <!-- Actually Left Repeat is usually ||: -->
            <g v-if="measure.barType === 'left_repeat'">
                <line :x1="measure.width - 6" y1="10" :x2="measure.width - 6" y2="50" class="bar-line bold" />
                <line :x1="measure.width - 2" y1="10" :x2="measure.width - 2" y2="50" class="bar-line" />
                <circle :cx="measure.width + 3" :cy="24" r="2" />
                <circle :cx="measure.width + 3" :cy="36" r="2" />
            </g>

            <!-- Right Repeat (:||) -->
            <!-- Style: : | Thick -->
            <g v-if="measure.barType === 'right_repeat' || measure.barType === 'double_repeat'">
                <circle :cx="measure.width - 8" :cy="24" r="2" />
                <circle :cx="measure.width - 8" :cy="36" r="2" />
                <line :x1="measure.width - 4" y1="10" :x2="measure.width - 4" y2="50" class="bar-line" />
                <line :x1="measure.width" y1="10" :x2="measure.width" y2="50" class="bar-line bold" />
            </g>
            
            <!-- Double Repeat (:||:) -->
             <!-- Complex, combination of both? For now handle as right repeat or custom -->

            <!-- Ending Bracket -->
            <g v-if="measure.endingStart">
               <line :x1="0" y1="5" :x2="measure.width" y2="5" class="ending-line" />
               <line :x1="0" y1="5" :x2="0" y2="15" class="ending-line" />
               <text v-if="measure.endingStart.label" x="5" y="15" class="ending-label">{{ measure.endingStart.label }}</text>
            </g>

            <!-- Notes -->
            <g v-for="(note, nIdx) in measure.notes" :key="nIdx" :transform="`translate(${note.relativeX}, 30)`">
              
              <!-- Pitch -->
              <text class="note-text" :class="{ 'rest': note.type === 'rest' }">
                {{ getNoteText(note) }}
              </text>

              <!-- High Octave dots (Above) -->
              <g v-if="note.octave > 0">
                 <circle v-for="i in note.octave" :key="'h'+i" cy="-18" :cx="0" :r="1.5" :transform="`translate(0, ${-(i-1)*5})`" />
              </g>

              <!-- Low Octave dots (Below Underlines) -->
              <!-- Feature 2: Reduce distance. -->
              <!-- Previous: 16 + (reduce * 5) + 4. Reduced to + 2 and tight loop -->
              <g v-if="note.octave < 0">
                 <circle v-for="i in Math.abs(note.octave)" :key="'l'+i" 
                         :cy="16 + (note.durationReduceCount * 5) + (i-1)*4" 
                         :cx="0" :r="1.5" />
              </g>

              <!-- Dashes (Duration Extend) -->
              <g v-if="note.durationExtendCount > 0">
                  <text v-for="i in note.durationExtendCount" :key="'d'+i" :x="15 * i" y="0" class="dash"> - </text>
              </g>

              <!-- Dots -->
              <circle v-if="note.dots > 0" cx="12" cy="0" r="1.5" />

              <!-- Accidentals -->
              <text v-if="note.accidental === 'sharp'" x="-14" y="-8" class="accidental">#</text>
              <text v-if="note.accidental === 'flat'" x="-14" y="-8" class="accidental">b</text>
              <text v-if="note.accidental === 'natural'" x="-14" y="-8" class="accidental">=</text>
            </g>

            <!-- Beams (Underlines) -->
            <g v-for="(beam, bIdx) in measure.beams" :key="'b'+bIdx">
                <line :x1="beam.x1" :y1="30 + 12 + (beam.level-1)*5" 
                      :x2="beam.x2" :y2="30 + 12 + (beam.level-1)*5" 
                      class="underline" />
            </g>
          </g>
          
          <!-- Lyrics Row -->
          <g v-if="line.computedLyrics && line.computedLyrics.length" transform="translate(0, 70)">
             <text v-for="(word, wIdx) in line.computedLyrics" :key="wIdx" :x="word.x" y="0" class="lyric-text">
                {{ word.text }}
             </text>
          </g>

        </g>
      </svg>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watchEffect, defineProps } from 'vue'

const props = defineProps({
  score: {
     type: Object, // FanqieScore
     required: true
  }
})

const containerRef = ref(null)
const svgWidth = ref(800)
const rowHeight = 120

// Helpers
const header = computed(() => props.score.header)
const accChar = computed(() => {
    if (header.value.key.accidental === 'sharp') return '#'
    if (header.value.key.accidental === 'flat') return 'b'
    return ''
})

const getNoteText = (note) => {
    if (note.type === 'rest') return '0'
    if (note.type === 'hiddenRest') return ''
    if (note.type === 'rhythm') return 'X'
    return note.degree
}

// Layout Calculation
const layoutLines = computed(() => {
    const lines = []
    let currentY = 50 // Start padding
    
    props.score.lines.forEach(rawLine => {
        // Calculate Measure Widths
        let currentX = 20
        const measures = rawLine.measures.map(m => {
            const mStart = currentX
            
            // Notes
            const notes = m.notes.map(n => {
                // Feature 4: Compact within beat, spacious between beats
                // If reduce count > 0 (sub-beat), use smaller width (compact)
                const baseWidth = (n.durationReduceCount > 0) ? 25 : 45
                const width = baseWidth + (n.durationExtendCount * 15)
                
                const relativeX = (currentX - mStart) + (width / 2) // center relative to measure start
                const absoluteX = currentX + (width / 2) // absolute center in line
                
                const noteObj = {
                    ...n,
                    relativeX,
                    absoluteX,
                    width
                }
                // Check if next note is sub-beat? 
                // Simple spacing: Just add width.
                currentX += width
                return noteObj
            })
            
            // Padding for bar line
            currentX += 15

            // Beaming Logic (Merge Underlines)
            const beams = []
            const maxReduce = Math.max(0, ...notes.map(n => n.durationReduceCount || 0))
            
            for (let level = 1; level <= maxReduce; level++) {
                let startIdx = -1
                for (let i = 0; i < notes.length; i++) {
                    if ((notes[i].durationReduceCount || 0) >= level) {
                        if (startIdx === -1) startIdx = i
                    } else {
                        if (startIdx !== -1) {
                            // End sequence
                            beams.push({
                                x1: notes[startIdx].relativeX - 8,
                                x2: notes[i-1].relativeX + 8,
                                level
                            })
                            startIdx = -1
                        }
                    }
                }
                if (startIdx !== -1) {
                    beams.push({
                        x1: notes[startIdx].relativeX - 8,
                        x2: notes[notes.length-1].relativeX + 8,
                        level
                    })
                }
            }
            
            return {
                ...m,
                x: mStart, // absolute start of measure
                width: currentX - mStart, // pixel width
                notes,
                beams
            }
        })
        
        // Lyrics layout
        const computedLyrics = []
        if (rawLine.lyrics && rawLine.lyrics.length > 0) {
            // Flatten notes from all measures in this line
            const allNotes = measures.flatMap(m => m.notes)
            
            const words = rawLine.lyrics[0].filter(w => w.trim() !== '') 
            let noteIndex = 0
            
            words.forEach((w, i) => {
                if (noteIndex < allNotes.length) {
                    computedLyrics.push({
                        text: w,
                        x: allNotes[noteIndex].absoluteX // aligns with note center (absolute)
                    })
                    noteIndex++
                }
            })
        }

        lines.push({
            measures,
            y: currentY,
            computedLyrics
        })
        
        currentY += rowHeight
    })
    
    return lines
})

const totalHeight = computed(() => {
    return layoutLines.value.length * rowHeight + 100
})

</script>

<style scoped>
.fanqie-score {
  font-family: 'Arial', sans-serif;
  padding: 20px;
  background: white;
}

.header-info {
  text-align: center;
  margin-bottom: 20px;
}

.title {
  font-size: 24px;
  font-weight: bold;
}

.meta-row {
  display: flex;
  justify-content: center;
  gap: 20px;
  font-size: 14px;
}

.bar-line {
  stroke: black;
  stroke-width: 1.5;
}
.bar-line.bold {
    stroke-width: 3;
}

.note-text {
  font-size: 20px;
  font-weight: bold;
  text-anchor: middle;
  dominant-baseline: central;
}

.note-text.rest {
    /* Bold like others */
}

.underline {
  stroke: black;
  stroke-width: 1.5;
}

.ending-line {
    stroke: black;
    stroke-width: 1;
    fill: none;
}

.ending-label {
    font-size: 10px;
}

.dash {
    font-size: 20px;
}

.lyric-text {
    font-size: 14px;
    text-anchor: middle;
}

.accidental {
    font-size: 12px;
    font-style: italic;
}
</style>

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
                  <text v-for="i in note.durationExtendCount" :key="'d'+i"
                        :x="12 + (15 * (i - 1))" y="0"
                        class="dash">—</text>
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

            <!-- Slurs (连音线) -->
            <g v-for="(slur, sIdx) in measure.slurs" :key="'s'+sIdx">
                <path :d="slur.path" class="slur-line" fill="none" />
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
const measureWidth = 200 // 固定小节宽度
const measuresPerLine = 4 // 每行显示的小节数（可根据屏幕宽度动态调整）

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

/**
 * 计算音符的逻辑时值（以四分音符为1）
 */
const calculateNoteDuration = (note) => {
    // 基础时值：四分音符 = 1
    let baseDuration = 1

    // 减时线：每个 / 让时值减半
    if (note.durationReduceCount > 0) {
        baseDuration = baseDuration / Math.pow(2, note.durationReduceCount)
    }

    // 增时线：每个 - 让时值加倍
    if (note.durationExtendCount > 0) {
        baseDuration = baseDuration * Math.pow(2, note.durationExtendCount)
    }

    // 附点：增加原时值的一半
    if (note.dots > 0) {
        // 一个附点 = 1.5倍，两个附点 = 1.75倍
        const dotMultiplier = note.dots === 1 ? 1.5 : 1.75
        baseDuration = baseDuration * dotMultiplier
    }

    return baseDuration
}

// Layout Calculation
const layoutLines = computed(() => {
    // 1. 扁平化所有小节
    const allMeasures = []
    props.score.lines.forEach(rawLine => {
        allMeasures.push(...rawLine.measures)
    })

    // 2. 重新分行
    const lines = []
    let currentLineMeasures = []
    let currentMeasureCount = 0

    // 计算总的小节数和行数
    // 根据屏幕宽度和 measureWidth 计算每行放多少个
    // 这里暂时使用固定的 measureWidth

    // 我们还需要处理歌词分配：
    // 因为原始数据结构中，lyrics 是按行（rawLine）存储的，
    // 我们需要将歌词也扁平化，然后重新分配给新的 measure 结构

    // 扁平化歌词：只处理第一行歌词作为示例
    // 这里简化处理：我们假设每个音符都有对应的歌词（除了增时线延续）
    // 为了更精确的歌词对齐，我们需要遍历所有 rawLine，收集所有歌词字符

    let allLyricsChars = []
    props.score.lines.forEach(rawLine => {
        if (rawLine.lyrics && rawLine.lyrics.length > 0) {
            const lyricLine = rawLine.lyrics[0]
            if (lyricLine) {
                // 解析歌词字符串
                const text = lyricLine.join(' ')
                let i = 0
                while (i < text.length) {
                    const char = text[i]
                    // 跳过空格
                    if (char === ' ') { i++; continue }

                    // 特殊标记处理
                    if (char === '@') {
                        allLyricsChars.push({ type: 'skip' })
                        i++
                        continue
                    }

                    // 标点处理
                    if (/[，。！？；：、“”…—·,\.!?;:"'\-]/.test(char)) {
                         // 标点不对应音符，但我们需要知道它应该跟在前一个字符后面
                         // 或者我们暂时忽略标点占位，只作为前一个字符的后缀
                         if (allLyricsChars.length > 0) {
                             const last = allLyricsChars[allLyricsChars.length - 1]
                             if (last.type === 'char') {
                                 last.text += char
                             }
                         }
                         i++
                         continue
                    }

                    // ~ 连接符
                    if (text[i+1] === '~' && i+2 < text.length) {
                         const combined = char + text[i+2]
                         allLyricsChars.push({ type: 'char', text: combined })
                         i += 3
                         continue
                    }

                    // 普通字符
                    allLyricsChars.push({ type: 'char', text: char })
                    i++
                }
            }
        }
    })

    let lyricIndex = 0

    for (let i = 0; i < allMeasures.length; i++) {
        currentLineMeasures.push(allMeasures[i])
        currentMeasureCount++

        if (currentMeasureCount >= measuresPerLine || i === allMeasures.length - 1) {
            lines.push({
                measures: currentLineMeasures,
                // 我们稍后在 layout 阶段计算具体的歌词位置
                // 这里只存储 measure 引用
            })
            currentLineMeasures = []
            currentMeasureCount = 0
        }
    }

    // 3. 计算每个小节内的布局
    let currentY = 50 // Start padding

    const computedLines = lines.map(lineObj => {
        let currentX = 20
        const computedLyrics = []

        const computedMeasures = lineObj.measures.map(m => {
            const mStart = currentX
            const mWidth = measureWidth

            // 3.1 计算小节内所有音符的时值
            // 注意：要正确处理连音（tuplet）
            // 暂时简化：不考虑 tuplet 的特殊时值压缩，只按基本比例分配
            // TODO: 实现三连音逻辑（总时值 = 2拍，音符数=3，每个音符 = 2/3拍）

            const noteDurations = m.notes.map(n => {
                // 如果是增时线，它的时值要加到前一个音符上吗？
                // 番茄简谱中，1 - 是两个独立的 token： Note(1) 和 DurationExtend(-)
                // 我们的 parser 已经把 DurationExtend 计数到了 Note 上
                // Note 1 (extend=1) -> 时值 = 2拍
                // 所以我们只需要处理 Note 对象即可
                return calculateNoteDuration(n)
            })

            const totalDuration = noteDurations.reduce((a, b) => a + b, 0)

            // 如果小节是空的或总时值为0（如只有小节线），分配默认宽度？
            // 通常不会发生，除非只有隐形休止符
            const safeTotalDuration = totalDuration || 1 // 避免除以0

            // 3.2 分配音符位置
            let noteX = 0
            const notes = m.notes.map((n, idx) => {
                const duration = noteDurations[idx]
                const percent = duration / safeTotalDuration

                // 音符占用的宽度
                const assignedWidth = mWidth * percent

                // 音符中心位置 (相对于小节开始)
                // 应该居中于分配的区域，还是靠左？
                // 标准乐谱通常靠左，但为了整齐，我们居中
                const relativeX = noteX + (assignedWidth / 2)
                const absoluteX = mStart + relativeX

                // 3.3 分配歌词
                // 只有非 hiddenRest 且不是单纯的增时线符号（如果有的话）才分配歌词
                // 我们在 parser 里把增时线合并到了 note.durationExtendCount
                // 所以每个 note 都是一个发音实体（或休止符）
                if (n.type !== 'hiddenRest' && lyricIndex < allLyricsChars.length) {
                     const lyricItem = allLyricsChars[lyricIndex]
                     if (lyricItem.type === 'char') {
                         computedLyrics.push({
                             text: lyricItem.text,
                             x: absoluteX
                         })
                     }
                     // 无论是 char 还是 skip，都消耗一个音符位
                     lyricIndex++
                }

                // 准备返回的对象
                const noteObj = {
                    ...n,
                    relativeX,
                    absoluteX,
                    width: assignedWidth
                }

                noteX += assignedWidth
                return noteObj
            })

            currentX += mWidth

            // 3.4 重新计算 Beam (减时线)
            // 逻辑与之前类似，但坐标已更新
            const beams = []
            const maxReduce = Math.max(0, ...notes.map(n => n.durationReduceCount || 0))

            for (let level = 1; level <= maxReduce; level++) {
                let startIdx = -1
                for (let i = 0; i < notes.length; i++) {
                    if ((notes[i].durationReduceCount || 0) >= level) {
                        if (startIdx === -1) startIdx = i
                    } else {
                        if (startIdx !== -1) {
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

            // 3.5 重新计算 Slur (连音线)
            const slurs = []
            let slurStack = []

            notes.forEach((note, i) => {
                if (note.slurStarts > 0) {
                    for (let s = 0; s < note.slurStarts; s++) {
                        slurStack.push({ startIdx: i, level: slurStack.length })
                    }
                }
                if (note.slurEnds > 0) {
                    for (let s = 0; s < note.slurEnds; s++) {
                        if (slurStack.length > 0) {
                            const slurInfo = slurStack.pop()
                            const startNote = notes[slurInfo.startIdx]
                            const endNote = note
                            const x1 = startNote.relativeX
                            const x2 = endNote.relativeX
                            const y = 30 - 15 - (slurInfo.level * 8)
                            const distance = x2 - x1
                            const controlHeight = Math.min(distance / 4, 15)
                            const path = `M ${x1} ${y} Q ${(x1 + x2) / 2} ${y - controlHeight} ${x2} ${y}`
                            slurs.push({ path, level: slurInfo.level })
                        }
                    }
                }
            })

            return {
                ...m,
                x: mStart,
                width: mWidth,
                notes,
                beams,
                slurs
            }
        })

        const lineY = currentY
        currentY += rowHeight

        return {
            measures: computedMeasures,
            y: lineY,
            computedLyrics
        }
    })

    return computedLines
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

.slur-line {
  stroke: black;
  stroke-width: 1.5;
  fill: none;
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
    font-size: 16px;
    font-weight: bold;
    text-anchor: start;
    dominant-baseline: central;
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

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
            
            <!-- Left Repeat Bar Line at start of measure (|:) -->
            <g v-if="measure.startBarType === 'left_repeat'">
                <line x1="0" y1="10" x2="0" y2="50" class="bar-line bold" />
                <line x1="4" y1="10" x2="4" y2="50" class="bar-line" />
                <circle cx="9" cy="24" r="2" />
                <circle cx="9" cy="36" r="2" />
            </g>

            <!-- Bar Line (End of measure) -->
            
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

            <!-- Right Repeat (:||) -->
            <!-- Style: : | Thick -->
            <g v-if="measure.barType === 'right_repeat' || measure.barType === 'double_repeat'">
                <circle :cx="measure.width - 8" :cy="24" r="2" />
                <circle :cx="measure.width - 8" :cy="36" r="2" />
                <line :x1="measure.width - 4" y1="10" :x2="measure.width - 4" y2="50" class="bar-line" />
                <line :x1="measure.width" y1="10" :x2="measure.width" y2="50" class="bar-line bold" />
            </g>

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
              <g v-if="note.extendLines && note.extendLines.length > 0">
                  <text v-for="line in note.extendLines" :key="line.key"
                        :x="line.dx" y="0" class="dash">—</text>
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

            <!-- Tuplets (三连音标记) -->
            <g v-for="(tuplet, tIdx) in measure.tuplets" :key="'t'+tIdx">
                <!-- 三连音弧线 -->
                <path :d="`M ${tuplet.x1} 8 Q ${tuplet.x} 0 ${tuplet.x2} 8`"
                      class="tuplet-bracket" fill="none" />
                <!-- 三连音数字 -->
                <text :x="tuplet.x" y="5" class="tuplet-number">{{ tuplet.count }}</text>
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
const svgWidth = ref(860) // 增加宽度以容纳4个小节 + 边距
const rowHeight = 120
const measureWidth = 200 // 固定小节宽度
const measuresPerLine = 4 // 每行显示的小节数（可根据屏幕宽度动态调整）
const lineStartPadding = 30 // 每行起始的左侧padding，防止小节线被遮挡

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
    let duration = 1

    // 减时线：每个 / 让时值减半
    if (note.durationReduceCount > 0) {
        duration = duration / Math.pow(2, note.durationReduceCount)
    }

    // 增时线：每个 - 增加一个基础单位的时值（通常是四分音符）
    // 1 - - - = 1 + 3 = 4
    if (note.durationExtendCount > 0) {
        duration += note.durationExtendCount
    }

    // 附点：增加原时值的一半
    if (note.dots > 0) {
        // 一个附点 = 1.5倍，两个附点 = 1.75倍
        const dotMultiplier = note.dots === 1 ? 1.5 : 1.75
        duration = duration * dotMultiplier
    }

    // 三连音处理：如果是三连音，时值需要特殊计算
    // 三连音通常是3个音符占2拍，每个音符 = 2/3 拍
    // 但我们需要在外层检测三连音组，这里暂时保持原时值
    // 实际压缩会在布局阶段处理

    return duration
}

/**
 * 检测并处理三连音组
 * 返回调整后的时值数组
 */
const adjustTupletDurations = (notes, durations) => {
    const adjusted = [...durations]

    // 查找三连音起始标记
    for (let i = 0; i < notes.length; i++) {
        if (notes[i].tupletStart) {
            // 找到三连音组的结束位置（下一个有 slurEnds 的音符）
            let endIdx = i
            let tupletCount = 1

            for (let j = i + 1; j < notes.length; j++) {
                if (notes[j].slurEnds > 0) {
                    endIdx = j
                    tupletCount = j - i + 1
                    break
                }
            }

            // 计算三连音组的总原始时值
            let totalOriginalDuration = 0
            for (let j = i; j <= endIdx; j++) {
                totalOriginalDuration += durations[j]
            }

            // 三连音的目标总时值 = 原始时值的 2/3
            // 例如：3个八分音符（各0.5拍）= 1.5拍，压缩为 1拍
            const targetTotalDuration = totalOriginalDuration * (2 / 3)

            // 按比例调整每个音符
            for (let j = i; j <= endIdx; j++) {
                adjusted[j] = (durations[j] / totalOriginalDuration) * targetTotalDuration
            }

            // 跳过已处理的三连音组
            i = endIdx
        }
    }

    return adjusted
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
        let currentX = lineStartPadding // 使用左侧padding代替固定值20
        const computedLyrics = []

        const computedMeasures = lineObj.measures.map(m => {
            const mStart = currentX
            const mWidth = measureWidth

            // 3.1 计算小节内所有音符的时值 & 确定每小节拍数
            // 获取每小节拍数 (Numerator), 默认为 4
            let beatsPerBar = 4
            if (header.value.meters && header.value.meters.length > 0) {
                beatsPerBar = header.value.meters[0].numerator
            }

            // 计算布局参数
            const paddingStart = mWidth * 0.1
            // const paddingEnd = mWidth * 0.1 // 隐式保留
            const contentWidth = mWidth * 0.8
            const beatWidth = contentWidth / beatsPerBar

            const noteDurations = m.notes.map(n => calculateNoteDuration(n))

            // 处理三连音：调整时值
            const adjustedDurations = adjustTupletDurations(m.notes, noteDurations)

            // 3.2 分配音符位置
            let currentBeatTime = 0 // 当前小节内的时间指针（单位：拍）

            const notes = m.notes.map((n, idx) => {
                const totalDuration = adjustedDurations[idx]

                // 检测三连音（tuplet）
                // 如果音符有 tupletStart 标记，需要特殊处理时值
                // 三连音的逻辑：找到连续的三连音组，总时值通常是2拍，分给3个音符
                // 简化处理：如果有 tupletStart，将该音符及后续音符的时值压缩
                // 但这需要在外层循环处理，这里先标记

                // 计算基础时值（不含增时线）
                let baseDuration = totalDuration
                if (n.durationExtendCount > 0) {
                    baseDuration = totalDuration - n.durationExtendCount
                }

                // 1. 计算音符本体位置
                // 策略：音符居中于它所占据的时间段
                // X = Padding + (StartBeat + Duration/2) * BeatWidth
                const noteCenterBeat = currentBeatTime + (baseDuration / 2)
                const relativeX = paddingStart + (noteCenterBeat * beatWidth)
                const absoluteX = mStart + relativeX

                // 2. 计算增时线位置
                // 策略：增时线 - 通常占据完整的1拍
                // 它们应该位于后续整数拍的中心
                // 比如 1 - : 1在 0.5, - 在 1.5
                const extendLines = []
                for (let i = 0; i < n.durationExtendCount; i++) {
                    // 增时线起始时间 = 当前音符开始 + 基础时值 + i
                    // 比如 1(1拍) - - :
                    // Dash 0: time = 0 + 1 + 0 = 1. Center = 1.5
                    // Dash 1: time = 0 + 1 + 1 = 2. Center = 2.5
                    const dashStartBeat = currentBeatTime + baseDuration + i
                    const dashCenterBeat = dashStartBeat + 0.5

                    const dashRelativeX = paddingStart + (dashCenterBeat * beatWidth)

                    // 计算相对于音符本体的 dx
                    const dx = dashRelativeX - relativeX

                    extendLines.push({
                        dx,
                        key: 'ext-' + i
                    })
                }

                // 3. 分配歌词
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

                // 更新时间指针
                currentBeatTime += totalDuration

                // 准备返回的对象
                const noteObj = {
                    ...n,
                    relativeX,
                    absoluteX,
                    width: mWidth, // 占位，实际不用
                    extendLines
                }

                return noteObj
            })

            currentX += mWidth

            // 3.4 重新计算 Beam (减时线) - 按拍切分
            // 八分音符及更短的音符应以拍为单位进行切分
            const beams = []
            const maxReduce = Math.max(0, ...notes.map(n => n.durationReduceCount || 0))

            for (let level = 1; level <= maxReduce; level++) {
                let startIdx = -1
                let currentBeat = 0

                for (let i = 0; i < notes.length; i++) {
                    const note = notes[i]
                    const noteDuration = adjustedDurations[i]
                    const noteStartBeat = currentBeat
                    const noteEndBeat = currentBeat + noteDuration

                    // 判断是否跨拍（音符起始和结束不在同一个整拍内）
                    const startBeatFloor = Math.floor(noteStartBeat)
                    const endBeatFloor = Math.floor(noteEndBeat - 0.001) // 减小误差

                    const crossesBeat = startBeatFloor !== endBeatFloor && noteDuration < 1

                    if ((note.durationReduceCount || 0) >= level) {
                        if (startIdx === -1) {
                            startIdx = i
                        }
                        // 检查是否需要在此处断开（跨拍或有beamBreakNext标记）
                        if (note.beamBreakNext || (i < notes.length - 1 && crossesBeat)) {
                            // 结束当前beam组
                            if (startIdx !== -1 && startIdx <= i) {
                                beams.push({
                                    x1: notes[startIdx].relativeX - 8,
                                    x2: notes[i].relativeX + 8,
                                    level
                                })
                            }
                            startIdx = -1
                        }
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

                    currentBeat = noteEndBeat
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

            // 3.6 检测并记录三连音组（用于渲染数字标记）
            const tuplets = []

            notes.forEach((note, i) => {
                // 处理三连音起始
                if (note.tupletStart) {
                    // 找到三连音结束位置
                    let endIdx = i
                    for (let j = i + 1; j < notes.length; j++) {
                        if (notes[j].slurEnds > 0) {
                            endIdx = j
                            break
                        }
                    }
                    const tupletCount = endIdx - i + 1
                    const startNote = notes[i]
                    const endNote = notes[endIdx]
                    const centerX = (startNote.relativeX + endNote.relativeX) / 2
                    tuplets.push({
                        x: centerX,
                        count: tupletCount,
                        x1: startNote.relativeX,
                        x2: endNote.relativeX
                    })
                }

                // 处理普通连音线（非三连音）
                if (note.slurStarts > 0 && !note.tupletStart) {
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
                slurs,
                tuplets
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

.tuplet-bracket {
  stroke: black;
  stroke-width: 1;
  fill: none;
}

.tuplet-number {
  font-size: 12px;
  font-weight: bold;
  text-anchor: middle;
  dominant-baseline: middle;
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

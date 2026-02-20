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



            <!-- Notes -->
            <g v-for="(note, nIdx) in measure.notes" :key="nIdx" :transform="`translate(${note.relativeX}, 30)`">
              
              <!-- Grace Notes (前倚音) -->
              <g v-if="note.graceNotes && note.graceNotes.length > 0" class="grace-notes-group">
                <!-- 每个倚音数字 (位于主音符上方) -->
                <g v-for="(gn, gIdx) in note.graceNotes" :key="'gn'+gIdx"
                   :transform="`translate(${-((note.graceNotes.length - gIdx) * 9) - 2}, 0)`">
                  <!-- 高八度点 -->
                  <template v-if="gn.octave > 0">
                    <circle v-for="d in gn.octave" :key="'gh'+d"
                      cx="0" :cy="-27 - (d-1)*4" r="1" class="grace-dot" />
                  </template>
                  <!-- 倚音数字 -->
                  <text class="grace-note-text" x="0" y="-17">{{ gn.degree }}</text>
                  <!-- 低八度点 -->
                  <template v-if="gn.octave < 0">
                    <circle v-for="d in Math.abs(gn.octave)" :key="'gl'+d"
                      cx="0" :cy="-10 + getGraceMaxUnderlines(note.graceNotes) * 3 + 2 + (d-1)*4" r="1" class="grace-dot" />
                  </template>
                  <!-- 升降号 -->
                  <text v-if="gn.accidental === 'sharp'" class="grace-accidental" x="-6" y="-19">#</text>
                  <text v-if="gn.accidental === 'flat'" class="grace-accidental" x="-6" y="-19">b</text>
                  <text v-if="gn.accidental === 'natural'" class="grace-accidental" x="-6" y="-19">=</text>
                </g>
                <!-- 倚音组共享下划线 (与主音符顶部对齐 y=-10) -->
                <template v-if="getGraceMaxUnderlines(note.graceNotes) > 0">
                  <line v-for="u in getGraceMaxUnderlines(note.graceNotes)" :key="'gu'+u"
                    class="grace-underline"
                    :x1="-note.graceNotes.length * 9 - 6"
                    :y1="-10 + (u-1)*3"
                    :x2="-4"
                    :y2="-10 + (u-1)*3" />
                </template>
                <!-- 连接弧线：四分之一圆弧，从减时线中间出发，圆心在减时线上，弧向下弯到主音符 -->
                <path class="grace-slur-arc" 
                  :d="getGraceArcPath(note.graceNotes, false)" />
              </g>

              <!-- After Grace Notes (后倚音) -->
              <g v-if="note.afterGraceNotes && note.afterGraceNotes.length > 0" class="grace-notes-group">
                <!-- 每个后倚音数字 (位于主音符右上方) -->
                <g v-for="(gn, gIdx) in note.afterGraceNotes" :key="'agn'+gIdx"
                   :transform="`translate(${8 + gIdx * 9}, 0)`">
                  <template v-if="gn.octave > 0">
                    <circle v-for="d in gn.octave" :key="'agh'+d"
                      cx="0" :cy="-27 - (d-1)*4" r="1" class="grace-dot" />
                  </template>
                  <text class="grace-note-text" x="0" y="-17">{{ gn.degree }}</text>
                  <template v-if="gn.octave < 0">
                    <circle v-for="d in Math.abs(gn.octave)" :key="'agl'+d"
                      cx="0" :cy="-10 + getGraceMaxUnderlines(note.afterGraceNotes) * 3 + 2 + (d-1)*4" r="1" class="grace-dot" />
                  </template>
                </g>
                <!-- 后倚音共享下划线 -->
                <template v-if="getGraceMaxUnderlines(note.afterGraceNotes) > 0">
                  <line v-for="u in getGraceMaxUnderlines(note.afterGraceNotes)" :key="'agu'+u"
                    class="grace-underline"
                    :x1="4"
                    :y1="-10 + (u-1)*3"
                    :x2="4 + note.afterGraceNotes.length * 9 + 4"
                    :y2="-10 + (u-1)*3" />
                </template>
                <!-- 连接弧线 -->
                <path class="grace-slur-arc"
                  :d="getGraceArcPath(note.afterGraceNotes, true)" />
              </g>

              <!-- Pitch (clickable) -->
              <text class="note-text" :class="{ 'rest': note.type === 'rest', 'clickable': note.sourceLine != null }"
                    @click="onNoteClick(note)">
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

              <!-- Accompaniment Brackets -->
              <text v-if="note.leftBracket" class="bracket" :x="getLeftBracketX(note)" y="0">(</text>
              <text v-if="note.rightBracket" class="bracket" :x="getRightBracketX(note)" y="0">)</text>
            </g>

            <!-- Beams (Underlines) -->
            <g v-for="(beam, bIdx) in measure.beams" :key="'b'+bIdx">
                <line :x1="beam.x1" :y1="30 + 12 + (beam.level-1)*5"
                      :x2="beam.x2" :y2="30 + 12 + (beam.level-1)*5"
                      class="underline" />
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
          
          <!-- Slurs (连音线 - 行级别，支持跨小节) -->
          <g v-for="(slur, sIdx) in line.slurs" :key="'s'+sIdx">
              <path :d="slur.path" class="slur-line" fill="none" />
          </g>

          <!-- Volta Brackets (跳房子) -->
          <g v-for="(volta, vIdx) in line.voltaBrackets" :key="'v'+vIdx">
            <g :transform="`translate(0, ${-5 - (volta.heightOffset * 8)})`">
              <!-- 左侧竖线 -->
              <line :x1="volta.startX" y1="5" :x2="volta.startX" y2="18" class="volta-line" />
              <!-- 顶部横线 -->
              <line :x1="volta.startX" y1="5" :x2="volta.endX" y2="5" class="volta-line" />
              <!-- 右侧竖线（仅封闭时绘制） -->
              <line v-if="volta.closed" :x1="volta.endX" y1="5" :x2="volta.endX" y2="18" class="volta-line" />
              <!-- 标签文本 -->
              <text v-if="volta.label" :x="volta.startX + 5" y="16" class="volta-label">{{ volta.label }}</text>
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
import { computed, ref, watchEffect, defineProps, defineEmits } from 'vue'

const props = defineProps({
  score: {
     type: Object, // FanqieScore
     required: true
  }
})

const emit = defineEmits(['note-click'])

const onNoteClick = (note) => {
  if (note.sourceLine != null && note.sourceColumn != null) {
    emit('note-click', { line: note.sourceLine, column: note.sourceColumn })
  }
}

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

const getLeftBracketX = (note) => {
    // 如果有前倚音，括号应在倚音左侧
    if (note.graceNotes && note.graceNotes.length > 0) {
        return -(note.graceNotes.length * 9 + 8)
    }
    // 如果有变音记号，括号应在记号左侧
    if (note.accidental) {
        return -22
    }
    return -12
}

const getRightBracketX = (note) => {
    // 如果有附点，括号应在附点右侧
    if (note.dots > 0) {
        return 20
    }
    // 如果有后倚音
    if (note.afterGraceNotes && note.afterGraceNotes.length > 0) {
        return 4 + note.afterGraceNotes.length * 9 + 8
    }
    // 如果有增时线，延音线是独立的文本元素，宽度较宽
    if (note.extendLines && note.extendLines.length > 0) {
        // 取最后一个延音线的位置
        const lastDash = note.extendLines[note.extendLines.length - 1]
        return lastDash.dx + 12
    }
    return 12
}

/**
 * 获取倚音组应该显示的下划线数量（取最大值）
 * 倚音默认是8分音符(1条线)，加一个 / 变成16分(2条线)
 */
const getGraceMaxUnderlines = (graceNotes) => {
    if (!graceNotes || graceNotes.length === 0) return 0
    // durationReduceCount=0 默认8分音符 → 1条线
    // durationReduceCount=1 → 16分音符 → 2条线
    return Math.max(...graceNotes.map(gn => (gn.durationReduceCount || 0) + 1))
}

/**
 * 倚音连接弧线路径（四分之一圆弧）
 * 
 * 几何关系：
 * - 减时线（下划线）与主音符顶部对齐，位于 y = -10
 * - 圆弧圆心位于减时线上（靠近主音符的那一端）
 * - 弧线从减时线中间出发，向下弯曲到主音符方向
 * - 呈现"端着托盘的手"的效果：减时线是托盘，弧线是手臂
 *
 * @param {Array} graceNotes - 倚音数组
 * @param {boolean} isAfter - 是否为后倚音
 */
const getGraceArcPath = (graceNotes, isAfter) => {
    const underlineCount = getGraceMaxUnderlines(graceNotes)
    const count = graceNotes.length
    // 最底部一条下划线的 y 坐标
    const underlineY = -10 + (underlineCount - 1) * 3
    // 固定半径：主音符 font-size=20px 的 1/4，保证弧线大小一致不与主音符冲突
    const r = 5

    if (isAfter) {
        // 后倚音：弧从减时线中点向左下方弯曲（朝向主音符）
        const leftX = 4
        const rightX = 4 + count * 9 + 4
        const midX = (leftX + rightX) / 2
        // 圆心在起点正下方，弧向左弯 90°
        // 起点: (midX, underlineY)  终点: (midX - r, underlineY + r)
        return `M ${midX} ${underlineY} A ${r} ${r} 0 0 1 ${midX - r} ${underlineY + r}`
    } else {
        // 前倚音：弧从减时线中点向右下方弯曲（朝向主音符）
        const leftX = -count * 9 - 6
        const rightX = -4
        const midX = (leftX + rightX) / 2
        // 圆心在起点正下方，弧向右弯 90°
        // 起点: (midX, underlineY)  终点: (midX + r, underlineY + r)
        return `M ${midX} ${underlineY} A ${r} ${r} 0 0 0 ${midX + r} ${underlineY + r}`
    }
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
    let crossLineSlurCarry = [] // 跨行连音线状态

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
            // 八分音符及更短的音符应以拍为单位进行分组连线
            const beams = []
            const maxReduce = Math.max(0, ...notes.map(n => n.durationReduceCount || 0))

            // 先计算每个音符的拍位起始和所属拍组
            const noteBeats = []
            {
                let beat = 0
                for (let i = 0; i < notes.length; i++) {
                    const dur = adjustedDurations[i]
                    noteBeats.push({
                        startBeat: beat,
                        endBeat: beat + dur,
                        // 所属拍组 = 向下取整（以四分音符为一拍）
                        beatGroup: Math.floor(beat + 0.001)
                    })
                    beat += dur
                }
            }

            for (let level = 1; level <= maxReduce; level++) {
                let startIdx = -1

                for (let i = 0; i < notes.length; i++) {
                    const note = notes[i]

                    if ((note.durationReduceCount || 0) >= level) {
                        if (startIdx === -1) {
                            startIdx = i
                        }

                        // 检查是否需要在此音符之后断开：
                        // 1. 是最后一个音符
                        // 2. 下一个音符不在同一个拍组内
                        // 3. 下一个音符的减时层级不够
                        // 4. 当前音符有 beamBreakNext 标记
                        const isLast = (i === notes.length - 1)
                        const nextNoteTooShort = !isLast && (notes[i + 1].durationReduceCount || 0) < level
                        const nextInDiffBeatGroup = !isLast && noteBeats[i + 1].beatGroup !== noteBeats[i].beatGroup
                        const hasBreakMark = note.beamBreakNext

                        if (isLast || nextNoteTooShort || nextInDiffBeatGroup || hasBreakMark) {
                            // 结束当前 beam 组
                            if (startIdx <= i) {
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
                                x2: notes[i - 1].relativeX + 8,
                                level
                            })
                            startIdx = -1
                        }
                    }
                }
            }

            // 3.5 检测并记录三连音组（用于渲染数字标记）
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
            })

            return {
                ...m,
                x: mStart,
                width: mWidth,
                notes,
                beams,
                tuplets
            }
        })

        // 4. 计算跳房子（volta brackets）跨小节的范围
        const voltaBrackets = []
        let voltaStart = null

        computedMeasures.forEach((m, mIdx) => {
            if (m.endingStart) {
                voltaStart = {
                    startX: m.x,
                    label: m.endingStart.label || '',
                    heightOffset: m.endingStart.heightOffset || 0,
                    openEnd: m.endingStart.openEnd || false
                }
            }
            if (m.endingEnd && voltaStart) {
                voltaBrackets.push({
                    ...voltaStart,
                    endX: m.x + m.width,
                    closed: true
                })
                voltaStart = null
            }
        })
        // 如果跳房子起始后没有找到结束，延伸到行尾
        if (voltaStart) {
            const lastMeasure = computedMeasures[computedMeasures.length - 1]
            voltaBrackets.push({
                ...voltaStart,
                endX: lastMeasure.x + lastMeasure.width,
                closed: !voltaStart.openEnd
            })
            voltaStart = null
        }

        // 5. 计算连音线/延音线（行级别，支持跨小节和跨行）
        // 跨小节：括号形（¼弧 + 直线 + ¼弧），位于上方
        // 小节内：弧线形，位于下方（更靠近音符）
        const lineSlurs = []
        const lineSlurStack = []

        // 将整行所有音符展平，标记所属小节索引
        const allLineNotes = []
        computedMeasures.forEach((m, mIdx) => {
            m.notes.forEach(note => {
                allLineNotes.push({ ...note, _mIdx: mIdx })
            })
        })

        // 行尾 X 坐标（用于跨行延伸）
        const lineEndX = computedMeasures.length > 0
            ? computedMeasures[computedMeasures.length - 1].x + computedMeasures[computedMeasures.length - 1].width
            : lineStartPadding

        // 将上一行未匹配的 slurStart 放入 stack（标记为跨行）
        crossLineSlurCarry.forEach(() => {
            lineSlurStack.push({ startIdx: -1, crossLine: true })
        })

        allLineNotes.forEach((note, i) => {
            // 连音线起始（非三连音）
            if (note.slurStarts > 0 && !note.tupletStart) {
                for (let s = 0; s < note.slurStarts; s++) {
                    lineSlurStack.push({ startIdx: i, crossLine: false })
                }
            }
            // 连音线结束
            if (note.slurEnds > 0) {
                for (let s = 0; s < note.slurEnds; s++) {
                    if (lineSlurStack.length > 0) {
                        const slurInfo = lineSlurStack.pop()
                        const x2 = note.absoluteX

                        // 判断是否跨小节
                        const isCrossMeasure = slurInfo.crossLine ||
                            (slurInfo.startIdx >= 0 && allLineNotes[slurInfo.startIdx]._mIdx !== note._mIdx)

                        // 计算覆盖范围内最大高音八度
                        let maxOctave = 0
                        const rangeStart = Math.max(0, slurInfo.startIdx)
                        for (let k = rangeStart; k <= i; k++) {
                            if (allLineNotes[k].octave > maxOctave) maxOctave = allLineNotes[k].octave
                        }
                        const octaveOffset = maxOctave > 0 ? (maxOctave * 5 + 3) : 0

                        if (isCrossMeasure) {
                            // ─── 跨小节/跨行：括号形连音线 ───
                            const x1 = slurInfo.crossLine
                                ? lineStartPadding
                                : allLineNotes[slurInfo.startIdx].absoluteX
                            const yBase = 30 - 20 - octaveOffset
                            const yTop = yBase - 5
                            const r = 4

                            let path
                            if (slurInfo.crossLine) {
                                // 从行首开始（无左侧弧线）
                                path = `M ${x1} ${yTop} L ${x2 - r} ${yTop} Q ${x2} ${yTop} ${x2} ${yBase}`
                            } else {
                                // 完整括号形：左¼弧 → 直线 → 右¼弧
                                path = `M ${x1} ${yBase} Q ${x1} ${yTop} ${x1 + r} ${yTop} L ${x2 - r} ${yTop} Q ${x2} ${yTop} ${x2} ${yBase}`
                            }
                            lineSlurs.push({ path })
                        } else {
                            // ─── 小节内：弧线形连音线 ───
                            const x1 = allLineNotes[slurInfo.startIdx].absoluteX
                            const y = 30 - 13 - octaveOffset
                            const distance = x2 - x1
                            const controlHeight = Math.min(distance / 5, 6)
                            const path = `M ${x1} ${y} Q ${(x1 + x2) / 2} ${y - controlHeight} ${x2} ${y}`
                            lineSlurs.push({ path })
                        }
                    }
                }
            }
        })

        // 行末未匹配的 slurStart → 画到行尾（无右侧弧线），carry 到下一行
        const newCarry = []
        while (lineSlurStack.length > 0) {
            const slurInfo = lineSlurStack.pop()
            const startX = slurInfo.startIdx >= 0
                ? allLineNotes[slurInfo.startIdx].absoluteX
                : lineStartPadding

            // 计算覆盖范围内最大高音八度
            let maxOctave = 0
            const rangeStart = Math.max(0, slurInfo.startIdx)
            for (let k = rangeStart; k < allLineNotes.length; k++) {
                if (allLineNotes[k].octave > maxOctave) maxOctave = allLineNotes[k].octave
            }
            const octaveOffset = maxOctave > 0 ? (maxOctave * 5 + 3) : 0

            const yBase = 30 - 20 - octaveOffset
            const yTop = yBase - 5
            const r = 4

            // 到行尾（只有左侧弧线，无右侧弧线）
            const path = `M ${startX} ${yBase} Q ${startX} ${yTop} ${startX + r} ${yTop} L ${lineEndX} ${yTop}`
            lineSlurs.push({ path })
            newCarry.push({})
        }
        crossLineSlurCarry = newCarry

        const lineY = currentY
        currentY += rowHeight

        return {
            measures: computedMeasures,
            y: lineY,
            computedLyrics,
            voltaBrackets,
            slurs: lineSlurs
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

.note-text.clickable {
  cursor: pointer;
}

.note-text.clickable:hover {
  fill: #1a73e8;
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

.volta-line {
    stroke: black;
    stroke-width: 1.2;
    fill: none;
}

.volta-label {
    font-size: 12px;
    font-weight: bold;
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

/* Grace Notes 倚音样式 */
.grace-note-text {
    font-size: 12px;
    font-weight: bold;
    text-anchor: middle;
    dominant-baseline: central;
}

.grace-dot {
    fill: black;
}

.grace-slur-arc {
    stroke: black;
    stroke-width: 1;
    fill: none;
}

.grace-underline {
    stroke: black;
    stroke-width: 1;
}

.grace-accidental {
    font-size: 8px;
    font-style: italic;
}
.bracket {
    font-size: 20px;
    font-weight: bold;
    text-anchor: middle;
    dominant-baseline: central;
}
</style>

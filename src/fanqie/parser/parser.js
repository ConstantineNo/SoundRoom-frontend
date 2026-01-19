/**
 * FanqieJianpu Parser
 * 番茄简谱语法解析器 - 将Token流转换为AST
 */

import { tokenize } from './tokenizer.js'

/**
 * @typedef {import('../types/index').FanqieToken} FanqieToken
 * @typedef {import('../types/index').FanqieTokenType} FanqieTokenType
 * @typedef {import('../types/index').FanqieScore} FanqieScore
 * @typedef {import('../types/index').FanqieHeader} FanqieHeader
 * @typedef {import('../types/index').FanqieLine} FanqieLine
 * @typedef {import('../types/index').FanqieMeasure} FanqieMeasure
 * @typedef {import('../types/index').FanqieNote} FanqieNote
 * @typedef {import('../types/index').FanqieBarType} FanqieBarType
 * @typedef {import('../types/index').FanqieParseResult} FanqieParseResult
 * @typedef {import('../types/index').FanqieAuthentication} FanqieAuthentication
 */

export class FanqieParser {
    /**
     * @param {FanqieToken[]} tokens
     */
    constructor(tokens) {
        this.tokens = tokens
        this.pos = 0
        this.errors = []
        this.warnings = []

        /** @type {FanqieScore} */
        this.score = {
            header: {
                version: '',
                titles: [],
                authors: [],
                key: { root: 'C' },
                meters: []
            },
            lines: []
        }
    }

    /**
     * 查看当前Token
     * @returns {FanqieToken}
     */
    peek(offset = 0) {
        return this.tokens[this.pos + offset] || { type: 'EOF', value: '' }
    }

    /**
     * 前进并返回当前Token
     * @returns {FanqieToken}
     */
    advance() {
        const token = this.tokens[this.pos] || { type: 'EOF', value: '' }
        this.pos++
        return token
    }

    /**
     * 检查是否匹配当前Token类型
     * @param {FanqieTokenType} type 
     * @returns {boolean}
     */
    match(type) {
        if (this.peek().type === type) {
            this.advance()
            return true
        }
        return false
    }

    /**
     * 期望当前Token类型，否则报错
     * @param {FanqieTokenType} type 
     * @param {string} errorMsg 
     * @returns {FanqieToken}
     */
    expect(type, errorMsg) {
        if (this.peek().type === type) {
            return this.advance()
        }
        this.error(errorMsg)
        return { type: 'EOF', value: '', line: 0, column: 0 }
    }

    /**
     * 记录错误
     * @param {string} message 
     */
    error(message) {
        const token = this.peek()
        this.errors.push({
            message,
            line: token.line,
            column: token.column,
            context: token.value
        })
    }

    /**
     * 检查是否到达末尾
     * @returns {boolean}
     */
    isAtEnd() {
        return this.peek().type === 'EOF'
    }

    /**
     * 解析整个乐谱
     * @returns {FanqieParseResult}
     */
    parse() {
        while (!this.isAtEnd()) {
            try {
                const token = this.peek()

                // 跳过换行和空白
                if (token.type === 'NEWLINE' || token.type === 'WHITESPACE' || token.type === 'COMMENT') {
                    this.advance()
                    continue
                }

                // 解析描述头
                if (this.isHeaderToken(token.type)) {
                    this.parseHeaderField()
                    continue
                }

                // 解析曲谱行
                if (token.type === 'MELODY_LINE') {
                    this.parseMelodyLine()
                    continue
                }

                // 解析歌词行
                if (token.type === 'LYRIC_LINE') {
                    this.parseLyricLine()
                    continue
                }

                // 未知内容，跳过
                this.advance()

            } catch (e) {
                console.error('Parse error:', e)
                this.error('Internal parser error: ' + e.message)
                this.advance()
            }
        }

        return {
            score: this.score,
            errors: this.errors,
            warnings: this.warnings
        }
    }

    isHeaderToken(type) {
        return ['VERSION', 'TITLE', 'AUTHOR', 'KEY', 'METER', 'TEMPO'].includes(type)
    }

    parseHeaderField() {
        const token = this.advance()
        const value = token.value.trim()

        switch (token.type) {
            case 'VERSION':
                this.score.header.version = value
                break
            case 'TITLE':
                this.score.header.titles.push(value)
                break
            case 'AUTHOR':
                this.score.header.authors.push(value)
                break
            case 'KEY':
                this.score.header.key = this.parseKey(value)
                break
            case 'METER':
                this.score.header.meters.push(...this.parseMeters(value))
                break
            case 'TEMPO':
                this.score.header.tempo = this.parseTempo(value)
                break
        }
    }

    /**
     * 解析调号字符串
     * @param {string} str 
     * @returns {import('../types/index').FanqieKey}
     */
    parseKey(str) {
        // 简单解析：D: C, D: G#, D: Bb
        const match = str.match(/^([A-G])([#$b])?/)
        if (!match) return { root: 'C' }

        let accidental = undefined
        if (match[2] === '#' || match[2] === '$') {
            // parser token values are # $ but user might write # b
            // The token value for key is the whole string "E" or "D#"
            // Wait, tokenizer returns the whole line content for header fields.
            // So User input "D: E#" -> value is "E#"
        }

        // Spec says # or $ for sharp/flat in header? 
        // Spec says: "D: E" or "D: E#"
        // Normal music notation uses 'b' for flat.
        // Let's support #, b, $.
        let root = match[1]
        let accChar = match[2]

        if (accChar === '#') accidental = 'sharp'
        else if (accChar === 'b' || accChar === '$') accidental = 'flat'

        return { root, accidental }
    }

    parseMeters(str) {
        // P: 4/4 2/4 (1/4)
        // Extract numbers like 4/4
        const meters = []
        const parts = str.split(/\s+/)

        for (const part of parts) {
            const match = part.match(/(\()?(\d+)\/(\d+)(\))?/)
            if (match) {
                meters.push({
                    numerator: parseInt(match[2]),
                    denominator: parseInt(match[3]),
                    auxiliary: !!match[1] // has open parenthesis
                })
            }
        }
        return meters
    }

    parseTempo(str) {
        // J: 120 or J: Allegro
        const bpmMatch = str.match(/^\d+$/)
        if (bpmMatch) {
            return { bpm: parseInt(str) }
        }
        return { text: str }
    }

    /**
     * 解析曲谱行
     */
    parseMelodyLine() {
        this.advance() // Consume 'Q:'

        const measures = []
        let currentMeasure = {
            notes: [],
            barType: 'bar' // default start
        }

        // Add implicit first measure if needed or just start parsing notes
        // Loop until NEWLINE or EOF

        while (!this.isAtEnd() && this.peek().type !== 'NEWLINE' && this.peek().type !== 'MELODY_LINE' && this.peek().type !== 'LYRIC_LINE') {
            const token = this.peek()

            // 小节线 - 结束当前小节
            if (this.isBarLine(token.type)) {
                // Update bar type of current measure (the bar line CLOSES the measure)
                // Actually, usually bar line is at the end of measure.
                // But what if it's start?
                // Let's assume standard: Notes... | Notes... |
                // When we hit |, we define the barType of the COMPLETED measure.

                // Wait, if we have |: Notes :|
                // The |: is start of measure? Or end of previous?
                // Ideally, a measure has a "left bar" and "right bar"?
                // Or we just store the bar type that ENDS the measure?
                // The spec type `FanqieBarType` implies specific bar lines.
                // Let's attach the bar line type to the measure that just finished.

                currentMeasure.barType = this.mapBarType(token.type)
                this.advance()

                // Check for ending brackets at the bar line (e.g. [ or ])
                // Actually ENDING_START is usually at bar line.
                // If we see ENDING_START immediately after or before?

                measures.push(currentMeasure)
                currentMeasure = { notes: [], barType: 'bar' }
            }
            else if (token.type === 'ENDING_START') {
                // Skip for now, logic needs to attach to measure
                this.advance()
                // If start of ending, usually it applies to the measure ABOUT TO START
                currentMeasure.endingStart = { type: 'start' }
                // Check for Ending Label? (Requires tokenizer support or peek)
                // Tokenizer treats [ as ENDING_START. 
                // We might need to look for label (e.g. "1.")

                // Simple hack: if next is number or text?
                // For now, minimal support.
            }
            else if (token.type === 'ENDING_END') {
                this.advance()
                currentMeasure.endingEnd = true;
            }
            else if (token.type === 'WHITESPACE') {
                this.advance()
            }
            else {
                // Parse note
                const note = this.parseNote()
                if (note) {
                    currentMeasure.notes.push(note)
                } else {
                    // Unknown, skip
                    this.advance()
                }
            }
        }

        // Push last measure if not empty
        if (currentMeasure.notes.length > 0) {
            measures.push(currentMeasure)
        }

        this.score.lines.push({
            measures,
            lyrics: []
        })
    }

    isBarLine(type) {
        return type.startsWith('BAR')
    }

    mapBarType(tokenType) {
        const map = {
            'BAR': 'bar',
            'BAR_HIDDEN_NO_SPACE': 'hidden_no_space',
            'BAR_HIDDEN_WITH_SPACE': 'hidden_with_space',
            'BAR_DOUBLE': 'double',
            'BAR_LEFT_REPEAT': 'left_repeat',
            'BAR_RIGHT_REPEAT': 'right_repeat',
            'BAR_DOUBLE_REPEAT': 'double_repeat',
            'BAR_FINAL': 'final'
        }
        return map[tokenType] || 'bar'
    }

    parseNote() {
        const token = this.peek()

        // Identify valid note starts
        if (!['NOTE', 'REST', 'HIDDEN_REST', 'RHYTHM_NOTE'].includes(token.type)) {
            return null
        }

        const note = {
            type: this.mapNoteType(token.type),
            degree: token.type === 'NOTE' ? parseInt(token.value) : undefined,
            octave: 0,
            durationReduceCount: 0,
            durationExtendCount: 0,
            dots: 0,
            slurStarts: 0,
            slurEnds: 0,
            ornaments: [],
            graceNotes: []
        }

        this.advance() // Consume the base note

        // Parse modifiers (postfix)
        while (!this.isAtEnd()) {
            const next = this.peek()

            if (next.type === 'OCTAVE_UP') {
                note.octave++
                this.advance()
            }
            else if (next.type === 'OCTAVE_DOWN') {
                note.octave--
                this.advance()
            }
            else if (next.type === 'DURATION_REDUCE') {
                note.durationReduceCount++
                this.advance()
            }
            else if (next.type === 'DURATION_EXTEND') {
                note.durationExtendCount++
                this.advance()
            }
            else if (next.type === 'DOT') {
                note.dots++
                this.advance()
            }
            else if (next.type === 'SHARP') {
                note.accidental = 'sharp'
                this.advance()
            }
            else if (next.type === 'FLAT') {
                note.accidental = 'flat'
                this.advance()
            }
            else if (next.type === 'NATURAL') {
                note.accidental = 'natural'
                this.advance()
            }
            else if (next.type === 'BEAM_JOIN') {
                note.beamJoinNext = true
                this.advance()
            }
            else if (next.type === 'BEAM_BREAK') {
                note.beamBreakNext = true
                this.advance()
            }
            else if (next.type === 'SLUR_START') {
                note.slurStarts++
                this.advance()
            }
            else if (next.type === 'SLUR_END') {
                note.slurEnds++
                this.advance()
            }
            else if (next.type === 'TUPLET_START') {
                note.tupletStart = true
                note.slurStarts++ // Reuse slur for tuplet bracket usually? 
                // Spec says "different is (y", let's keep separate flag
                this.advance()
            }
            else if (next.type === 'GRACE_START') {
                // Tokenizer stores content in value
                // We need to parse the grace note content string to FanqieGraceNote
                // Simplified: just store as raw for now or minimal parse
                // Ideally invoke a mini-parser for grace notes
                this.parseGraceNotes(next.value, note, false)
                this.advance()
            }
            else if (next.type === 'AFTER_GRACE_START') {
                this.parseGraceNotes(next.value, note, true)
                this.advance()
            }
            else if (next.type === 'DYNAMICS') {
                note.dynamics = next.value // &mp
                this.advance()
            }
            else if (next.type === 'ORNAMENT') {
                // &bo
                note.ornaments.push({ code: next.value.replace('&', '') })
                this.advance()
            }
            else if (next.type === 'LEFT_BRACKET') {
                note.leftBracket = true
                this.advance()
            }
            else if (next.type === 'RIGHT_BRACKET') {
                note.rightBracket = true
                this.advance()
            }
            else if (next.type === 'ANNOTATION') {
                note.annotation = next.value
                this.advance()
            }
            else {
                break // Not a note modifier
            }
        }

        return note
    }

    mapNoteType(tokenType) {
        if (tokenType === 'NOTE') return 'note'
        if (tokenType === 'REST') return 'rest'
        if (tokenType === 'HIDDEN_REST') return 'hiddenRest'
        if (tokenType === 'RHYTHM_NOTE') return 'rhythm'
        return 'note'
    }

    parseGraceNotes(content, note, isAfter) {
        // content is string like "1'/" inside the []
        // Need to parse this string into FanqieGraceNote objects
        // For simplicity in this iteration: skip detailed sub-parsing
        // or implement a simple loop.

        // Let's create dummy grace notes for now
        // The renderer will likely need more details.
        // TODO: Implement mini-tokenizer for grace notes if needed

        // Attempt simple parsing:
        // "5.1." -> 5., 1.
        // It's tricky without a full tokenizer.
    }

    /**
     * 解析歌词行
     */
    parseLyricLine() {
        // Lyric line content is in the value.
        // Need to split by spaces and handle hyphens?
        // Spec says: "Alignment similar to ABC"
        // Tokenizer returns the whole line as LYRIC_LINE value.

        // We need to attach this to the *previous* melody line.
        if (this.score.lines.length === 0) {
            this.warnings.push({
                message: '歌词行 (C:) 必须位于曲谱行 (Q:) 之后，该行歌词将被忽略。',
                line: this.peek().line,
                column: this.peek().column,
                context: this.peek().value
            })
            this.advance()
            return
        }

        const lastLine = this.score.lines[this.score.lines.length - 1]
        const token = this.advance()
        const rawText = token.value.trim()

        // Simple split for now. 
        // Ideally, we need to match syllables to notes.
        // For storage, we just store the array of syllables per line?
        // FanqieLine.lyrics is string[][] (multiple lyric lines).

        // Let's just push separate characters or words?
        // "wo ai ni" -> ["wo", "ai", "ni"]
        // "wo-ai-ni" -> ["wo-", "ai-", "ni"] ??
        // Standard ABC lyrics rule: space moves to next note. - moves to next note but renders hyphen.
        // We can just store split by space for now.

        const syllables = rawText.split(/\s+/)
        lastLine.lyrics.push(syllables)
    }
}

/**
 * 解析函数入口
 * @param {string} source 
 * @returns {FanqieParseResult}
 */
export function parseFanqie(source) {
    const tokens = tokenize(source)
    const parser = new FanqieParser(tokens)
    return parser.parse()
}

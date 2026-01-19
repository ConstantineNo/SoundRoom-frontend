/**
 * FanqieJianpu Tokenizer
 * 番茄简谱词法分析器 - 将文本转换为Token流
 */

/**
 * @typedef {import('../types/index').FanqieToken} FanqieToken
 * @typedef {import('../types/index').FanqieTokenType} FanqieTokenType
 */

/**
 * 词法分析器类
 */
export class FanqieTokenizer {
    /**
     * @param {string} source 
     */
    constructor(source) {
        this.source = source
        this.pos = 0
        this.line = 1
        this.column = 1
        this.tokens = []
    }

    /**
     * 查看当前字符
     * @returns {string}
     */
    peek(offset = 0) {
        return this.source[this.pos + offset] || ''
    }

    /**
     * 前进并返回当前字符
     * @returns {string}
     */
    advance() {
        const ch = this.source[this.pos] || ''
        this.pos++
        if (ch === '\n') {
            this.line++
            this.column = 1
        } else {
            this.column++
        }
        return ch
    }

    /**
     * 检查是否到达末尾
     * @returns {boolean}
     */
    isAtEnd() {
        return this.pos >= this.source.length
    }

    /**
     * 创建Token
     * @param {FanqieTokenType} type 
     * @param {string} value 
     * @param {number} [offset]
     * @returns {FanqieToken}
     */
    makeToken(type, value, offset = undefined) {
        return {
            type,
            value,
            line: this.line,
            column: this.column - value.length,
            ...(offset !== undefined ? { offset } : {})
        }
    }

    /**
     * 跳过空白（不包括换行）
     */
    skipWhitespace() {
        while (!this.isAtEnd() && (this.peek() === ' ' || this.peek() === '\t')) {
            this.advance()
        }
    }

    /**
     * 读取到行尾
     * @returns {string}
     */
    readToEndOfLine() {
        let result = ''
        while (!this.isAtEnd() && this.peek() !== '\n' && this.peek() !== '\r') {
            result += this.advance()
        }
        return result.trim()
    }

    /**
     * 读取引号内容
     * @returns {string}
     */
    readQuotedString() {
        let result = ''
        this.advance() // skip "
        while (!this.isAtEnd() && this.peek() !== '"') {
            result += this.advance()
        }
        if (this.peek() === '"') this.advance() // skip closing "
        return result
    }

    /**
     * 读取方括号内容（倚音）
     * @returns {{notes: string, isAfter: boolean}}
     */
    readGraceNotes() {
        let notes = ''
        let isAfter = false
        this.advance() // skip [

        if (this.peek() === 'h') {
            isAfter = true
            this.advance()
        }

        while (!this.isAtEnd() && this.peek() !== ']') {
            notes += this.advance()
        }
        if (this.peek() === ']') this.advance()

        return { notes, isAfter }
    }

    /**
     * 读取 &xxx 标记
     * @returns {string}
     */
    readAmpersandCode() {
        let code = ''
        this.advance() // skip &
        while (!this.isAtEnd() && /[a-zA-Z]/.test(this.peek())) {
            code += this.advance()
        }
        return code
    }

    /**
     * 计算 + 符号数量
     * @returns {number}
     */
    countPlus() {
        let count = 0
        while (this.peek() === '+') {
            count++
            this.advance()
        }
        return count
    }

    /**
     * 对整个源码进行词法分析
     * @returns {FanqieToken[]}
     */
    tokenize() {
        this.tokens = []

        while (!this.isAtEnd()) {
            this.scanToken()
        }

        this.tokens.push(this.makeToken('EOF', ''))
        return this.tokens
    }

    /**
     * 扫描单个Token或Token组
     */
    scanToken() {
        const ch = this.peek()

        // 换行
        if (ch === '\n') {
            this.tokens.push(this.makeToken('NEWLINE', ch))
            this.advance()
            return
        }
        if (ch === '\r') {
            this.advance()
            if (this.peek() === '\n') {
                this.tokens.push(this.makeToken('NEWLINE', '\r\n'))
                this.advance()
            }
            return
        }

        // 空白
        if (ch === ' ' || ch === '\t') {
            let ws = ''
            while (!this.isAtEnd() && (this.peek() === ' ' || this.peek() === '\t')) {
                ws += this.advance()
            }
            this.tokens.push(this.makeToken('WHITESPACE', ws))
            return
        }

        // 注释行（以 # 开头，但不在音符之后）
        if (ch === '#' && (this.tokens.length === 0 ||
            this.tokens[this.tokens.length - 1].type === 'NEWLINE')) {
            this.advance()
            const content = this.readToEndOfLine()
            this.tokens.push(this.makeToken('COMMENT', '#' + content))
            return
        }

        // 描述头 (V:, B:, Z:, D:, P:, J:)
        if (/[VBZDPJ]/.test(ch) && this.peek(1) === ':' &&
            (this.tokens.length === 0 || this.tokens[this.tokens.length - 1].type === 'NEWLINE')) {
            const letter = this.advance()
            this.advance() // skip :
            this.skipWhitespace()
            const value = this.readToEndOfLine()

            const typeMap = {
                'V': 'VERSION',
                'B': 'TITLE',
                'Z': 'AUTHOR',
                'D': 'KEY',
                'P': 'METER',
                'J': 'TEMPO'
            }
            this.tokens.push(this.makeToken(typeMap[letter], value))
            return
        }

        // 内容行 (Q: 曲, C: 词)
        if ((ch === 'Q' || ch === 'C') && this.peek(1) === ':' &&
            (this.tokens.length === 0 || this.tokens[this.tokens.length - 1].type === 'NEWLINE')) {
            const letter = this.advance()
            this.advance() // skip :
            this.skipWhitespace()

            if (letter === 'Q') {
                this.tokens.push(this.makeToken('MELODY_LINE', 'Q:'))
            } else {
                const content = this.readToEndOfLine()
                this.tokens.push(this.makeToken('LYRIC_LINE', content))
            }
            return
        }

        // 音符 1-7
        if (ch >= '1' && ch <= '7') {
            this.tokens.push(this.makeToken('NOTE', ch))
            this.advance()
            return
        }

        // 休止符 0
        if (ch === '0') {
            this.tokens.push(this.makeToken('REST', ch))
            this.advance()
            return
        }

        // 隐藏休止符 8
        if (ch === '8') {
            this.tokens.push(this.makeToken('HIDDEN_REST', ch))
            this.advance()
            return
        }

        // 节奏音符 9
        if (ch === '9') {
            this.tokens.push(this.makeToken('RHYTHM_NOTE', ch))
            this.advance()
            return
        }

        // 高八度 '
        if (ch === "'") {
            this.tokens.push(this.makeToken('OCTAVE_UP', ch))
            this.advance()
            return
        }

        // 低八度 ,
        if (ch === ',') {
            this.tokens.push(this.makeToken('OCTAVE_DOWN', ch))
            this.advance()
            return
        }

        // 减时线 /（检查不在小节线后面）
        if (ch === '/') {
            // 检查前一个token是否是小节线
            const prev = this.tokens[this.tokens.length - 1]
            if (prev && prev.type === 'BAR') {
                // 修改前一个token为隐藏小节线
                prev.type = 'BAR_HIDDEN_NO_SPACE'
                prev.value = '|/'
                this.advance()
                return
            }
            this.tokens.push(this.makeToken('DURATION_REDUCE', ch))
            this.advance()
            return
        }

        // 附点 .
        if (ch === '.') {
            this.tokens.push(this.makeToken('DOT', ch))
            this.advance()
            return
        }

        // 升号 # (在音符后)
        if (ch === '#') {
            this.tokens.push(this.makeToken('SHARP', ch))
            this.advance()
            return
        }

        // 降号 $
        if (ch === '$') {
            this.tokens.push(this.makeToken('FLAT', ch))
            this.advance()
            return
        }

        // 还原号 =
        if (ch === '=') {
            this.tokens.push(this.makeToken('NATURAL', ch))
            this.advance()
            return
        }

        // 节拍连接 ~
        if (ch === '~') {
            this.tokens.push(this.makeToken('BEAM_JOIN', ch))
            this.advance()
            return
        }

        // 节拍切分 ^
        if (ch === '^') {
            this.tokens.push(this.makeToken('BEAM_BREAK', ch))
            this.advance()
            return
        }

        // 连音线 ( 和 )
        if (ch === '(') {
            this.advance()
            if (this.peek() === 'y') {
                this.advance()
                this.tokens.push(this.makeToken('TUPLET_START', '(y'))
            } else {
                this.tokens.push(this.makeToken('SLUR_START', '('))
            }
            return
        }

        if (ch === ')') {
            this.tokens.push(this.makeToken('SLUR_END', ch))
            this.advance()
            return
        }

        // 倚音 [...]
        if (ch === '[') {
            const { notes, isAfter } = this.readGraceNotes()
            if (isAfter) {
                this.tokens.push(this.makeToken('AFTER_GRACE_START', notes))
            } else {
                this.tokens.push(this.makeToken('GRACE_START', notes))
            }
            return
        }

        // 小节线系列
        if (ch === '|') {
            this.advance()
            const next = this.peek()

            if (next === '/') {
                this.advance()
                this.tokens.push(this.makeToken('BAR_HIDDEN_NO_SPACE', '|/'))
            } else if (next === '*') {
                this.advance()
                this.tokens.push(this.makeToken('BAR_HIDDEN_WITH_SPACE', '|*'))
            } else if (next === '|') {
                this.advance()
                if (this.peek() === ':') {
                    this.advance()
                    this.tokens.push(this.makeToken('BAR_DOUBLE_REPEAT', '||:'))
                } else {
                    this.tokens.push(this.makeToken('BAR_DOUBLE', '||'))
                }
            } else if (next === ':') {
                this.advance()
                this.tokens.push(this.makeToken('BAR_LEFT_REPEAT', '|:'))
            } else if (next === ']') {
                this.advance()
                this.tokens.push(this.makeToken('BAR_FINAL', '|]'))
            } else {
                this.tokens.push(this.makeToken('BAR', '|'))
            }
            return
        }

        // 右反复 :|
        if (ch === ':' && this.peek(1) === '|') {
            this.advance()
            this.advance()
            if (this.peek() === '|' && this.peek(1) === ':') {
                this.advance()
                this.advance()
                this.tokens.push(this.makeToken('BAR_DOUBLE_REPEAT', ':||:'))
            } else {
                this.tokens.push(this.makeToken('BAR_RIGHT_REPEAT', ':|'))
            }
            return
        }

        // 增时线 -
        if (ch === '-') {
            this.tokens.push(this.makeToken('DURATION_EXTEND', ch))
            this.advance()
            return
        }

        // 渐强 <
        if (ch === '<') {
            this.advance()
            const offset = this.countPlus()
            this.tokens.push(this.makeToken('CRESC_START', '<', offset))
            return
        }

        // 渐弱 >
        if (ch === '>') {
            this.advance()
            const offset = this.countPlus()
            this.tokens.push(this.makeToken('DECRESC_START', '>', offset))
            return
        }

        // 渐强/弱终点 !
        if (ch === '!') {
            this.tokens.push(this.makeToken('HAIRPIN_END', ch))
            this.advance()
            return
        }

        // 注释 "文字"
        if (ch === '"') {
            const content = this.readQuotedString()
            this.tokens.push(this.makeToken('ANNOTATION', content))
            return
        }

        // & 系列标记
        if (ch === '&') {
            const code = this.readAmpersandCode()
            const codeUpper = code.toUpperCase()

            // 力度术语
            if (['MP', 'MF', 'F', 'FF', 'FFF', 'P', 'PP', 'PPP'].includes(codeUpper)) {
                this.tokens.push(this.makeToken('DYNAMICS', code))
            }
            // 括号
            else if (code === 'zkh') {
                this.tokens.push(this.makeToken('LEFT_BRACKET', code))
            } else if (code === 'ykh') {
                this.tokens.push(this.makeToken('RIGHT_BRACKET', code))
            }
            // 其他装饰记号
            else {
                this.tokens.push(this.makeToken('ORNAMENT', code))
            }
            return
        }

        // 跳过未知字符
        this.advance()
    }
}

/**
 * 便捷函数：对源码进行词法分析
 * @param {string} source 
 * @returns {FanqieToken[]}
 */
export function tokenize(source) {
    const tokenizer = new FanqieTokenizer(source)
    return tokenizer.tokenize()
}

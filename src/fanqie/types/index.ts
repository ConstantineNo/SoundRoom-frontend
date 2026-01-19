/**
 * FanqieJianpu 类型定义
 * 番茄简谱格式的完整类型系统
 */

// ============================================
// 描述头相关类型
// ============================================

/** 拍号 */
export interface FanqieMeter {
  numerator: number       // 分子
  denominator: number     // 分母
  auxiliary?: boolean     // 是否为辅助拍号（带括号）
}

/** 调式 */
export interface FanqieKey {
  root: string            // C, D, E, F, G, A, B
  accidental?: 'sharp' | 'flat'  // # 或 $
}

/** 节拍/速度 */
export interface FanqieTempo {
  bpm?: number            // 每分钟拍数
  text?: string           // 文字描述（如"欢快的"）
}

/** 描述头 */
export interface FanqieHeader {
  version: string         // V: 版本号
  titles: string[]        // B: 标题（第一个是主标题，后续是副标题）
  authors: string[]       // Z: 作者列表
  key: FanqieKey          // D: 调式
  meters: FanqieMeter[]   // P: 拍号（可多个）
  tempo?: FanqieTempo     // J: 节拍
}

// ============================================
// 音符相关类型
// ============================================

/** 音符类型 */
export type FanqieNoteType = 'note' | 'rest' | 'hiddenRest' | 'rhythm'

/** 变音记号 */
export type FanqieAccidental = 'sharp' | 'flat' | 'natural'

/** 倚音 */
export interface FanqieGraceNote {
  degree: number                    // 1-7
  octave: number                    // 正数高八度，负数低八度
  durationReduceCount: number       // / 的数量（默认0=8分音符）
  accidental?: FanqieAccidental     // 升降号
}

/** 装饰记号 */
export interface FanqieOrnament {
  code: string            // &xxx 中的 xxx 部分
  position?: number       // + 的数量（位置调整）
}

/** 音符 */
export interface FanqieNote {
  // === 基本信息 ===
  type: FanqieNoteType    // 音符类型
  degree?: number         // 1-7（音符时必填）
  
  // === 八度 ===
  octave: number          // 正数高八度，负数低八度（' 和 , 的数量）
  
  // === 时值 ===
  durationReduceCount: number   // / 的数量（减时线）
  durationExtendCount: number   // - 的数量（增时线）
  dots: number                  // 附点数量（1或2）
  
  // === 变音 ===
  accidental?: FanqieAccidental
  
  // === 节拍切分控制 ===
  beamJoinNext?: boolean        // ~ 与下一音符连在一拍
  beamBreakNext?: boolean       // ^ 与下一音符强制分拍
  
  // === 连音线 ===
  slurStarts: number            // ( 的数量（支持嵌套）
  slurEnds: number              // ) 的数量
  
  // === 多连音 ===
  tupletStart?: boolean         // (y 多连音起点
  tupletEnd?: boolean           // 多连音终点
  
  // === 倚音 ===
  graceNotes?: FanqieGraceNote[]       // 前倚音
  afterGraceNotes?: FanqieGraceNote[]  // 后倚音
  
  // === 力度与表情 ===
  dynamics?: string             // &mp, &f 等力度术语
  crescStart?: boolean          // < 渐强起点
  decrescStart?: boolean        // > 渐弱起点
  hairpinEnd?: boolean          // ! 渐强/渐弱终点
  hairpinOffset?: number        // + 上移层数
  
  // === 括号 ===
  leftBracket?: boolean         // &zkh
  rightBracket?: boolean        // &ykh
  
  // === 装饰记号 ===
  ornaments?: FanqieOrnament[]  // &xxx 装饰符列表
  
  // === 注释 ===
  annotation?: string           // "文字" 音符上方注释
  
  // === 布局信息（渲染时计算）===
  x?: number
  displayWidth?: number
  beatGroup?: number            // 所属拍组
}

// ============================================
// 小节相关类型
// ============================================

/** 小节线类型 */
export type FanqieBarType = 
  | 'bar'               // | 普通小节线
  | 'hidden_no_space'   // |/ 隐藏（不占空间）
  | 'hidden_with_space' // |* 隐藏（占空间）
  | 'double'            // || 双细线
  | 'left_repeat'       // |: 左反复
  | 'right_repeat'      // :| 右反复
  | 'double_repeat'     // :||: 双反复
  | 'final'             // |] 终止线

/** 跳房子信息 */
export interface FanqieEnding {
  type: 'start' | 'end'
  label?: string        // 备注数字/文字
  open?: boolean        // 是否右侧不封闭（[/）
  offset?: number       // + 上移层数
}

/** 小节 */
export interface FanqieMeasure {
  notes: FanqieNote[]
  
  // === 小节线 ===
  barType: FanqieBarType
  
  // === 跳房子 ===
  endingStart?: FanqieEnding
  endingEnd?: boolean
  
  // === 临时拍号 ===
  tempMeter?: FanqieMeter
  
  // === 小节注释 ===
  annotation?: string
  
  // === 反复记号 ===
  dcAlFine?: boolean    // D.C. al Fine
  dsAlCoda?: boolean    // D.S. al Coda
  fine?: boolean        // Fine
  coda?: boolean        // Coda 记号
  segno?: boolean       // Segno 记号
  
  // === 布局信息（渲染时计算）===
  x?: number
  measureNumber?: number
}

// ============================================
// 行与完整乐谱
// ============================================

/** 曲谱行 */
export interface FanqieLine {
  measures: FanqieMeasure[]
  lyrics: string[][]          // 多行歌词（每行歌词是字符数组）
}

/** 完整乐谱 */
export interface FanqieScore {
  header: FanqieHeader
  lines: FanqieLine[]
}

// ============================================
// Token 类型（词法分析用）
// ============================================

/** Token 类型枚举 */
export type FanqieTokenType =
  // 描述头
  | 'VERSION'           // V:
  | 'TITLE'             // B:
  | 'AUTHOR'            // Z:
  | 'KEY'               // D:
  | 'METER'             // P:
  | 'TEMPO'             // J:
  // 内容行
  | 'MELODY_LINE'       // Q:
  | 'LYRIC_LINE'        // C:
  | 'COMMENT'           // #
  // 音符
  | 'NOTE'              // 1-7
  | 'REST'              // 0
  | 'HIDDEN_REST'       // 8
  | 'RHYTHM_NOTE'       // 9
  // 修饰符
  | 'OCTAVE_UP'         // '
  | 'OCTAVE_DOWN'       // ,
  | 'DURATION_EXTEND'   // -
  | 'DURATION_REDUCE'   // /
  | 'DOT'               // .
  | 'SHARP'             // #
  | 'FLAT'              // $
  | 'NATURAL'           // =
  // 节拍切分
  | 'BEAM_JOIN'         // ~
  | 'BEAM_BREAK'        // ^
  // 连音线
  | 'SLUR_START'        // (
  | 'SLUR_END'          // )
  | 'TUPLET_START'      // (y
  // 倚音
  | 'GRACE_START'       // [
  | 'GRACE_END'         // ]
  | 'AFTER_GRACE_START' // [h
  // 小节线
  | 'BAR'               // |
  | 'BAR_HIDDEN_NO_SPACE'   // |/
  | 'BAR_HIDDEN_WITH_SPACE' // |*
  | 'BAR_DOUBLE'        // ||
  | 'BAR_LEFT_REPEAT'   // |:
  | 'BAR_RIGHT_REPEAT'  // :|
  | 'BAR_DOUBLE_REPEAT' // :||:
  | 'BAR_FINAL'         // |]
  // 跳房子
  | 'ENDING_START'      // [ (在小节线处)
  | 'ENDING_END'        // ]
  // 力度
  | 'DYNAMICS'          // &mp 等
  | 'CRESC_START'       // <
  | 'DECRESC_START'     // >
  | 'HAIRPIN_END'       // !
  // 装饰
  | 'ORNAMENT'          // &xxx
  | 'LEFT_BRACKET'      // &zkh
  | 'RIGHT_BRACKET'     // &ykh
  // 注释
  | 'ANNOTATION'        // "文字"
  // 其他
  | 'WHITESPACE'
  | 'NEWLINE'
  | 'EOF'

/** Token */
export interface FanqieToken {
  type: FanqieTokenType
  value: string
  line: number
  column: number
  // 额外数据
  offset?: number       // + 的数量（位置调整）
}

// ============================================
// 解析结果
// ============================================

/** 解析错误 */
export interface FanqieParseError {
  message: string
  line: number
  column: number
  context?: string
}

/** 解析结果 */
export interface FanqieParseResult {
  score?: FanqieScore
  errors: FanqieParseError[]
  warnings: FanqieParseError[]
}

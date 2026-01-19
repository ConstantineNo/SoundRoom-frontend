/**
 * Fanqie to ABC Converter
 * 将番茄简谱AST转换为ABC记谱法字符串
 */

/**
 * @typedef {import('../types/index').FanqieScore} FanqieScore
 * @typedef {import('../types/index').FanqieNote} FanqieNote
 * @typedef {import('../types/index').FanqieMeasure} FanqieMeasure
 */

const NOTE_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B']

export function fanqieToAbc(score) {
    let abc = ''
    const header = score.header

    // 1. Header
    abc += 'Percentage: FanqieJianpu Generated\n'
    abc += `X: 1\n` // Index
    abc += `T: ${header.titles[0] || 'Untitled'}\n`
    // 副标题转为 T: (subtitle) ? 或者其他字段
    for (let i = 1; i < header.titles.length; i++) {
        abc += `T: ${header.titles[i]}\n`
    }

    header.authors.forEach(z => {
        abc += `C: ${z}\n`
    })

    // Key
    const root = header.key.root.toUpperCase()
    let acc = ''
    if (header.key.accidental === 'sharp') acc = '#'
    if (header.key.accidental === 'flat') acc = 'b'
    const keyStr = root + acc
    abc += `K: ${keyStr}\n`

    // Meter
    if (header.meters.length > 0) {
        const m = header.meters[0]
        abc += `M: ${m.numerator}/${m.denominator}\n`
    } else {
        abc += `M: 4/4\n`
    }

    // Tempo
    if (header.tempo) {
        if (header.tempo.bpm) {
            abc += `Q: 1/4=${header.tempo.bpm}\n`
        } else if (header.tempo.text) {
            // ABC Q: "text" is not standard standard, usually just text field or Q with text
            // But Q: "Allegro" 1/4=120 is valid.
            // We'll just put it as instruction for now? 
            // Or standard ABC has no pure text tempo field except as directive.
            // Let's use Q if pure number, otherwise ignored or verify.
        }
    }

    // Default Length
    // Jianpu numbers usually mean quarter notes if denom is 4, or...
    // Let's use L: 1/4 as base unit for "1".
    abc += `L: 1/4\n`

    // 2. Content
    // Fanqie has multiple lines (visual lines). ABC treats newlines as continuation or new lines based on structure.
    // We will output line by line.

    // Pre-calculate Key Root Index for note mapping
    // C=0, D=1...
    const rootIndex = NOTE_NAMES.indexOf(root)

    for (const line of score.lines) {
        let abcLine = ''

        // Process Measures
        for (const measure of line.measures) {
            // Ending Start
            if (measure.endingStart) {
                abcLine += '['
                // If label exists: "1."
                // ABC ending: [1 or [2
                // Fanqie ending might just be start. Assuming [1 for now if undefined.
                // TODO: Map ending labels if parser supports them
            }

            // Notes
            for (const note of measure.notes) {
                abcLine += convertNote(note, rootIndex)
            }

            // Ending End
            if (measure.endingEnd) {
                // ABC doesn't explicitly mark end of ending bracket ] usually, 
                // it ends at bar line or next [|? 
                // Actually ABC uses |] or :| to close. 
                // Or [1 .... :| [2 ... |]
                // If explicit ] token, maybe nothing to output in ABC structure if mapped to bars?
            }

            // Bar Line
            abcLine += ' ' + convertBar(measure.barType) + ' '
        }

        // Add Lyrics
        // ABC lyrics: w: word word
        // We have lyrics separated by lines in AST
        // Need to match measures?
        // Fanqie AST has lyrics array on the Line object.
        if (line.lyrics.length > 0) {
            abcLine += '\n'
            for (const lyricRow of line.lyrics) {
                abcLine += 'w: ' + lyricRow.join(' ') + '\n'
            }
        }

        abc += abcLine + '\n'
    }

    return abc
}

/**
 * @param {FanqieNote} note 
 * @param {number} rootIndex 
 */
function convertNote(note, rootIndex) {
    let str = ''

    // Prefix: Grace Notes
    if (note.graceNotes && note.graceNotes.length > 0) {
        // ABC Grace notes: {notes}
        // Need to convert grace notes recursively?
        // For now ignore complexity
    }

    // Prefix: Slur Start
    // ABC slur is (
    for (let i = 0; i < note.slurStarts; i++) str += '('

    // Prefix: Ornaments
    // ABC ornaments: !trill! etc. or T, etc.
    // Fanqie &cy -> trill
    for (const orn of note.ornaments) {
        const abcOrn = mapOrnament(orn.code)
        if (abcOrn) str += abcOrn
    }

    // Prefix: Accidentals
    // ABC: ^, _, =
    if (note.accidental === 'sharp') str += '^'
    else if (note.accidental === 'flat') str += '_'
    else if (note.accidental === 'natural') str += '='

    // Pitch
    if (note.type === 'rest') {
        str += 'z'
    } else if (note.type === 'hiddenRest') {
        str += 'x'
    } else if (note.type === 'rhythm') {
        // How to represent X rhythm in ABC? 
        // Usually mapped to a pitch but with specific head?
        // Or just 'B' or something?
        str += 'B'
    } else {
        // Normal Note 1-7
        if (note.degree) {
            const offset = note.degree - 1 // 0-6
            const targetIndex = (rootIndex + offset) % 7
            const letter = NOTE_NAMES[targetIndex]

            // Calculate Octave
            // Base is C4 (c) ?
            // ABC: C, D, E, F, G, A, B | c d e f g a b | c' ...
            // We set L:1/4.
            // Jianpu "1" is middle register?
            // Usually 1=C means C4 (Middle C).
            // ABC 'C' is C3. 'c' is C4.
            // So if 1=C, we want 'c'.
            // If 1=G (G3 or G4?) Usually G4? 
            // Let's assume Middle Octave (c-b in ABC).

            // Check if wrapped around
            // e.g. Root=G(4). 1=G.
            // 4->C(0)? Wrapped.
            // If we wrap (index < rootIndex), it means we crossed C.
            // G A B (cross C) c d e f#
            // G(4) A(5) B(6) C(0+octave)

            let octaveShift = 0
            if ((rootIndex + offset) >= 7) {
                // 4+0=4, 4+1=5, 4+2=6, 4+3=7? No %7.
                // Wait. (4+3)%7 = 0.
                // If we went from 4 to 0, we effectively went UP.
                octaveShift = 1
            }

            // Apply fanqie octave ( ' or , )
            octaveShift += note.octave

            // Convert to ABC case/octave
            // Base register C4 = 'c'
            // If octaveShift = 0 -> 'c' range (c d e f g a b)
            // If octaveShift = -1 -> 'C' range (C D E F G A B)
            // If octaveShift = 1 -> 'c'' range

            let finalChar = letter

            // Logic to convert 'C' + shift -> ABC
            // Default 'C' is C3? 
            // Wait, standard ABC:
            // C, -> C2
            // C  -> C3
            // c  -> C4 (Middle)
            // c' -> C5

            // We want 1 to be roughly C4-B4 range.
            // So we want base 'c' (lowercase).
            // Unless it's lower.

            // Let's assume calculated 'letter' is uppercase [C-B].
            // To make it C4 range: lowercase it.
            // C -> c

            let abcPitch = letter.toLowerCase()

            if (octaveShift > 0) {
                for (let k = 0; k < octaveShift; k++) abcPitch += "'"
            } else if (octaveShift < 0) {
                // c -> C -> C, -> C,,
                // -1: C
                // -2: C,

                // Hard to do strictly with loops on 'c'
                // Let's use a numeric octave value relative to C4(0)
                // c = 0
                // c' = 1
                // C = -1
                // C, = -2

                // Actually simpler:
                // Just apply ' and , to the base lowercase
                // But c + , = C ? No ABC syntax doesn't work like that for lowercase.
                // c, Is not C.
                // C is C.
                // c is c.

                // Re-eval:
                // Base 'C' (uppercase).
                // octave 0 (C4 range): lowercase 'c'
                // octave -1 (C3 range): uppercase 'C'
                // octave -2 (C2 range): uppercase 'C,'
                // octave 1 (C5 range): lowercase 'c''

                if (octaveShift === 0) {
                    abcPitch = letter.toLowerCase()
                } else if (octaveShift === 1) {
                    abcPitch = letter.toLowerCase() + "'"
                } else if (octaveShift > 1) {
                    abcPitch = letter.toLowerCase() + "'".repeat(octaveShift)
                } else if (octaveShift === -1) {
                    abcPitch = letter // Uppercase
                } else if (octaveShift < -1) {
                    abcPitch = letter + ",".repeat(Math.abs(octaveShift + 1))
                }
            }

            str += abcPitch
        }
    }

    // Length
    if (note.durationExtendCount > 0) {
        str += (note.durationExtendCount + 1).toString()
    }
    if (note.durationReduceCount > 0) {
        str += '/'.repeat(note.durationReduceCount) // / means /2, // means /4
    }

    // Dots
    if (note.dots > 0) {
        str += '3/2' // Wait. ABC dot is > or . ?
        // No, broken rhythm is >.
        // Dotted note length:
        // In ABC, C3 is dotted half? No.
        // C3 is 3 beats.
        // C. is not standard length notation unless broken rhythm pair.
        // Standard way: C3/2 for dotted quarter (if L:1/4).
        // If dot=1: length * 1.5 -> *3/2
        // If dot=2: length * 1.75 -> *7/4

        if (note.dots === 1) str += '3/2'
        if (note.dots === 2) str += '7/4'
    }

    // Suffix: Slur End
    for (let i = 0; i < note.slurEnds; i++) str += ')'

    str += ' ' // spacing
    return str
}

/**
 * @param {FanqieBarType} type 
 */
function convertBar(type) {
    switch (type) {
        case 'bar': return '|'
        case 'double': return '||'
        case 'final': return '|]'
        case 'left_repeat': return '|:'
        case 'right_repeat': return ':|'
        case 'double_repeat': return ':||:'
        case 'hidden_no_space': return '' // invisible
        case 'hidden_with_space': return '' // invisible but space?
        default: return '|'
    }
}

function mapOrnament(code) {
    // &cy -> trill -> !trill!
    const map = {
        'cy': '!trill!',
        'bo': '!mordent!',
        'yy': '!fermata!',
        // Add more mappings
    }
    return map[code]
}

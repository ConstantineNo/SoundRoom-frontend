
/**
 * Jianpu (Numbered Musical Notation) Generator for ABC
 * Maps ABC notes to Numbers based on Key signature (Movable Do).
 */

// Semitone offsets from C
const NOTE_OFFSETS = {
    'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11,
    'c': 0, 'd': 2, 'e': 4, 'f': 5, 'g': 7, 'a': 9, 'b': 11
};

// Accidental values
const ACCIDENTALS = {
    '^': 1, '^^': 2, '_': -1, '__': -2, '=': 0
};

// Map semitone interval (0-11) to Jianpu Number and Accidental
// Using sharp preference for now, could be improved based on context
const SCALE_DEGREE_MAP = {
    0: '1',
    1: '#1',
    2: '2',
    3: '#2',
    4: '3',
    5: '4',
    6: '#4',
    7: '5',
    8: '#5',
    9: '6',
    10: '#6',
    11: '7'
};

const MODE_OFFSETS = {
    'm': -3, // Minor key, usually relative major logic is needed or verify user intent. 
    // Using simple movable Do: Key C -> 1=C. Key Am -> 1=C (traditional) or 6=A?
    // Usually for Jianpu, if it's Am, we might write 1=C and start on 6.
    // Let's assume Key letter defines "1".
    // If K:F, F=1.
    // If K:Am, A=6? Or A=1? 
    // Logic: Parse "K:G" -> Root G. Map based on G=1.
    // If complex modes, fallback to Major.
};

function parseKey(abcCode) {
    const match = abcCode.match(/^K:\s*([A-G][#b]?)(m?)/m);
    if (!match) return { root: 'C', mode: '' };
    return { root: match[1], mode: match[2] };
}

function getNoteSemitone(noteChar, accidentalStr) {
    let base = NOTE_OFFSETS[noteChar];
    let acc = 0;
    if (accidentalStr) {
        if (ACCIDENTALS[accidentalStr] !== undefined) acc = ACCIDENTALS[accidentalStr];
    }
    return base + acc;
}

function getOctaveOffset(noteChar, octaveStr) {
    // Standard ABC:
    // C, = -1 octave relative to C
    // C = 0 relative to C
    // c = +1 octave (Middle C)  <-- Wait, usually C is bass, c is middle.
    // c' = +2 octave

    // Let's standardize on semitones from C4 (Middle C) = 60
    // But for relative calculation, we just need delta.

    // In ABC:
    // C is C3
    // c is C4

    let shift = 0;
    if (noteChar >= 'a') shift += 12; // lowercase starts higher

    if (octaveStr) {
        for (let char of octaveStr) {
            if (char === ',') shift -= 12;
            if (char === "'") shift += 12;
        }
    }
    return shift;
}

function getRootSemitone(rootKey) {
    // Calculate semitone of the Key Root relative to C
    // e.g. G -> 7, F -> 5, Bb -> 10
    const base = NOTE_OFFSETS[rootKey[0].toUpperCase()];
    let acc = 0;
    if (rootKey.length > 1) {
        if (rootKey[1] === '#') acc = 1;
        if (rootKey[1] === 'b') acc = -1;
    }
    return base + acc;
}

// Helper to convert normalized semitones to dot notation
// 0 = Root (1). -12 = Low Dot. +12 = High Dot.
function formatJianpu(semitoneInterval) {
    // Normalise to -something to +something
    // range: semitoneInterval is (NoteAbs - RootAbs)

    // Adjust octave
    let octave = 0;
    let noteInOctave = semitoneInterval;

    while (noteInOctave < 0) {
        noteInOctave += 12;
        octave--;
    }
    while (noteInOctave >= 12) {
        noteInOctave -= 12;
        octave++;
    }

    let baseNum = SCALE_DEGREE_MAP[noteInOctave] || '?';

    // Apply dots
    // Logic: 
    // octave 0: 1
    // octave 1: 1' ? No, usually dot on top.
    // In text "w:", usually use * or ' for high?
    // User request: "C->1".
    // Common text representation:
    // High: 1' or 1.
    // Low: 1,
    // Let's use standard ABC-like suffix for now, or just numbers if simple.
    // Dizi players often use: 1 (dot above) for high.
    // Since we are outputting TEXT lyrics, we can't easily do vertical dots.
    // Convention: 1' (high), 1, (low). 

    let suffix = "";
    while (octave > 0) {
        suffix += "'"; // or use unicode dot?
        octave--;
    }
    while (octave < 0) {
        suffix += ",";
        octave++;
    }

    return baseNum + suffix;
}

export function generateJianpu(abcCode) {
    const lines = abcCode.split('\n');
    const newLines = [];

    // Default Key C
    let currentRoot = 0; // C

    // Scan for global key first? Or process line by line (key changes supported)
    // Simple version: Update key when K: found.

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trimEnd();
        newLines.push(line);

        // Check for Key Change
        const kMatch = line.match(/^K:\s*([A-G][#b]?)/);
        if (kMatch) {
            currentRoot = getRootSemitone(kMatch[1]);
            continue;
        }

        // Skip metadata lines and existing lyric lines
        if (/^[A-Z]:/.test(line) || line.startsWith('w:') || line.startsWith('%') || line.trim() === '') {
            continue;
        }

        // Process music line
        // Regex to match notes
        // Matches:
        // 1: Accidental (^, ^^, _, __, =)
        // 2: Note (A-G, a-g)
        // 3: Octave (', ,)
        // Ignoring lengths (digits, /) for mapping purposes
        const noteRegex = /([_\^=]*)([A-Ga-g])([,']*)/g;

        const matchFound = line.match(noteRegex);
        if (matchFound) {
            let jianpuLine = "w:";
            let match;
            // We need to loop to map each note
            while ((match = noteRegex.exec(line)) !== null) {
                const accidental = match[1];
                const noteChar = match[2];
                const oct = match[3];

                const noteAbs = getNoteSemitone(noteChar) + getOctaveOffset(noteChar, oct) + (ACCIDENTALS[accidental] || 0);

                // Calculate relative to Key
                // Need to handle octave alignment. 
                // E.g. in C: c(C4) is 1 (usually middle C is 1 in vocal/folk music? Or C3?)
                // Actually usually 1 = Key Root.
                // If Key=C, C4 is 1. C5 is 1'. C3 is 1,.
                // My getOctaveOffset logic needs a reference.
                // NOTE_OFFSETS: C=0.
                // C3 (ABC 'C') -> Offset 0.
                // C4 (ABC 'c') -> Offset 12.
                // If Root is C (0).
                // C3 -> 0. Distance 0. -> 1.
                // C4 -> 12. Distance 12. -> 1'.
                // Sounds correct.

                const interval = noteAbs - currentRoot;
                const noteStr = formatJianpu(interval);

                jianpuLine += " " + noteStr;
            }
            newLines.push(jianpuLine);
        }
    }

    return newLines.join('\n');
}

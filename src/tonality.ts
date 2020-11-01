
export interface Temperament {
    getFactor(noteNum: number);
}
export class EqualTemperament implements Temperament {
    getFactor(noteNum: number) {
        const x = [
            1,
            1.059463,
            1.122462,
            1.189207,
            1.259921,
            1.334840,
            1.414214,
            1.498307,
            1.587401,
            1.681793,
            1.781797,
            1.887749,
            2 ];
        noteNum -= Notes.defaultC4;
        return noteNum >= 0 
            ? x[noteNum % 12] * Math.pow(2, Math.floor(noteNum / 12))
            : x[(noteNum % 12) + 12] * Math.pow(2, Math.ceil(noteNum / 12) - 1);
    }
}

export class Notes {
    private static noteToIndex: Map<string, number>;
    private static indexToNote: Map<number, string[]>;
    static defaultOctave: number = 4;
    static defaultC4: number = 60;

    static init() {
        if (!Notes.noteToIndex) {
            const notesRaw: string[] = ["c", "c# db", "d", "d# eb", "e", "f", "f# gb", "g", "g# ab", "a", "a# bb", "b"];
            const notes = notesRaw.map((v, i) => v.split(' ')); //.map(n => ({ note: n, index: i })));
            
            Notes.noteToIndex = new Map<string, number>();
            notes.forEach((vs, i) => vs.forEach(v => Notes.noteToIndex.set(v, i)));

            Notes.indexToNote = new Map<number, string[]>();
            notes.forEach((vs, i) => Notes.indexToNote.set(i, vs));
        }
    }

    static noteIndexTo12AndOctave(midiNoteIndex: number) {
        const index = midiNoteIndex - Notes.defaultC4;
        let index12 = index % 12;
        let octaveOffset = 0;
        if (index < 0) {
            index12 = Math.abs((index12 + 12) % 12);
            octaveOffset = Math.ceil(index / 12) - (index12 > 0 ? 1 : 0);
        } else {
            octaveOffset = Math.floor(index / 12);
        }
        return { index: index12, octave: octaveOffset + Notes.defaultOctave };
    }

    static getNoteNames(midiNoteIndex: number, includeOctaveNumber: boolean) {
        Notes.init();

        const n12Octave = Notes.noteIndexTo12AndOctave(midiNoteIndex);
        const names = Notes.indexToNote.get(n12Octave.index);
        if (includeOctaveNumber) {
            return names.map(n => `${n.substr(0, 1)}${n12Octave.octave}${n.length > 1 ? n.substr(1, 1) : ""}`);
        }
        return names;
    }

    static getNoteIndex(note: string, octaveOffset: boolean): number {
        Notes.init();

        let octave = Notes.defaultOctave;

        note = note.substr(0, 1).toLowerCase() + note.substr(1);
        if (note.length > 1) {
            const oct = parseFloat(note.substr(1, 1));
            if (!isNaN(oct)) {
                note = note.substr(0, 1) + (note.length > 2 ? note.substr(2, 1) : "");
                octave = oct;
            }
        }
        return Notes.noteToIndex.get(note) + Notes.defaultC4 + (octaveOffset ? (octave - Notes.defaultOctave) * 12 : 0);
    }
}

export class NoteHzConvert {
    private hzForA: number;
    private temperament: Temperament;

    constructor(hzForA: number, temperament: Temperament) {
        this.hzForA = hzForA;
        this.temperament = temperament;
    }
    getHz(note: string | number) {
        if (typeof note === "string") {
            note = Notes.getNoteIndex(note, true);
        }
        const fact = this.hzForA / this.temperament.getFactor(Notes.defaultC4 + 9);
        return this.temperament.getFactor(note) * fact;
    }
}

export class Chords {
    // https://en.wikipedia.org/wiki/Chord_letters
    static parse(chord: string) {
        // const rx = /(?<noteBase>[A-H])(?<noteMod>[#b]?)(?<minor>m(?!a))?(?<mod>maj|dim)?(?<ext>\d*)(?<sus>sus\d*)?/;
        const rx = /(?<noteBase>[A-H])(?<noteMod>[#b]?)(?<mOrP>(m(?!a)|\+))?(?<mod>maj|dim)?(?<ext>\d*)(?<sus>sus\d*)?(?<add>add\d)?/;
        const found = rx.exec(chord);
        if (!found.length) {
            throw new Error("Chord undefined");
        }
        const groups = found["groups"];
        return {
            noteBase: groups.noteBase, 
            noteMod: groups.noteMod,
            mOrP: groups.mOrP,
            mod: groups.mod,
            extended: groups.ext === undefined ? Number.NaN : parseFloat(groups.ext),
            sus: groups.sus === undefined ? Number.NaN : parseFloat(groups.sus.substr(3)),
            add: groups.add === undefined ? Number.NaN :parseFloat(groups.add.substr(3))
        }
    }
    static getOffsets(chord: string) {
        const parsed = Chords.parse(chord);
        let offsets = [0, 4, 7];
        if (parsed.mOrP === "m") {
            offsets[1]--;
        } else if (parsed.mOrP === "+") {
            offsets[2]++;
        }
        if (parsed.mod === "dim") {
            offsets[1]--;
            offsets[2]--;
        }
        if (parsed.sus === 4) {
            offsets[1] = 5;
        } else if (parsed.sus === 2) {
            offsets[1] = 2;
        }
        if (!isNaN(parsed.add)) {
            offsets.push(parsed.add);
        }
        if (!isNaN(parsed.extended)) {
            if (parsed.extended >= 7) {
                offsets.push(10);
                if (parsed.mod === "maj") {
                    offsets[offsets.length - 1]++;
                }
                if (parsed.extended >= 9) {
                    offsets.push(14);
                    if (parsed.extended >= 11) {
                        offsets.push(17);
                    }
                }
            }
        }
        // console.log(parsed, offsets);

        return { offsets: offsets, baseNote: `${parsed.noteBase}${parsed.noteMod}` };
    }

    static getNotes(chord: string) {
        // (maj|maj7|maj9|maj11|maj13|maj9#11|maj13#11|6|add9|maj7b5|maj7#5||min|m7|m9|m11|m13|m6|madd9|m6add9|mmaj7|mmaj9|m7b5|m7#5|7|9|11|13|7sus4|7b5|7#5|7b9|7#9|7b5b9|7b5#9|7#5b9|9#5|13#11|13b9|11b9|aug|dim|dim7|sus4|sus2|sus2sus4|-5|)
        // /[A-H][#b]?(maj|m|dim|sus)?[79]?/
        // const rxNote = /^[A-H](b|bb|#|##)?/;
        // const baseNote = (rxNote.exec(chord) || [ "" ])[0];
        // if (baseNote.length === 0) return [];
        // const mod = chord.substring(baseNote.length);
        // // "Am7"
        // const defs = {
        //     "": [0, 4, 7],
        //     "m": [0, 3, 7],
        //     "+": [0, 4, 8],
        //     "dim": [0, 3, 6],
        //     "7": [0, 4, 7, 10],
        //     "m7": [0, 3, 7, 10],
        //     "+7": [0, 4, 8, 10],
        //     "maj7": [0, 4, 7, 11],
        //     "mmaj7": [0, 3, 7, 11],
        // }

        // const aliases = { 
        //     "minmaj" : "mmaj"
        // };
        // if (mod.endsWith("7")) {
        //     // if (mod.endsWith("maj7"))
        // }
        // const offsets = defs[mod] || defs[""];
        // const base = Notes.getNoteIndex(baseNote, false);
        // return offsets.map(o => base + o);
        const info = Chords.getOffsets(chord);
        const baseNoteIndex = Notes.getNoteIndex(info.baseNote, false);
        if (isNaN(baseNoteIndex)) throw Error("Basenote not parsed; " + info.baseNote);
        return info.offsets.map(o => baseNoteIndex + o);
    }
}

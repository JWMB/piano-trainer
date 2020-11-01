import type { MidiMessageEvent } from "./event";
import type { NoteInfo } from "./inputOutputTransforms";
import { AllSoundOffMessage, Message, MessageDispatcher, MessageReceiver, NoteMessage, NoteOffMessage, NoteOnMessage, Pitch } from "./midi";
import { Notes } from "./tonality";

export interface InstrumentKey {
    midiNote: number;
    isDown: boolean;
    down();
    up();
}
export interface InstrumentKeyGUI {
    down();
    up();
}

export type Rectangle = { x: number, y: number, width: number, height: number }
export type Point = { x: number, y: number }

export class PianoKey implements InstrumentKey {
    midiNote: number;
    isDown: boolean;
    rect: Rectangle;
    gfx: InstrumentKeyGUI;

    static keyPositions = [0, 0.5, 1, 1.5, 2, 3, 3.5, 4, 4.5, 5, 5.5, 6];

    down() {
        if (this.isDown) return;
        this.isDown = true;
        this.gfx?.down();
    }
    up() {
        if (!this.isDown) return;
        this.isDown = false;
        this.gfx?.up();
    }

    constructor(midiNote: number, rect: Rectangle) {
        this.midiNote = midiNote;
        this.rect = rect;
    }

    static isWhiteNote(midiNote: number) { return Notes.getNoteNames(midiNote, false)[0].length === 1; }

    static getXRel(midiNote: number) {
        const n12Octave = Notes.noteIndexTo12AndOctave(midiNote);
        const xRel = PianoKey.keyPositions[n12Octave.index];
        return xRel + n12Octave.octave * 7;
    }

    static createDefinition(midiNote: number, leftmostMidiNote: number, scale: {x: number, y: number}, offset: {x: number, y: number}) {
        const xRel = PianoKey.getXRel(midiNote) - Math.floor(PianoKey.getXRel(leftmostMidiNote));
        const isWhite = PianoKey.isWhiteNote(midiNote);

        const relSize = { 
            x: isWhite ? 1 : 0.7,
            y: isWhite ? 1 : 0.6
        };
        const pos = {
            x: offset.x + (xRel + (1.0 - relSize.x) / 2) * scale.x, 
            y: offset.y
        };
        return { 
            rect: { x: pos.x, y: pos.y, width: relSize.x * scale.x, height: relSize.y * scale.y },
            isWhite: isWhite
        }
     }

    static createKeyDefs(startNote: number, endNote: number, scale: {x: number, y: number}, offset: {x: number, y: number}) {
        return Array.from(Array(endNote - startNote).keys()).map(v => ({ note: v + startNote, keyDef: PianoKey.createDefinition(v + startNote, startNote, scale, offset) }));
    }
}

export class PianoKeyboard implements MessageReceiver {
    private keys: PianoKey[];
    private receiver: MessageReceiver;

    constructor(receiver: MessageReceiver) {
        this.receiver = receiver;
    }

    getKeys() { return [].concat(this.keys); }

    private getKey(note: string | number) {
        const noteIndex = typeof note === "string" ? Notes.getNoteIndex(note, true) : note;
        if (!!this.keys) {
            const found = this.keys.filter(k => k.midiNote == noteIndex);
            if (found.length) {
                return found[0];
            }
        }
        console.log("not found", note);
        return null;
    }
    // connectInput(input: MessageDispatcher) {
    //     input.outEvent.addListener("note", this.onEventMessage.bind(this));
    // }
    // onEventMessage(e: MidiMessageEvent) {
    //     this.onMessage(e.message);
    // }
    onMessage(msg: Message) {
        if (msg instanceof NoteMessage) {
            this.noteOnOff({ midiNote: msg.getPitch().getMidiNote(), velocity: msg.getVelocity() / 127, mode: msg instanceof NoteOnMessage ? "down" : "up" });
        } else if (msg instanceof AllSoundOffMessage) {
            this.noteOffAll();
        }
    }
    noteOn(note: string | number, velocity: number = 1) {
        this.noteOnOff({ midiNote: typeof note === "string" ? Notes.getNoteIndex(note, true) : note, velocity: velocity, mode: "down"});
    }
    noteOff(note: string | number) {
        this.noteOnOff({ midiNote: typeof note === "string" ? Notes.getNoteIndex(note, true) : note, velocity: 1, mode: "up"});
    }
    private noteOnOff(note: NoteInfo) {
        const key = this.getKey(note.midiNote);
        if (!key) { return; }

        if (note.mode === "down") { key.down();
        } else { key.up(); }

        const msg = note.mode === "down" 
            ? new NoteOnMessage(null, null, new Pitch(note.midiNote), 127 * (note.velocity || 1), null)
            : new NoteOffMessage(null, null, new Pitch(note.midiNote), 127 * (note.velocity || 1), null)
        this.receiver.onMessage(msg);
    }

    noteOffAll() {
        this.keys.filter(k => k.isDown).forEach(k => this.noteOff(k.midiNote));
    }

    createKeys(startNote: number, endNote: number, scale: Point, offset: Point = { x: 0, y: 0 }) {
        const defs = PianoKey.createKeyDefs(startNote, endNote, scale, offset);
        this.keys = defs.map(d => new PianoKey(d.note, d.keyDef.rect));
    }
}

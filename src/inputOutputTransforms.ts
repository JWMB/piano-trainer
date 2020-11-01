import { Message, NoteMessage } from "./midi";
import { EventTarget, MidiMessageEvent } from "./event";

export interface NoteInfo {
    midiNote?: number;
    velocity?: number;
    mode?: "down" | "up";
}

export class DefaultNoteInfo implements NoteInfo {
    midiNote: number;
    velocity: number;
    mode: "down" | "up";
    constructor(note: NoteInfo) {
        this.midiNote = note.midiNote;
        this.velocity = note.velocity | 1;
        this.mode = note.mode == null ? "down" : note.mode;
    }
    static copyWithMod(org: NoteInfo, mod: NoteInfo) {
        const copy: NoteInfo = {};
        Object.keys(org).forEach(k => copy[k] = org[k]);
        Object.keys(mod).forEach(k => copy[k] = mod[k]);
        return copy;
    }
}

function shallowCopy<T>(org: T, mod: T) {
    const copy: T = <T>{};
    Object.keys(org).forEach(k => copy[k] = org[k]);
    Object.keys(mod).forEach(k => copy[k] = mod[k]);
    return copy;
}

export interface InputOutputTransform {
    // onIn(note: NoteInfo);
    onIn(msg: Message);
    outEvent: EventTarget<MidiMessageEvent>;
}

export class Chordiator implements InputOutputTransform {
    outEvent: EventTarget<MidiMessageEvent>;
    constructor() {
        this.outEvent = new EventTarget<MidiMessageEvent>();
    }
    onIn(msg: Message) {
        if (!(msg instanceof NoteMessage)) return;
        const intervals = [0,2,4,5,7,9,11];
        intervals.forEach(v => intervals.push(v + 12));
        const note = msg.getPitch().getMidiNote();
        const noteX = note % 12;
        const whereInScale = intervals.indexOf(noteX);

        if (whereInScale >= 0) {
            const noteIntervals = [0, 2, 4].map(offset => intervals[(whereInScale + offset) % intervals.length]);
            const notes = noteIntervals.map(n => n + note - noteIntervals[0]);
            //shallowCopy(msg, { pitch: new Pitch() })
            notes.forEach(n => this.outEvent.fire(<MidiMessageEvent>{ 
                type: "note", 
                message: <Message>msg, // TODO: DefaultNoteInfo.copyWithMod(note, { midiNote: n, velocity: msg.getVelocity() / 127 * 0.6 }),
                source: this }));
        } else {
            this.outEvent.fire(<MidiMessageEvent>{ type: "note", message: <Message>msg, source: this });
        }
    }
}

export class Arpeggiator implements InputOutputTransform {
    outEvent: EventTarget<MidiMessageEvent>;
    constructor() {
        this.outEvent = new EventTarget<MidiMessageEvent>();
    }
    onIn(msg: Message) {
        if (!(msg instanceof NoteMessage)) return;
        this.outEvent.fire(<MidiMessageEvent>{ type: "note", message: <Message>msg, source: this });
        setTimeout(() => this.outEvent.fire(<MidiMessageEvent>{
            type: "note",
            message: <Message>msg, // TODO: DefaultNoteInfo.copyWithMod(note, { velocity: note.velocity * 0.3 }),
            source: this })
        , 500);
    }
}
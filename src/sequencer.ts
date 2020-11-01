import { Channel, Message, NoteMessage, NoteOffMessage, NoteOnMessage, OutputDevice, Pitch, TempoMessage } from "./midi";
import { Chords, Notes } from "./tonality";
import { AudioContextProxy } from "./voice";

export class RandomFromChord {
    previous: number[] = [];

    getNext(notes: number[]) {
        // TODO: We should know last and next chord, some notes are more probable 

        // TODO: different probability distribution depending on previous distance
        // Seldom same note or note far away
        if (this.previous.length > 0) {
            const last = this.previous[this.previous.length - 1];
            const offsetsFromLast = notes.map(n => n - last);
            if (this.previous.length > 1) {
                // slightly more probable to continue in same direction (?)
                const lastDiff = last - this.previous[this.previous.length - 2];
                const direction = lastDiff > 0 ? 1 : (lastDiff < 0 ? -1 : 0);

                // TODO: windowing function?
                const absDist = this.previous.slice(this.previous.length - 2, this.previous.length).reduce((p, v) => Math.abs(p - v), 0);
                const avgDist = absDist / this.previous.length;
            }
        }
        const index = Math.min(Math.floor(Math.random() * notes.length), notes.length - 1);
        const note = notes[index];
        this.previous.push(note);
        return note;
    }
    static generate(chords: number[][], numPerChord: number = 4) {
        const gen = new RandomFromChord();
        const all = chords.map(chord => {
            const notes: number[] = [];
            for (let i = 0; i < numPerChord; i++) {
                notes.push(gen.getNext(chord));
            }
            return notes;
        });
        return flatten(all);
    }
}

export function flatten<T>(arr: T[][], depth: number = 1): T[] { 
    if (depth == 0) return <T[]><any>arr;
    return flatten([].concat.apply([], arr), depth - 1);
 }

export interface TimeSignature {
    upper: number;
    lower: number;
}
export class BarBeatTime {
    bar: number;
    barDecimal: number;
    beat: number;
    beatDecimal: number;
    bpm: number;

    seconds: number;
    signature: TimeSignature;
    static fromSeconds(seconds: number, bpm: number, signature: TimeSignature) {
        const result = new BarBeatTime();
        result.seconds = seconds;

        result.signature = signature;
        result.bpm = bpm;

        const secsPerBeat = 60 / bpm;
        const secsPerBar = secsPerBeat * signature.upper / signature.lower * 4;

        result.barDecimal = seconds / secsPerBar + 1;
        result.bar = Math.floor(result.barDecimal);
        result.beatDecimal = (result.barDecimal - result.bar) * signature.upper + 1
        result.beat = Math.floor(result.beatDecimal);

        return result;
    }
    static fromBarBeat(barDecimal: number, beatDecimal: number, bpm: number, signature: TimeSignature) {
        const result = new BarBeatTime();
        result.barDecimal = barDecimal;
        result.bar = Math.floor(result.barDecimal);
        result.beatDecimal = beatDecimal;
        result.beat = Math.floor(result.beatDecimal);

        result.signature = signature;
        result.bpm = bpm;

        const secsPerBeat = 60 / bpm;
        const secsPerBar = secsPerBeat * signature.upper / signature.lower * 4;

        result.seconds = secsPerBar * (barDecimal - 1) + secsPerBeat * (beatDecimal - 1);
        return result;
    }
}

export class Sequencer {
    static createSequence(playList: string[]): NoteMessage[] {
        const tmp = playList.map(c => c.length === 0 ? [] 
            : c === "-" ? null 
                : (c.toLowerCase() === c) ? [Notes.getNoteIndex(c, true)]
                    : Chords.getNotes(c));

        if (tmp[tmp.length - 1] !== []) {
            tmp.push([]);
        }
        let allNotes: NoteMessage[] = [];
        let lastNotes: number[] = null; 
        for (let i = 0; i < tmp.length; i++) {
            const notes = tmp[i];
            if (notes == null) { continue; }
            if (!!lastNotes) {
                allNotes = allNotes.concat(lastNotes.map(n => new NoteOffMessage(null, null, new Pitch(n), 127, i)));
            }
            allNotes = allNotes.concat(notes.map(n => new NoteOnMessage(null, null, new Pitch(n), 127, i)));
            lastNotes = notes;
        }
        return allNotes;
    }

    static prepareNotes(notes: NoteMessage[], tempo: number = 120, device: OutputDevice, channel: Channel = null, velocity: number = 1): NoteMessage[] {
        const msPerBeat = 1000 * 60 / tempo;
        notes.forEach(n => { 
            (<any>n).device = device;
            (<any>n).channel = channel;
            (<any>n).velocity = velocity * 127;
            (<any>n).time = n.getTime() * msPerBeat;
        })
        return notes;
    }

    private messagesSorted: Message[] = [];
    private currentTimeMs: number;

    getCurrentTimeMs() { return this.currentTimeMs; }

    getCurrentBeat() { return this.getBeat(this.currentTimeMs); }
    getLastEventBeat() { return this.getBeat(this.messagesSorted[this.messagesSorted.length - 1].getTime()); }
    private getBeat(milliseconds: number) {
        //TODO: not consts! Also may change over time...
        const signature: TimeSignature = { upper: 4, lower: 4 };
        return BarBeatTime.fromSeconds(milliseconds / 1000, this.bpm, signature);
    }
    // private currentTempo: number = 120;

    getMessagesBetween(startTimeInclusive: number, endTimeExclusive: number, startArrayIndex: number = 0) {
        const messages: Message[] = [];
        let lastIndex = startArrayIndex;
        for (let i = startArrayIndex; i < this.messagesSorted.length; i++) {
            const msg = this.messagesSorted[i];
            const time = msg.getTime();
            if (time >= startTimeInclusive && time < endTimeExclusive) {
                messages.push(msg);
                if (i === this.messagesSorted.length - 1) {
                    lastIndex = i;
                    break;
                }
            } else {
                lastIndex = i - 1;
                break;
            }
        }
        return { messages: messages, lastMessageIndex: lastIndex };
    }

    beatCallback: (time: BarBeatTime) => void;

    setMessages(messages: Message[] | Message[][]) {
        const messagesFlattened = Array.isArray(messages[0]) ? flatten(<Message[][]>messages) : <Message[]>messages;
        this.messagesSorted = messagesFlattened.sort((a, b) => a.getTime() - b.getTime());
    }
    getMessages() { return [].concat(this.messagesSorted); }
    setMaxLength(seconds: number) {
        const maxMs = seconds * 1000;
        for (let i = this.messagesSorted.length - 1; i >= 0; i--) {
            const msg = this.messagesSorted[i];
            if (msg.getTime() > maxMs) {
                if (msg instanceof NoteOffMessage) {
                    msg.setTime(maxMs - 1);
                } else {
                    this.messagesSorted.splice(i, 1);
                }
            } else {
                break;
            }
        }
    }

    private isPlaying: boolean = false;
    getIsPlaying() { return this.isPlaying; }
    private cancelling: boolean = false;
    stop() {
        this.cancelling = true;
    }
    play(messages?: Message[] | Message[][] | null): Promise<void> {
        if (!!messages) { this.setMessages(messages); }
        return new Promise<void>((res, rej) => {
            if (this.isPlaying) { rej(); return; }
            this.playPromise(() => res());
         });
    }
    private bpm: number = 120;
    private playPromise(callbackFinished: Function) {
        this.isPlaying = true;
        if (this.messagesSorted.length === 0) { 
            callbackFinished();
            return;
        }

        for (let i = 0; i < this.messagesSorted.length; i++) {
            const msg = this.messagesSorted[i];
            if (msg.getTime() > 0) { break; }
            if (msg instanceof TempoMessage) {
                this.bpm = msg.getBpm();
            }
        }
        this.cancelling = false;
        const startTime = Date.now().valueOf();
        let lastBarBeat:BarBeatTime = null;
        let lastTime = startTime;
        let lastIndex = -1;
        const hInterval = setInterval(() => {
            if (this.cancelling) {
                clearInterval(hInterval);
                this.isPlaying = false;
                this.cancelling = false;
                return;
            }
            const timeNow = Date.now().valueOf();
            this.currentTimeMs = timeNow - startTime;
            const bb = this.getCurrentBeat();
            if (!lastBarBeat || lastBarBeat.bar != bb.bar || lastBarBeat.beat != bb.beat) {
                if (!!this.beatCallback) { this.beatCallback(bb); }
                lastBarBeat = bb;
            }

            const msgsInfo = this.getMessagesBetween(lastTime - startTime, timeNow - startTime, lastIndex + 1);
            if (msgsInfo.messages.length) {
                // const noteMsgs = msgsInfo.messages.filter(m => m instanceof NoteMessage);
                // if (noteMsgs.length) {
                //     console.log(noteMsgs.map(m => `${(<NoteMessage>m).getPitch().getMidiNote()} ${m instanceof NoteOnMessage ? "on" : "off"}`).join(","))
                // }

                const highPrioMessages = msgsInfo.messages.filter(m => m instanceof NoteOffMessage);
                highPrioMessages.forEach(m => m.sendNow());

                const remainingMessages = msgsInfo.messages.filter(m => highPrioMessages.indexOf(m) < 0);
                remainingMessages.forEach(m => m.sendNow());

                lastIndex = msgsInfo.lastMessageIndex;
                // console.log(lastIndex, this.messagesSorted.length, timeNow - startTime, Math.max.apply(null, msgsInfo.messages.map(m => m.getTime())));
                if (lastIndex === this.messagesSorted.length - 1) {
                    clearInterval(hInterval);
                    this.isPlaying = false;
                    callbackFinished();
                }
            }
            lastTime = timeNow;
        }, 5);
    }
}

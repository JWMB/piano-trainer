import type { MidiMessageEvent } from "../event";
import { AllSoundOffMessage, Channel, Message, MessageDispatcher, NoteOnMessage, OutputDevice, TempoMessage } from "../midi";
import { BarBeatTime, flatten, Sequencer } from "../sequencer";
import { Chords, Notes } from "../tonality";
import type { GenerateMelodyDefinition, FixedMelodyDefinition, LevelDefinition, LevelDefinitionBase } from "./levelDefinition";

interface NoteTrack {
    notes: string[];
    name?: string;
    channel: number;
    volume: number;
}
interface NoteAndTime {
    note: number;
    time: number;
}
interface NoteAssociation {
    associatedIndex: number;
    diff: NoteAndTime;
    scored: boolean;
}
interface NoteWithAssociations {
    index: number;
    timedNote: NoteAndTime;
    associations: NoteAssociation[];
}

export interface LevelGenerator {
    generate(levelDef: LevelDefinitionBase): { tracks: NoteTrack[], definition: LevelDefinitionBase };
}

export const levels: LevelDefinition[] = [
    { tempo: 80, chords: "Cmaj7add2", melody: <GenerateMelodyDefinition>{ startNotes: [0, 4], numNotes: 2, maxDistance: 5, showNotes: true } },
    { tempo: 80, chords: "Am7add2", melody: <GenerateMelodyDefinition>{ startNotes: [0, 3], numNotes: 2, maxDistance: 5, showNotes: true } },
    { tempo: 120, chords: "Cadd2 Am7 Dm7 Gadd2", melody: <GenerateMelodyDefinition>{ startNotes: [0], numNotes: 16, notesPerChord:4, maxDistance: 5, showNotes: true } },
    { tempo: 80,
        chords: [
            "C - - - C - - -",
            "G - - - C - - -",
            "C - - - C - - -",
            "F - G - C - - -",
        ].join(" "),
        melody: <FixedMelodyDefinition>{ notes: [
            "g g e e g g e -",
            "f f d - g g e -",
            "g g e e g g e -",
            "f f d d c -",
        ].join(" ")}}
  ];

export class LevelGeneratorSimple implements LevelGenerator {
    generateChords(chordsDef: string, repeatEach: number, take: number = Number.MAX_VALUE) {
        const chords = chordsDef.split(' ').map(c => c.split('|')).slice(0, take);
        const selectedChords = chords.map(c => LevelBase.getRandom(c));

        const chordTrack: NoteTrack = {
            name: "chords",
            notes: flatten(selectedChords.map(c => [c].concat(new Array(repeatEach - 1).fill("-")))),
            channel: 2,
            volume: 0.1
         };

        return chordTrack;
    }
    static getLatestBefore(notes: string[], index: number) {
        for (let i = index; i >= 0; i--) {
            if (["-", null].indexOf(notes[i]) < 0) return notes[i];
        }
    }
    generateMelody(melody: GenerateMelodyDefinition, chordTrack: NoteTrack) {
        const melodyTrack: NoteTrack = { name: "melody", notes: [], channel: 1, volume: 1 };
        for (let i = 0; i < melody.numNotes; i++) {
            const currentChord = LevelGeneratorSimple.getLatestBefore(chordTrack.notes, i);

            if (i < melody.numNotes) {
                const chordNotes = Chords.getNotes(currentChord);
                let notes = i === 0 && (melody.startNotes || []).length ? melody.startNotes.map(n => n + chordNotes[0]) : chordNotes;
                const lastNote = melodyTrack.notes.length === 0 ? null : Notes.getNoteIndex(melodyTrack.notes[melodyTrack.notes.length - 1], true);
                if (lastNote != null) {
                    if (melody.maxDistance != null) {
                        notes = notes.filter(n => Math.abs((lastNote - n) % 12) <= melody.maxDistance);
                    }
                    if (notes.indexOf(lastNote) >= 0 && notes.length > 1) {
                        notes = notes.filter(n => n !== lastNote);
                    }
                }
                const note = LevelBase.getRandom(notes);
                melodyTrack.notes = melodyTrack.notes.concat([Notes.getNoteNames(note, true)[0]]);
            }
        }
        return melodyTrack;
    }
    generateMetronome(chordTrack: NoteTrack) {
        return <NoteTrack>{ 
            name: "metronome", 
            notes: chordTrack.notes.map((n, i) => Notes.getNoteNames(Chords.getNotes(LevelGeneratorSimple.getLatestBefore(chordTrack.notes, i))[0] - 12 * 1, true)[0]), 
            channel: 3,
            volume: 0.7
        };
    }
    generate(levelDef: LevelDefinition) {
        let chordTrack: NoteTrack = null;
        let tracks: NoteTrack[] = [];

        if ((<any>levelDef.melody).notes) {
            chordTrack = this.generateChords(levelDef.chords, 1);
            const melody = <FixedMelodyDefinition>levelDef.melody;
            tracks.push({ name: "melody", notes: melody.notes.split(" "), channel: 1, volume: 1 });
            // chordTrack.notes.splice(0, chordTrack.notes.length);
        } else {
            const melody = <GenerateMelodyDefinition>levelDef.melody;
            const notesPerChord = melody.notesPerChord || 4;
            chordTrack = this.generateChords(levelDef.chords, notesPerChord);
            tracks.push(this.generateMelody(melody, chordTrack));
        }

        tracks = tracks.concat(chordTrack).concat([this.generateMetronome(chordTrack)]);

        //Insert lead-in
        const leadInBeats = 4;
        const useLastBeats = true;
        if (useLastBeats) {
            const maxLength: number = Math.max.apply(null, tracks.map(t => t.notes.length));
            tracks.forEach(t => {
                let l = t.notes.slice(maxLength - leadInBeats);
                l = l.concat(Array(leadInBeats - l.length).fill(""))
                t.notes = l.concat(t.notes);
            });
        } else {
        }

        return { tracks: tracks, definition: levelDef };
    }
}

export class LevelBase {
    static getRandom<T>(arr: T[]) {
        const index = Math.min(Math.floor(arr.length * Math.random()), arr.length - 1);
        return arr[index];
    }

    private cpuNotes: NoteWithAssociations[];
    private userNotes: NoteWithAssociations[];

    private sequencer: Sequencer;

    beatCallback: (time: BarBeatTime) => void;
    
    private isPlayersTurn: boolean = false;
    private messageTracks: { name: string, messages: Message[] }[];

    private prepareSequencer(output: OutputDevice, def: LevelDefinition, generator: LevelGenerator ) {
        def = {...{ tempo: 120, signature: { upper: 4, lower: 4 }}, ...def };
        const generated = generator.generate(def);
        // console.log(generated);

        this.messageTracks = generated.tracks.map(track => ({ 
            name: track.name, 
            messages: Sequencer.prepareNotes(Sequencer.createSequence(track.notes), def.tempo, output, new Channel(track.channel), track.volume)}));

        const sqMelody = this.messageTracks.find(x => x.name === "melody").messages;
        this.cpuNotes = sqMelody.filter(m => m instanceof NoteOnMessage)
            .map((m, i) => ({ timedNote:{ time: m.getTime(), note: (<NoteOnMessage>m).getPitch().getMidiNote() }, associations: [], index: i }));

        this.sequencer = new Sequencer();
        this.sequencer.beatCallback = this.beatCallback;
        const allMessages = (<Message[][]>this.messageTracks.map(x => x.messages)).concat([new TempoMessage(def.tempo, 0)]);
        this.sequencer.setMessages(allMessages);
        // this.sequencer.getMessages()
        // this.sequencer.setMaxLength(BarBeatTime.fromBarBeat(2, 1, def.tempo, def.signature).seconds - 0.001);
    }

    private score: number;
    private changeScore(points: number) {
        this.score += points;
        const el = document.getElementById("score"); // TODO: event or callback
        if (el) el.innerText = this.score.toString();
    }
    getScore() { return this.score; }

    private output: OutputDevice;
    async start(output: OutputDevice, input: MessageDispatcher, def: LevelDefinition, generator: LevelGenerator, repeatWithPlayer: boolean = false) {
        this.output = output; //So we can stop notes outside of this promise
        this.prepareSequencer(output, def, generator);
        this.score = 0;

        this.output.onMessage
        this.isPlayersTurn = false;
        this.userNotes = [];
        input.outEvent.addListener("note", this.boundOnNoteEvent); // allow input before player's turn, might start playing a little too early

        if (!repeatWithPlayer) this.isPlayersTurn = true;
        await this.sequencer.play();

        if (repeatWithPlayer) {
            this.isPlayersTurn = true;
            this.sequencer.setMessages(this.messageTracks.filter(x => x.name !== "melody").map(x => x.messages));
            await this.sequencer.play();
        }

        this.isPlayersTurn = false;
        input.outEvent.removeListener("note", this.boundOnNoteEvent);
    }

    getIsPlaying() {
        return this.sequencer?.getIsPlaying() === true;
    }

    stop() {
        this.sequencer.stop();
        const stopMsgs = this.output.getChannels().map((c, i) => new AllSoundOffMessage(this.output, new Channel(i + 1), 0));
        stopMsgs.forEach(m => this.output.onMessage(m));
    }

    private boundOnNoteEvent = this.onNoteEvent.bind(this);
    onNoteEvent(e: MidiMessageEvent) {
        if (!(e.message instanceof NoteOnMessage)) return;

        const time = this.sequencer.getCurrentBeat();
        if (!this.isPlayersTurn) {
            if (time.bar === this.sequencer.getLastEventBeat().bar && time.beat === time.signature.upper) {
                // console.log("Right before!");
            } else {
                return;
            }
        }
        const timedNote = { note: e.message.getPitch().getMidiNote(), time: time.seconds * 1000};
        const input = <NoteWithAssociations>{ timedNote: timedNote, associations: [], index: this.userNotes.length };
        this.userNotes.push(input);

        // TODO: Slips on key scenario: close in time and note but correct may come shortly after
        // Set close-note as contender, but check a little later if we got a better one?
        function isScored(note: NoteWithAssociations) {
            return note.associations.filter(o => o.scored).length > 0;
        }

        const closeInTime = this.cpuNotes.filter(n => Math.abs(n.timedNote.time - timedNote.time) < 300 && !isScored(n));

        // If we meet criteria X we give points immediately and stop looking
        function reg(note: NoteWithAssociations, contender: NoteWithAssociations, scored: boolean) {
            const diff = { time: note.timedNote.time - contender.timedNote.time, note: note.timedNote.note - contender.timedNote.note };
            input.associations.push({ associatedIndex: contender.index, diff: diff, scored: scored });
            contender.associations.push({ associatedIndex: note.index, diff: diff, scored: scored });
        }

        const perfectMatch = closeInTime.filter(o => o.timedNote.note === timedNote.note && Math.abs(o.timedNote.time - timedNote.time) < 100);
        function getRanking(a: NoteWithAssociations, b: NoteWithAssociations) {
            return Math.pow(Math.abs(a.timedNote.note - b.timedNote.note), 2)
                + Math.pow(Math.abs(a.timedNote.time - b.timedNote.time) / 1000, 2);
        }
        // Ranking:
        const ranked = closeInTime.map(o => ({rankScore: getRanking(input, o), src: o}))
            .sort((a, b) => a.rankScore - b.rankScore);

        if (ranked.length) {
            const best = ranked[0];
            reg(input, best.src, true);

            let points = 0;
            if (best.rankScore < 0.01) {
                points = 100;
            } else if (best.rankScore < 0.05) {
                points = 50;
            } else if (best.rankScore < 0.09) {
                points = 10;
            }
            if (points > 0) {
                this.changeScore(points);
            }
            // console.log(points, ranked.map(o => `${o.rankScore} ${o.src.timedNote.note}`));
        }
        // If good contender is in future, we wait for that to pass (and then some)
        // If in past

        // which is best of 1) correct note but large time diff 2) slightly off note but low time diff?

        // closest.cpu.associations.push({ associatedIndex: len - 1, diff: { note: 0, time: closest.diff } });
    }
}
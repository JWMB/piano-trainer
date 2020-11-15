import { PianoKeyboard } from './piano';
import { PianoKeyboardGUIHandler } from './gui/pianoGui';
import { flatten, Sequencer } from './sequencer';
import { Channel, InputDevice, MessageDispatcher, NoteMessage, OutputDevice } from './midi';
import { Notes } from './tonality';
import { Noise, PianoPatch, StringsPatch, Synth, SynthPatch } from './synth';
import { LevelBase, LevelGeneratorSimple, levels } from "./levels/levels";
import { AudioContextProxy } from './voice';

export class App {
    ctx: BaseAudioContext;
    pianoInput: MessageDispatcher = null;
    outputDevice: OutputDevice;
    inputDevice: InputDevice;
    cpuPiano: PianoKeyboard;
    userPiano: PianoKeyboard;
    mixerNode: AudioNode;

    async init() {
        this.ctx = AudioContextProxy.get();

        const convolver = this.ctx.createConvolver();
        convolver.buffer = await Noise.createImpulseResponse(this.ctx.sampleRate, 1, 1.8);

        // Mixer node:
        this.mixerNode = this.ctx.createGain();
        this.mixerNode.connect(this.ctx.destination);
        this.mixerNode.connect(convolver);
        const reverbAmountNode = this.ctx.createGain();
        reverbAmountNode.gain.value = 0.2;
        convolver.connect(reverbAmountNode);
        reverbAmountNode.connect(this.ctx.destination);


        this.cpuPiano = new PianoKeyboard(this.createSynth(new PianoPatch(), 0.6));
        const strings = this.createSynth(new StringsPatch());
        const metronome = this.createSynth(new PianoPatch({ attack: 0, decay: 50, sustain: 0 }));
        this.userPiano = new PianoKeyboard(this.createSynth(new PianoPatch(), 0.6));
      
        this.inputDevice = new InputDevice(new Map([["*", 4]]));
        await this.inputDevice.tryAttachMidiInput();

        this.outputDevice = new OutputDevice([this.cpuPiano, strings, metronome, this.userPiano]);

        this.inputDevice.outEvent.addListener("note", e => this.outputDevice.onMessage(e.message));
    }

    createSynth(patch: SynthPatch, vol: number = 1) {
        return new Synth(patch, vol, this.ctx, this.mixerNode);
    }

    createPianoInput(piano: PianoKeyboard, parentElement: HTMLElement) {
        piano.createKeys(Notes.defaultC4 - 12, Notes.defaultC4 + 24, { x: 70, y: 200 });
        if (parentElement.children.length > 0) {
            return null;
        }
        const pianoInput = new PianoKeyboardGUIHandler();
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

        pianoInput.createGfx(svg, piano.getKeys());

        svg.setAttribute("width", `${1500}`);
        svg.setAttribute("height", `${300}`);
        parentElement.appendChild(svg);

        return pianoInput;
    }

    createCpuPianoKeyboard(parentElement: HTMLElement) {
        this.createPianoInput(this.cpuPiano, parentElement);
    }
    createUserPianoKeyboard(parentElement: HTMLElement) {
        this.pianoInput = this.createPianoInput(this.userPiano, parentElement);
        this.pianoInput.outEvent.addListener("note", e => this.inputDevice.onMessage(e.message));
        // this.userPiano.connectInput(this.pianoInput);
    }

    private level: LevelBase;
    async presentProblem() {
        // what type of interaction do we want..?
        // * a song divided into segments, play one segment, user repeats until correct (go back to segments with low accuracy)
        // * auto-generated melody, different difficulty (speed, syncopes, num nutes, interval sizes)
        // * "Jam" - some predefined base, but is modified realtime depending on input

        // generate initial chords + melody etc
        // play mode
        //     play along
        //     "Jam": playing modifies chords + melody
        //     listen + repeat
        if (this.level?.getIsPlaying() === true) { return; }

        const level = new LevelBase();
        this.level = level;
        const bearIndicator = document.getElementById("beat");
        level.beatCallback = b => bearIndicator.innerText = `${b.beat} / ${b.bar}`;
        // for (let i = 0; i < 2; i++) {
        //   for (let levelIndex = 0; levelIndex < 2; levelIndex++) {
        //     await level.start(device, pianoInput, levels[levelIndex], new LevelGeneratorSimple());
        //   }
        // }


        await level.start(this.outputDevice, this.inputDevice, levels[3], new LevelGeneratorSimple())
        // document.getElementById("yourTurn").style.visibility = "visible";
    }

    stop() {
        this.level?.stop();
    }

    handleClick() {
        const sq = new Sequencer();
        const tempo = 120;

        const sequences: NoteMessage[][] = [ ];
        {
            const notes = "c d e g a g e d f a f a g e c".split(' '); //.map(n => n === "" ? null : Notes.getNoteIndex(n, true));
            sequences.push(Sequencer.prepareNotes(Sequencer.createSequence(notes), tempo, this.outputDevice, new Channel(1), 0.5));
        }
        {
            const chords = "C - Cadd2 - F - F7 - C".split(' ');
            sequences.push(Sequencer.prepareNotes(Sequencer.createSequence(chords), tempo / 2, this.outputDevice, new Channel(2), 0.1));
        }

        // const chords = "C F G Am F G C".split(' ');
        // const chords = ['F', 'Em7', 'A7', 'Dm', 'Dm7', 'Bb', 'C7', 'F', 'C', 'Dm7'];
        sq.play(flatten(sequences));
        // sq.play(Sequencer.createSequence(RandomFromChord.generate(sequence, 4), 240, new MyOutputDevice()));
    }
}
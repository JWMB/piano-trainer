import type { InputOutputTransform } from "./inputOutputTransforms";
import { AllSoundOffMessage, Message, MessageReceiver, NoteOffMessage, NoteOnMessage } from "./midi";
import { EqualTemperament, NoteHzConvert } from "./tonality";
import { AudioContextProxy, EnvelopeADSR, SimpleVoice, Voice } from "./voice";

// https://hacks.mozilla.org/2020/05/high-performance-web-audio-with-audioworklet-in-firefox/
export class FrequencyComponents {
    real: Float32Array;
    imag: Float32Array;
    constructor(numFreqs: number) {
        this.real = new Float32Array(numFreqs + 1);
        this.imag = new Float32Array(numFreqs + 1);

        this.real[0] = 0;
        this.real[0] = 0;
    }
    createPeriodicWave() {
        return AudioContextProxy.get().createPeriodicWave(this.real, this.imag);
    }
    static sinePreset() {
        const numFreqs = 1;
        const result = new FrequencyComponents(numFreqs);
        result.imag[1] = 1;
        result.real[1] = 1;
        return result;
    }

    static sawPreset(numCoeffs: number = 10) {
        const result = new FrequencyComponents(numCoeffs);
        for (let n = 1; n < numCoeffs; n++) {
            result.imag[n] = 1 / (n * Math.PI);
        }
        return result;
    }

    static trianglePreset(numCoeffs: number = 10) {
        const result = new FrequencyComponents(numCoeffs);
        for (let n = 1; n < numCoeffs; n++) {
            if (n % 2 === 1) {
                result.imag[n] = 1 / (n * n);
                result.real[n] = n % 2 === 1 ? 0.5 : 0;
            }
        }
        return result;
    }

    static squarePreset(numCoeffs: number = 30) {
        const result = new FrequencyComponents(numCoeffs);
        for (let n = 1; n < numCoeffs; n++) {
            if (n % 2 === 1) {
                result.imag[n] = 1 / n;
            }
        }
        return result;
    }
}

export class Noise {
    static createSource(ctx: BaseAudioContext = null, noiseLength: number = 4096) {
        ctx = ctx || AudioContextProxy.get();
        const bufferSize = ctx.sampleRate * noiseLength;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0); // get data

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        let noise = ctx.createBufferSource();
        noise.buffer = buffer;
        return noise;
    }

    static setup(noiseSrc: AudioBufferSourceNode, ctx: BaseAudioContext, secs: number = 1) {
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        noiseSrc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        filter.type = "lowpass"; // highpass lowpass

        const curveFunc = val => Math.pow((1.0 - val)/2, 5); // val == 0 ? 1 : Math.pow((1.0 - val)/2, 5);
        const curve = Noise.createCurve(100, curveFunc);

        return { 
            filter: filter, 
            start: () => {
                noiseSrc.start();
                gain.gain.value = 1;
                gain.gain.setValueCurveAtTime(curve, ctx.currentTime, secs);

                // filter.frequency.value = 1000;
                // filter.Q.value = 1;
                //filter.frequency.linearRampToValueAtTime(ctx.sampleRate / 2, ctx.currentTime + secs);
            } 
        };
    }
    static createCurve(numVals: number, func: (val: number) => number) {
        return Array(numVals).fill(0).map((v, i) => func(i / numVals));
    }
    static async createImpulseResponse(sampleRate: number, numChannels: number, length: number) {
        const ctx = new OfflineAudioContext(numChannels, sampleRate * length, sampleRate);
        const src = Noise.createSource(ctx);
        Noise.setup(src, ctx, length).start();

        const buffer = await ctx.startRendering();
        return buffer;
    }
}

// TODO: guitar etc https://github.com/mrahtz/javascript-karplus-strong

export interface SynthPatch {
    createVoice(ctx: BaseAudioContext, destination?: AudioNode): Voice;
}
export class PianoPatch implements SynthPatch {
    private adsr: EnvelopeADSR;
    constructor(adsr: EnvelopeADSR = null) {
        this.adsr = adsr;
    }
    createVoice(ctx: BaseAudioContext, destination?: AudioNode) {
        return new SimpleVoice(ctx, [{ configOsc: osc => osc.setPeriodicWave(FrequencyComponents.sawPreset().createPeriodicWave()) }],
        this.adsr || { attack: 10, decay: 2000 },
        { attack: 0, decay: 500, sustain: 0.5 }, destination);
    }
}

export class StringsPatch implements SynthPatch {
    createVoice(ctx: BaseAudioContext, destination?: AudioNode) {
        const fc = FrequencyComponents.sawPreset(); // squarePreset trianglePreset sawPreset
        const wave = fc.createPeriodicWave();
        return new SimpleVoice(ctx, [
            { configOsc: osc => osc.type = "sawtooth", volume: 0.1 },
            { configOsc: osc => osc.type = "sawtooth", volume: 0.1, detune: 5 },
            { configOsc:  osc => osc.setPeriodicWave(wave), octave: 1 }
        ], { attack: 700, decay: 1000}, null, destination);
    }
}


export class Synth implements MessageReceiver {
    maxVoices: number = 6;
    private voices: Voice[] = [];
    private ioXforms: InputOutputTransform[] = [];
    private patch: SynthPatch;
    private noteConvert: NoteHzConvert;
    private volume: number;
    private ctx: BaseAudioContext;
    private destination: AudioNode; //AudioDestinationNode;

    constructor(patch: SynthPatch, volume: number = 1, ctx: BaseAudioContext = null, destination: AudioNode = null) {
        this.patch = patch;
        this.noteConvert = new NoteHzConvert(440, new EqualTemperament());
        this.volume = volume;
        this.ctx = ctx || AudioContextProxy.get();
        this.destination = destination || this.ctx.destination;
        // const arp = new Arpeggiator();
        // arp.noteOutEvent.addListener("note", this.onNoteEvent.bind(this))
        // this.ioXforms.push(arp);

        // const chord = new Chordiator();
        // chord.noteOutEvent.addListener("note", this.onNoteEvent.bind(this))
        // this.ioXforms.push(chord);
    }

    onMessage(msg: Message) {
        if (this.ioXforms.length > 0) {
            this.ioXforms[0].onIn(msg);
        } else {
            if (msg instanceof NoteOnMessage) {
                this.startVoice(msg.getPitch().getMidiNote(), msg.getVelocity() / 127);
            } else if (msg instanceof NoteOffMessage) {
                this.releaseVoice(msg.getPitch().getMidiNote());
            } else if (msg instanceof AllSoundOffMessage) {
                this.voices.forEach(v => v.stop());
            }
        }
    }

    getOrCreateVoice(): Voice | null {
        const freeVoices = this.voices.filter(v => !v.isPlaying());
        if (freeVoices.length) {
            return freeVoices[0];
        }
        if (this.voices.length >= this.maxVoices) {
            console.log("exceeded max voices");
            const earliest = this.voices[0]; //TODO: find actual earliest
            earliest.stop();
            return earliest;
        }
        const newVoice = this.patch.createVoice(this.ctx, this.destination);
        this.voices.push(newVoice);
        return newVoice;
    }

    startVoice(note: number, volume: number) {
        this.stopVoice(note);
        const voice = this.getOrCreateVoice();
        if (!!voice) {
            // console.log("starting", note, volume, this.voices.indexOf(voice));
            voice.start(this.noteConvert.getHz(note), volume * this.volume);
        } else {
            console.log("couldn't start", note);
        }
    }
    private getVoicesOfNote(note: number) {
        const hz = this.noteConvert.getHz(note);
        return this.voices.filter(v => Math.abs(v.getOscFrequency() - hz) < 0.1);
    }
    releaseVoice(note: number) {
        const found = this.getVoicesOfNote(note);
        // if (found.length) console.log("releasing", note);
        found.forEach(v => v.release());
    }
    stopVoice(note: number) {
        const found = this.getVoicesOfNote(note);
        // if (found.length) console.log("stopping", note);
        found.forEach(v => v.stop());
    }
}

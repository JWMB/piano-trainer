export class AudioContextProxy {
    private static ctx: AudioContext;
    static get() {
        if (!AudioContextProxy.ctx) {
            AudioContextProxy.ctx = new window.AudioContext();
        }
        return AudioContextProxy.ctx;
    }
}

export interface EnvelopeADSR {
    startValue?: number;
    attack?: number;
    attackValue?: number;
    decay?: number;
    sustain?: number;
    release?: number;
}
export const DefaultEnvelope = {
    startValue: 0,
    attack: 3,
    attackValue: 1,
    decay: 500,
    sustain: 0.3,
    release: 200
}

//export type Envelope = EnvelopeADSR | TimeValue[];
export class Envelope {
    start: TimeValue[];
    end: TimeValue[];

    static get(env: EnvelopeADSR | Envelope) {
        return (<any>env)?.constructor === Envelope ? <Envelope>env : Envelope.convert(<EnvelopeADSR>env);
    }
    static convert(env: EnvelopeADSR): Envelope {
        env = { ...DefaultEnvelope, ...env };
        const result = new Envelope();
        result.start = [
            { time: 0, value: env.startValue },
            { time: env.attack, value: env.attackValue },
            { time: env.attack + env.decay, value: env.sustain },
        ];
        result.end = [
            { time: env.release, value: 0 },
        ];
        // console.log(result);
        return result;
    }
}
export interface TimeValue {
    time: number;
    value: number;
}

export interface OscillatorSetup {
    configOsc: (osc: OscillatorNode) => void;
    octave?: number;
    detune?: number;
    volume?: number;
}

class OscillatorWrapper {
    constructor(osc: OscillatorNode, config: OscillatorSetup, nextNode: AudioNode, ctx: BaseAudioContext) {
        this.osc = osc;
        config.configOsc(osc);
        osc.detune.value = config.detune;
        this.config = config;
        if (config.volume < 1) {
            const gain = ctx.createGain();
            gain.gain.value = config.volume;
            osc.connect(gain);
            this.output = gain;
        } else {
            this.output = nextNode;
        }
        osc.connect(nextNode);
    }
    dispose() {
        this.osc.stop();
        if (this.gain != null) {
            this.osc.disconnect(this.gain);
            this.gain.disconnect(this.output);
        } else {
            this.osc.disconnect(this.gain);
        }
    }
    osc: OscillatorNode;
    config: OscillatorSetup;
    gain: GainNode;
    output: AudioNode;
}

export interface Voice {
    start(freq: number, volume: number);
    stop();
    release();
    dispose();
    isPlaying(): boolean;
    getOscFrequency(): number;
}
export class SimpleVoice implements Voice {
    gain: GainNode;
    filter: BiquadFilterNode;

    private oscSetups: OscillatorSetup[];
    private oscs: OscillatorWrapper[] = [];
    private env: Envelope;
    private filterEnv: Envelope;
    private startTime: number | null = null;
    private releaseStartTime: number | null = null;
    private freq: number;
    private ctx: BaseAudioContext;
    private destination: AudioNode;

    constructor(ctx: BaseAudioContext, oscSetup: OscillatorSetup[], env: EnvelopeADSR | Envelope, filterEnv: EnvelopeADSR | Envelope | null = null, destination: AudioNode = null) {
        this.ctx = ctx; // ?? AudioContextProxy.get();
        this.destination = destination || ctx.destination;

        const defaultOscTuning = { octave: 0, detune: 0, volume: 1 };
        this.oscSetups = oscSetup.map(o => ({...defaultOscTuning, ...o}));

        const gain = ctx.createGain();
        this.gain = gain;
        this.env = Envelope.get(env);
        if (filterEnv != null) {
            this.filterEnv = Envelope.get(filterEnv);
        }

        this.filter = ctx.createBiquadFilter();
        this.filter.gain.value = 1;
        this.filter.type = "lowpass";
        if (this.filter != null) {
            gain.connect(this.filter);
            this.filter.connect(this.destination);
        } else {
            gain.connect(this.destination);
        }
    }
    getOscFrequency() {
        return this.freq;
    }

    static pluppo(param: AudioParam, env: TimeValue[], currentTime: number, convValue: (number) => number = n => n, skipFirst: boolean = false) {
        param.cancelScheduledValues(currentTime);
        if (skipFirst) {
            param.setValueAtTime(convValue(env[0].value), currentTime);
        }
        for (let i = 0; i < env.length; i++) {
            param.linearRampToValueAtTime(convValue(env[i].value), env[i].time / 1000 + currentTime);
        }
    }

    start(freq: number, volume: number = 1) {
        if (this.startTime != null) {
            this.stop();
        }
        const ctx = this.ctx; // AudioContextProxy.get();

        SimpleVoice.pluppo(this.gain.gain, this.env.start, ctx.currentTime, v => v * volume);

        this.oscs = this.oscSetups.filter(s => s.volume > 0).map(s => {
            const wrapper = new OscillatorWrapper(ctx.createOscillator(), s, this.gain, ctx);
            wrapper.osc.frequency.value = freq * Math.pow(2, s.octave);
            return wrapper;
        });

        this.startTime = Date.now().valueOf();
        this.freq = freq;

        if (this.filter != null) {
            if (this.filterEnv) {
                // this.filter.Q
                // TODO: filter should take freq as input, and value should transform to freq * Math.pow(2, value - 1)
                // SimpleVoice.pluppo(this.filter.frequency, this.filterEnv.start, ctx.currentTime);
                this.filter.frequency.setValueAtTime(freq * 2, ctx.currentTime);
                this.filter.frequency.linearRampToValueAtTime(freq, ctx.currentTime + 2);
            } else {
                this.filter.frequency.value = freq * 2;
            }
        }

        this.oscs.forEach(o => o.osc.start(0));
        // console.log("start", this.freq);
    }
    release() {
        this.releaseStartTime = Date.now().valueOf();

        SimpleVoice.pluppo(this.gain.gain, this.env.end, this.ctx.currentTime, v => v,  true);
        if (!!this.filterEnv && !!this.filter) {
            SimpleVoice.pluppo(this.filter.gain, this.filterEnv.end, this.ctx.currentTime, v => v, true);
        }
    }

    stop() {
        // console.log("stop", this.freq);
        if (this.startTime != null) {
            this.oscs.forEach(o => {
                o.dispose();
            });
            this.oscs = [];
        }
        this.startTime = null;
        this.releaseStartTime = null;
    }
    isPlaying() {
        if (this.startTime == null) return false;
        if (this.releaseStartTime != null) {
            return Date.now().valueOf() - this.releaseStartTime < this.env.end[this.env.end.length - 1].time;
        }
        const last = this.env.start[this.env.start.length - 1];
        return last.value > 0 ? true : Date.now().valueOf() - this.startTime < last.time;
    }

    dispose() {
        this.stop();
        this.gain.disconnect(this.destination);
    }

    // static createPresetWave(waveType: OscillatorType = "square", env: EnvelopeADSR, ctx: BaseAudioContext) {
    //     return new SimpleVoice([{ configOsc: osc => osc.type = waveType}], env, null, ctx);
    // }
    // static createIFFT(real: Float32Array, imag: Float32Array, env: EnvelopeADSR, ctx: BaseAudioContext) {
    //     return new SimpleVoice([{ configOsc: osc => osc.setPeriodicWave(ctx.createPeriodicWave(real, imag))}], env, null, ctx);
    // }
    // static createIFFTWave(wave: PeriodicWave, env: EnvelopeADSR, ctx: BaseAudioContext) {
    //     return new SimpleVoice([{ configOsc: osc => osc.setPeriodicWave(wave)}], env, null, ctx);
    // }

    // static fireAndForget(freq: number, voice: SimpleVoice, volume: number = 1) {
    //     voice.start(freq, volume);
    //     setTimeout(() => {
    //         voice.dispose();
	// 	}, 1000);
    // }
}
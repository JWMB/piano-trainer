export class Mixer {
    private ctx: BaseAudioContext;
    private input: AudioNode;
    private output: AudioNode;
    constructor(ctx: BaseAudioContext, output: AudioDestinationNode = null) {
        this.ctx = ctx;
        this.input = this.ctx.createGain();

        this.output = output || ctx.destination;
        this.input.connect(this.output);
    }

    getContext() { return this.ctx; }
    getInput() { return this.input; }
    getOutput() {
    }
    addReverb(buffer: AudioBuffer) {
        const convolver = this.ctx.createConvolver();
        convolver.buffer = buffer;
        this.input.disconnect();
        convolver.connect(this.output);
        this.input.connect(convolver);
    }
}
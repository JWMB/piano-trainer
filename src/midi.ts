import type { MidiMessageEvent } from "./event";
import { EventTarget } from "./event";

export abstract class Message {
    protected time: number;
    constructor(time: number = 0) {
        this.time = time;
    }
    abstract sendNow();
    abstract makeTimeShiftedCopy(delta: number): Message;
    getTime() { return this.time; }
    setTime(ms: number) { this.time = ms; }

    static parseMidiMessageData(messageData: Uint8Array): Message | null {
        const commandAndChannel = messageData[0];
        const command = Math.floor(commandAndChannel / 16);
        const channel = commandAndChannel % 16;
    
        let parsed: Message = null;
        switch (command) {
            case 8: // noteOn
            case 9: // noteOff
                const note = messageData[1];
                var velocity = (messageData.length > 2) ? messageData[2] : 0; // a velocity value might not be included with a noteOff command
                if (commandAndChannel == 144) {
                    parsed = new NoteOnMessage(null, new Channel(channel), new Pitch(note), velocity);
                } else {
                    parsed = new NoteOffMessage(null, new Channel(channel), new Pitch(note), velocity);
                }
                break;
            case 10: //key pressure
                const noteA = messageData[1];
                const press = messageData[2];
                break;
            case 11: //ctrl change
                const ctrlNum = messageData[1];
                const ctrlVal = messageData[2];
                console.log(`${ctrlNum}: ${ctrlVal}`);
                break;
            case 12: //prg change
                break;
            case 13: //ch pressure
                break;
            case 14: //pitch bend
                break;
            case 15:
                // MIDI Timing Code            F1                   1
                // Song Position Pointer       F2                   2
                // Song Select                 F3                   1
                // Tune Request                F6                  None                break;
                // Timing Clock                         F8
                // Start Sequence                       FA
                // Continue Sequence                    FB
                // Stop Sequence                        FC
                // Active Sensing                       FE
                // System Reset                         FF
                break;
            default:
                console.log(messageData);
        }
        return parsed;
    }
}

export abstract class DeviceMessage extends Message {
    protected device: DeviceBase;
    constructor(device: DeviceBase, time: number = 0) {
        super(time);
        this.device = device;
    }
    sendNow() {
        this.device.onMessage(this);
    }

    getDevice() { return this.device; }
    setDevice(device: DeviceBase) { this.device = device; }
}

export class TempoMessage extends Message {
    private microsecsPerQuarter: number;
    constructor(bpm: number, time: number = 0) {
        super(time);
        this.microsecsPerQuarter = 60000000 / bpm;
    }
    setBpm(value: number) { this.microsecsPerQuarter = value * 60000000 }
    getBpm() { return 60000000 / this.microsecsPerQuarter; };

    sendNow() {
    }
    makeTimeShiftedCopy(delta: number) {
        return new TempoMessage(this.microsecsPerQuarter, this.time + delta);
    }
}

export class Channel {
    private channelNum: number;
    constructor(channelNum: number) {
        this.channelNum = channelNum;
    }
    getChannelNum() { return this.channelNum; }
    validate() {}
}
export abstract class DeviceBase {
    abstract onMessage(msg: Message);

    static async tryGetMIDIAccess() {
        if (!navigator.requestMIDIAccess) { return null; }
        return await navigator.requestMIDIAccess();
    }
}

export interface MessageDispatcher {
    outEvent: EventTarget<MidiMessageEvent>;
}

export interface MessageReceiver {
    onMessage(msg: Message);
}

export class InputDevice extends DeviceBase implements MessageDispatcher {
    private channelRouting: Map<number | string, number | number[]>;
    constructor(channelRouting: Map<number | string, number | number[]> = null) {
        super();
        this.channelRouting = channelRouting;
        this.outEvent = new EventTarget<MidiMessageEvent>();
    }
    outEvent: EventTarget<MidiMessageEvent>;

    onMessage(msg: Message) {
        if (msg instanceof ChannelMessage) {
            const mapping = !this.channelRouting ? null 
                : (this.channelRouting.get(msg.getChannel().getChannelNum()) || this.channelRouting.get("*"));
            // console.log("mapping", mapping, msg.getChannel().getChannelNum());

            if (mapping != null) {
                if (Array.isArray(mapping)) {
                } else {
                    (<any>msg).channel.channelNum = mapping;
                }
            }
        }
        this.outEvent.fire(<MidiMessageEvent>{ type: "note", message: msg, source: this });
    }

    async tryAttachMidiInput() {
        const midiAccess = await DeviceBase.tryGetMIDIAccess();
        const inputsArr = Array.from(midiAccess.inputs.keys());
        if (inputsArr.length === 0)  { return false; }

        const input = midiAccess.inputs.get(inputsArr[0]);
        console.log(`Listening on ${input.manufacturer} ${input.name}`);
        input.addEventListener("midimessage", e => {
            const msg = Message.parseMidiMessageData(e.data);
            if (msg) {
                if (!(msg instanceof NoteMessage)) {
                    console.log(msg);
                }
                this.onMessage(msg);
            }
        });
        return true;
    }
}

export class OutputDevice extends DeviceBase implements MessageReceiver {
    private channels: MessageReceiver[] = [];
    constructor(receivers: MessageReceiver[]) {
      super();
      this.channels = receivers;
    }
  
    getChannels() { return this.channels.concat([]); }
    onMessage(msg: Message) {
        if (msg instanceof ChannelMessage) {
            const chIndex = msg.getChannel().getChannelNum() - 1; //index0 here, index1 in MIDI
            if (chIndex < 0 || chIndex >= this.channels.length) {
                console.log(`Channel outside bounds ${msg.getChannel().getChannelNum()} (${this.channels.length})`);
                return;
            }
            const ch = this.channels[chIndex];
            if (!ch) {
                console.log("Channel is null: " + chIndex);
                return;
            }
            ch.onMessage(msg);
        }
    }
}

export class Pitch {
    protected midiNote: number;
    isInMidiRange(): boolean { return true; }
    constructor(midiNote: number) {
        this.midiNote = midiNote;
    }
    getMidiNote() { return this.midiNote; }
}

export abstract class ChannelMessage extends DeviceMessage {
    protected channel: Channel;
    constructor(device: DeviceBase, channel: Channel, time: number = 0)
    {
        super(device, time);
        channel?.validate();
        this.channel = channel;
    }
    getChannel() { return this.channel; }
}

export abstract class NoteMessage extends ChannelMessage {
    protected pitch: Pitch;
    protected velocity: number;
    constructor(device: DeviceBase, channel: Channel, pitch: Pitch, velocity: number, time: number = 0) {
        super(device, channel, time);
        if (!pitch.isInMidiRange()) {
            throw Error("pitch is out of MIDI range.");
        }
        if (velocity < 0 || velocity > 127) {
            throw Error("velocity");
        }
        this.pitch = pitch;
        this.velocity = velocity;
    }

    getPitch() { return this.pitch; }
    getVelocity() { return this.velocity; }
}

export class NoteOnMessage extends NoteMessage {
    /// <summary>
    /// Constructs a Note On message.
    /// </summary>
    /// <param name="device">The device associated with this message.</param>
    /// <param name="channel">Channel, 0..15, 10 reserved for percussion.</param>
    /// <param name="pitch">The pitch for this note message.</param>
    /// <param name="velocity">Velocity, 0..127.</param>
    /// <param name="time">The timestamp for this message.</param>
    constructor(device: DeviceBase, channel: Channel, pitch: Pitch, velocity: number, time: number = 0) {
        super(device, channel, pitch, velocity, time);
    }

    // sendNow() {
    //     (<OutputDevice>this.device)?.sendNoteOn(this.channel, this.pitch, this.velocity);
    // }

    makeTimeShiftedCopy(delta: number) {
        return new NoteOnMessage(this.device, this.channel, this.pitch, this.velocity, this.time + delta);
    }
}
export class AllSoundOffMessage extends ChannelMessage {
    //MIDI ID 120
    constructor(device: DeviceBase, channel: Channel, time: number = 0) {
        super(device, channel, time)
    }
    makeTimeShiftedCopy(delta: number) {
        return new AllSoundOffMessage(this.device, this.channel, this.time + delta);
    }
}

export class NoteOffMessage extends NoteMessage {
    /// <summary>
    /// Constructs a Note Off message.
    /// </summary>
    /// <param name="device">The device associated with this message.</param>
    /// <param name="channel">Channel, 0..15, 10 reserved for percussion.</param>
    /// <param name="pitch">The pitch for this note message.</param>
    /// <param name="velocity">Velocity, 0..127.</param>
    /// <param name="time">The timestamp for this message.</param>
    constructor(device: DeviceBase, channel: Channel, pitch: Pitch, velocity: number, time: number = 0) {
        super(device, channel, pitch, velocity, time)
    }

    // sendNow() {
    //     (<OutputDevice>this.device)?.sendNoteOff(this.channel, this.pitch, this.velocity);
    // }
    makeTimeShiftedCopy(delta: number) {
        return new NoteOffMessage(this.device, this.channel, this.pitch, this.velocity, this.time + delta);
    }
}
import { Channel, Message, MessageDispatcher, NoteOffMessage, NoteOnMessage, Pitch } from "../midi";
import type { MidiMessageEvent } from "../event";
import { EventTarget } from "../event";
import { InstrumentKeyGUI, PianoKey, PianoKeyboard, Rectangle } from "../piano";

export class PianoKeySvg implements InstrumentKeyGUI {
    element: SVGElement;
    color: string;
    note: number;

    constructor(document: Document, rct: Rectangle, note: number, color: string = "") {
        const shape = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        this.element = shape;
        const isWhiteKey = PianoKey.isWhiteNote(note);
        this.note = note;
        if (!color.length) color = isWhiteKey ? "#eeeeee" : "#000000";
        this.color = color;

        shape.setAttributeNS(null, 'x', rct.x.toString());
        shape.setAttributeNS(null, 'y', rct.y.toString());
        shape.setAttributeNS(null, 'height', rct.height.toString());
        shape.setAttributeNS(null, 'width', rct.width.toString());

        shape.setAttributeNS(null, 'stroke', "#000000");
        shape.setAttribute("fill", this.color);

        // shape.setAttributeNS(null, 'x', pos.x.toString());
        // shape.setAttributeNS(null, 'y', pos.y.toString());
        // shape.setAttributeNS(null, 'height', (relSize.y * scale.y).toString());
        // shape.setAttributeNS(null, 'width', (relSize.x * scale.x).toString());

        // shape.setAttributeNS(null, 'stroke', "#000000");
        // shape.setAttribute("fill", `${isWhite ? "#eeeeee" : "#000000"}`);
    }
    down() {
        this.element.setAttribute("fill", "#ff0000");
    }
    up() {
        this.element.setAttribute("fill", this.color);
    }
}

export class PianoKeyboardGUIHandler implements MessageDispatcher {
    // TODO: shouldn't this be an InputDevice?
    outEvent: EventTarget<MidiMessageEvent>;
    // keyboard: PianoKeyboard;
    keys: PianoKey[];
    constructor() {
        this.outEvent = new EventTarget<MidiMessageEvent>();  
    }

    createGfx(svg: SVGSVGElement, keys: PianoKey[]) {
        this.keys = keys;
        const gfx = this.keys.map(d => new PianoKeySvg(document, d.rect, d.midiNote));
        gfx.filter(g => PianoKey.isWhiteNote(g.note)).forEach(g => svg.appendChild(g.element));
        gfx.filter(g => !PianoKey.isWhiteNote(g.note)).forEach(g => svg.appendChild(g.element));

        this.keys.forEach((k, i) => k.gfx = gfx[i]);

        svg.addEventListener('mousedown', this.onMouseDown.bind(this));
        svg.addEventListener('mouseup', this.onMouseUp.bind(this));
        svg.addEventListener('mouseupoutside', this.onMouseUp.bind(this));
        svg.addEventListener('mousemove', this.onMouseMove.bind(this));

        svg.addEventListener("touchstart", this.onTouchStart.bind(this));
        svg.addEventListener("touchmove", this.onTouchMove.bind(this));
        svg.addEventListener("touchcancel", this.onTouchEnd.bind(this));
        svg.addEventListener("touchend", this.onTouchEnd.bind(this));
    }

    onTouchStart(e: TouchEvent) {
        const t = e.touches[0];
        this.onDown(t.clientX, t.clientY);
    }
    onTouchMove(e: TouchEvent) {
        // console.log(e);
        const t = e.touches[0];
        this.onMove(t.clientX, t.clientY);
    }
    onTouchEnd(e: TouchEvent) {
        // console.log(e);
        const t = e.touches[0];
        this.onUp(t.clientX, t.clientY);
    }

    private findKeyUnder(x: number, y: number) {
        const el = document.elementFromPoint(x, y);
        return this.keys.find(k => (<PianoKeySvg>k.gfx).element == el);
    }

    private fireEvent(note: number, type: "on" | "off") {
        const msg = type === "on" ? new NoteOnMessage(null, new Channel(1), new Pitch(note), 127) : new NoteOffMessage(null, new Channel(1), new Pitch(note), 127);
        this.outEvent.fire(<MidiMessageEvent>{ type: "note", message: <Message>msg, source: this });
    }

    private isMouseDown: boolean = false;
    private onDown(x: number, y: number) {
        this.isMouseDown = true;
        const key = this.findKeyUnder(x, y);
        if (!!key) {
            this.fireEvent(key.midiNote, "on");
        }
    }
    private onMove(x: number, y: number) {
        if (!this.isMouseDown) {
            return;
        }
        const key = this.findKeyUnder(x, y);
        const currentlyDown = this.keys.filter(k => k.isDown);
        if (currentlyDown.indexOf(key) >= 0) {
            return;
        }
        currentlyDown.forEach(k => this.fireEvent(k.midiNote, "off"));
        if (!!key) {
            this.fireEvent(key.midiNote, "on");
        }
    }
    private onUp(x: number, y: number) {
        this.isMouseDown = false;
        const key = this.findKeyUnder(x, y);
        if (!!key) {
            this.fireEvent(key.midiNote, "off");
        }
    }

    private onMouseDown(event: MouseEvent) {
        this.onDown(event.clientX, event.clientY);
    }
    private onMouseUp(event: MouseEvent) {
        this.onUp(event.clientX, event.clientY);
    }
    private onMouseMove(event: MouseEvent) {
        this.onMove(event.clientX, event.clientY);
    }
}

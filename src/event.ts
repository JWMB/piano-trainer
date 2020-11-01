import type { Message } from "./midi";

export interface MidiMessageEvent extends Event {
    message: Message;
    source: any;
}
export interface KeyValueMap<T> {
    [key: string]: T;
  }
  
export class EventTarget<T extends Event> {
    private _listeners: KeyValueMap<((e: T) => void)[]> = {};

    addListener(type: string, listener: (e: T) => void) {
        if (typeof this._listeners[type] == "undefined"){
            this._listeners[type] = [];
        }
        this._listeners[type].push(listener);
    }

    fire(event: T | string) {
        if (typeof event == "string") {
            event = <T>{ type: event };
        }
        if (!event.type) {
            throw new Error("Event object missing 'type' property.");
        }
        if (!event.target) {
            const tmp: any = {};
            Object.keys(event).forEach(k => tmp[k] = event[k]);
            tmp.target = this;
            event = <T>tmp;
        }

        const listeners = this._listeners[event.type];
        if (listeners instanceof Array){
            for (let i = 0, len = listeners.length; i < len; i++){
                // console.log("fire to", listeners[i]);
                listeners[i].call(this, event);
            }
        }
    }

    removeListener(type, listener) {
        const listeners = this._listeners[type];
        // console.log(listener, listeners);
        if (listeners instanceof Array){
            for (let i = 0, len = listeners.length; i < len; i++){
                if (listeners[i] === listener){
                    listeners.splice(i, 1);
                    break;
                }
            }
        }
    }
}

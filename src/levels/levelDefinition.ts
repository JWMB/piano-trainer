import type { TimeSignature } from "../sequencer";

export interface LevelDefinitionBase {
    tempo?: number | null;
    signature?: TimeSignature;
}
export interface LevelDefinition extends LevelDefinitionBase {
    chords: string;
    melody: MelodyDefinition;
}
export interface MelodyDefinition {
    showNotes?: boolean;
}
export interface GenerateMelodyDefinition extends MelodyDefinition {
    numNotes: number;
    maxDistance?: number | null;
    startNotes?: number[] | null;
    notesPerChord?: number | null;
}
export interface FixedMelodyDefinition extends MelodyDefinition {
    notes: string;
}

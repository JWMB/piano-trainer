import { Chords, EqualTemperament, NoteHzConvert, Notes } from "./tonality";

// import 
it('returns 12 for non-empty inputs', () => {
  const c4 = 60;

  expect(Notes.noteIndexTo12AndOctave(c4)).toStrictEqual({ index: 0, octave: 4});
  expect(Notes.noteIndexTo12AndOctave(c4 + 12)).toStrictEqual({ index: 0, octave: 5});
  expect(Notes.noteIndexTo12AndOctave(c4 - 10)).toStrictEqual({ index: 2, octave: 3});
  expect(Notes.noteIndexTo12AndOctave(c4 - 12)).toStrictEqual({ index: 0, octave: 3});
  
  expect(Notes.getNoteIndex("c", true)).toBe(c4);
  expect(Notes.getNoteIndex("c4", true)).toBe(c4);
  expect(Notes.getNoteIndex("c5", true)).toBe(c4 + 12);
  expect(Notes.getNoteIndex("c3", true)).toBe(c4 - 12);

  expect(Notes.getNoteNames(c4, true)).toStrictEqual(["c4"]);
  expect(Notes.getNoteNames(c4 - 12, true)).toStrictEqual(["c3"]);
  expect(Notes.getNoteNames(c4, false)).toStrictEqual(["c"]);
  expect(Notes.getNoteNames(c4 + 1, false)).toStrictEqual(["c#", "db"]);
  expect(Notes.getNoteNames(c4 - 2, true)).toStrictEqual(["a3#", "b3b"]);
  expect(Notes.getNoteNames(c4 - 14, true)).toStrictEqual(["a2#", "b2b"]);

  const temperament = new EqualTemperament();
  expect(temperament.getFactor(c4)).toBe(1);
  expect(temperament.getFactor(c4 + 12)).toBe(2);
  expect(temperament.getFactor(c4 - 12)).toBe(0.5);
  expect(temperament.getFactor(c4 + 7)).toBe(1.498307);
  expect(temperament.getFactor(c4 - 5)).toBe(1.498307 / 2);
  expect(temperament.getFactor(c4 + 19)).toBe(1.498307 * 2);
  

  const conv = new NoteHzConvert(440, new EqualTemperament());
  expect(conv.getHz("a")).toBeCloseTo(440);
  expect(conv.getHz("a5")).toBeCloseTo(880);
  expect(conv.getHz("a3")).toBeCloseTo(220);

  expect(Chords.getOffsets("Cmaj7").offsets).toStrictEqual([0, 4, 7, 11]);
  expect(Chords.getOffsets("Cm7").offsets).toStrictEqual([0, 3, 7, 10]);
  expect(Chords.getOffsets("Csus4").offsets).toStrictEqual([0, 5, 7]);

  expect(Chords.getNotes("Cmaj7")).toStrictEqual([0, 4, 7, 11].map(o => o + Notes.defaultC4));
});

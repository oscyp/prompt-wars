import {
  assertEquals,
  assertThrows,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  stripCinematicAudio,
  readCinematicDurationSeconds,
} from '../_shared/cinematic-media.ts';
import {
  joinMp4,
  mp4Box,
  mp4Fixture,
  mp4Track,
  mp4DurationFixture,
} from './fixtures/mp4.ts';

Deno.test(
  'silent remux removes every audio track without changing video bytes or media offsets',
  () => {
    const input = mp4Fixture();
    const original = input.slice();
    const output = stripCinematicAudio(input);
    assertEquals(input, original, 'provider bytes are not mutated');
    assertEquals(output.length, input.length);
    const differences = [...output.keys()].filter(
      (i) => output[i] !== input[i],
    );
    // ftyp20 + moov header8 + video trak48 + audio size4 = audio type offset80.
    assertEquals(differences, [80, 82, 83]); // 'r' is shared by trak/free.
    assertEquals(new TextDecoder().decode(output.slice(80, 84)), 'free');
    assertEquals(
      output.slice(-12),
      input.slice(-12),
      'mdat position and payload remain fixed',
    );
    assertEquals(
      stripCinematicAudio(output),
      output,
      'already silent output is stable',
    );
  },
);
Deno.test(
  'silent remux keeps video-only and extended-size boxes intact',
  () => {
    const video = mp4Fixture(false, true);
    assertEquals(stripCinematicAudio(video), video);
    const input = mp4Fixture(true, true);
    const output = stripCinematicAudio(input);
    assertEquals(output.length, input.length);
    assertEquals(output.slice(-12), input.slice(-12));
    assertEquals(
      [...output.keys()].filter((i) => input[i] !== output[i]).length,
      3,
    );
  },
);
Deno.test(
  'silent remux preserves opaque UUID metadata outside the movie tracks',
  () => {
    const metadata = mp4Box('uuid', new Uint8Array(24));
    const input = joinMp4(mp4Fixture(), metadata);
    const output = stripCinematicAudio(input);
    assertEquals(output.slice(-metadata.length), metadata);
  },
);
Deno.test(
  'silent remux rejects malformed, audio-only, unknown-handler and fragmented files',
  () => {
    const valid = mp4Fixture();
    const oversized = valid.slice();
    new DataView(oversized.buffer).setUint32(0, valid.length + 1);
    const shortExtended = new Uint8Array([0, 0, 0, 1, 109, 100, 97, 116]);
    const hugeExtended = mp4Box('mdat', new Uint8Array(), true);
    new DataView(hugeExtended.buffer).setBigUint64(8, 2n ** 63n);
    for (const input of [
      new Uint8Array(),
      valid.slice(0, -1),
      oversized,
      shortExtended,
      hugeExtended,
      joinMp4(
        valid.slice(0, 20),
        mp4Box('moov', mp4Track('soun')),
        mp4Box('mdat', new Uint8Array([1])),
      ),
      joinMp4(valid, mp4Box('moof')),
      joinMp4(
        valid.slice(0, 20),
        mp4Box('moov', joinMp4(mp4Track('vide'), mp4Box('mvex'))),
        mp4Box('mdat', new Uint8Array([1])),
      ),
      joinMp4(
        valid.slice(0, 20),
        mp4Box('moov', joinMp4(mp4Track('vide'), mp4Track('hint'))),
        mp4Box('mdat', new Uint8Array([1])),
      ),
      joinMp4(
        valid.slice(0, 20),
        mp4Box('moov', mp4Box('trak', mp4Box('mdia', mp4Box('hdlr')))),
        mp4Box('mdat', new Uint8Array([1])),
      ),
      joinMp4(valid, mp4Box('moov', mp4Track('vide'))),
    ])
      assertThrows(() => stripCinematicAudio(input), Error);
  },
);

Deno.test(
  'cinematic duration comes from complete MP4 timeline, including version-one headers',
  () => {
    for (const version of [0, 1]) {
      const bytes = mp4DurationFixture(20.0416666667, 20.0416666667, version);
      assertEquals(readCinematicDurationSeconds(bytes), 20.041666666666668);
      assertEquals(
        readCinematicDurationSeconds(stripCinematicAudio(bytes)),
        20.041666666666668,
      );
      assertEquals(
        readCinematicDurationSeconds(mp4DurationFixture(5, 5, version)),
        5,
      );
    }
  },
);
Deno.test(
  'cinematic duration rejects missing, invalid, inconsistent or truncated timelines',
  () => {
    for (const bytes of [
      mp4Fixture(),
      mp4DurationFixture(0),
      mp4DurationFixture(20, 5),
      mp4DurationFixture(20).slice(0, -1),
    ])
      assertThrows(() => readCinematicDurationSeconds(bytes));
    const badTimescale = mp4DurationFixture(20);
    // ftyp20 + moov8 + mvhd8 + fullbox timescale offset12.
    new DataView(badTimescale.buffer).setUint32(48, 0);
    assertThrows(() => readCinematicDurationSeconds(badTimescale));
  },
);

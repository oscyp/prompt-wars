interface Box {
  start: number;
  payload: number;
  end: number;
  type: string;
}
const invalid = (): never => {
  throw new Error('Unsupported or malformed cinematic MP4');
};

/**
 * Remove playable audio from a non-fragmented ISO BMFF movie without reencoding.
 * A same-sized `free` box replaces each audio `trak`; mdat/chunk offsets and all
 * video metadata remain byte-for-byte fixed. Audio sample bytes remain inert in
 * mdat. This is a playback remux, not erasure of those unused sample bytes.
 * Unrecognized track layouts fail closed rather than relying on client mute.
 */
export function stripCinematicAudio(
  input: Uint8Array,
): Uint8Array<ArrayBuffer> {
  return inspectCinematicMedia(input, false).output;
}

/** xAI extension metadata reports only added seconds; validate the full file. */
export function readCinematicDurationSeconds(input: Uint8Array): number {
  return inspectCinematicMedia(input, true).durationSeconds!;
}

function inspectCinematicMedia(
  input: Uint8Array,
  readDuration: boolean,
): {
  output: Uint8Array<ArrayBuffer>;
  durationSeconds?: number;
} {
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const fourcc = (offset: number) =>
    String.fromCharCode(...input.subarray(offset, offset + 4));
  let boxCount = 0;
  const boxes = (start: number, end: number): Box[] => {
    const found: Box[] = [];
    for (let offset = start; offset < end; ) {
      if (++boxCount > 100_000 || end - offset < 8) invalid();
      let size = view.getUint32(offset),
        header = 8;
      const type = fourcc(offset + 4);
      if (size === 1) {
        if (end - offset < 16) invalid();
        const large = view.getBigUint64(offset + 8);
        if (large > BigInt(Number.MAX_SAFE_INTEGER)) invalid();
        size = Number(large);
        header = 16;
      } else if (size === 0) {
        // Only a final top-level media-data box may consume the file remainder.
        if (type !== 'mdat' || start !== 0 || end !== input.length) invalid();
        size = end - offset;
      }
      if (size < header || size > end - offset) invalid();
      found.push({
        start: offset,
        payload: offset + header,
        end: offset + size,
        type,
      });
      offset += size;
    }
    return found;
  };
  const allowed = (list: Box[], types: string[]) => {
    if (list.some((box) => !types.includes(box.type))) invalid();
  };
  const single = (list: Box[], type: string): Box => {
    const matches = list.filter((box) => box.type === type);
    if (matches.length !== 1) invalid();
    return matches[0];
  };
  const top = boxes(0, input.length);
  allowed(top, ['ftyp', 'moov', 'mdat', 'free', 'skip', 'wide', 'uuid']);
  // Ancillary extended-type metadata has no movie track semantics.
  if (top.some((box) => box.type === 'uuid' && box.end - box.payload < 16))
    invalid();
  const ftyp = single(top, 'ftyp');
  if (
    ftyp.end - ftyp.payload < 8 ||
    (ftyp.end - ftyp.payload) % 4 !== 0 ||
    ![
      'isom',
      'iso2',
      'iso3',
      'iso4',
      'iso5',
      'iso6',
      'avc1',
      'mp41',
      'mp42',
      'M4V ',
    ].includes(fourcc(ftyp.payload))
  )
    invalid();
  if (!top.some((box) => box.type === 'mdat' && box.end > box.payload))
    invalid();
  const movie = single(top, 'moov');
  const movieChildren = boxes(movie.payload, movie.end);
  // mvex/moof and compressed/alternate movie layouts are deliberately rejected.
  allowed(movieChildren, [
    'mvhd',
    'trak',
    'udta',
    'meta',
    'free',
    'skip',
    'iods',
  ]);
  const headerDuration = (
    box: Box,
    trackTimescale?: number,
  ): { seconds: number; timescale: number } => {
    if (box.end - box.payload < 4) invalid();
    const version = view.getUint8(box.payload);
    if (version !== 0 && version !== 1) invalid();
    const durationOffset =
      trackTimescale === undefined
        ? version === 1
          ? 24
          : 16
        : version === 1
          ? 28
          : 20;
    if (box.end - box.payload < durationOffset + (version === 1 ? 8 : 4))
      invalid();
    const timescale =
      trackTimescale ?? view.getUint32(box.payload + (version === 1 ? 20 : 12));
    const duration =
      version === 1
        ? view.getBigUint64(box.payload + durationOffset)
        : BigInt(view.getUint32(box.payload + durationOffset));
    if (
      !timescale ||
      duration === 0n ||
      duration > BigInt(Number.MAX_SAFE_INTEGER) ||
      duration === (version === 1 ? 0xffffffffffffffffn : 0xffffffffn)
    )
      invalid();
    const seconds = Number(duration) / timescale;
    if (!Number.isFinite(seconds) || seconds <= 0) invalid();
    return { seconds, timescale };
  };
  const movieDuration = readDuration
    ? headerDuration(single(movieChildren, 'mvhd'))
    : undefined;
  const videoDurations: number[] = [];
  const audio: Box[] = [];
  let videoCount = 0;
  for (const track of movieChildren.filter((box) => box.type === 'trak')) {
    const children = boxes(track.payload, track.end);
    // Reject track references: a remaining track must not depend on removed audio.
    allowed(children, ['tkhd', 'mdia', 'edts', 'udta', 'meta', 'free', 'skip']);
    const media = single(children, 'mdia');
    const mediaChildren = boxes(media.payload, media.end);
    allowed(mediaChildren, ['mdhd', 'hdlr', 'minf', 'elng', 'free', 'skip']);
    const handler = single(mediaChildren, 'hdlr');
    // FullBox(version/flags), pre_defined, handler_type, reserved[3].
    if (
      handler.end - handler.payload < 24 ||
      view.getUint32(handler.payload) !== 0
    )
      invalid();
    const type = fourcc(handler.payload + 8);
    if (type === 'vide') {
      videoCount++;
      if (movieDuration) {
        const track = headerDuration(
          single(children, 'tkhd'),
          movieDuration.timescale,
        ).seconds;
        const media = headerDuration(single(mediaChildren, 'mdhd')).seconds;
        // Reject an apparently long movie that contains only a short video track.
        if (
          Math.abs(track - movieDuration.seconds) > 0.25 ||
          Math.abs(media - track) > 0.25
        )
          invalid();
        videoDurations.push(Math.min(track, media));
      }
    } else if (type === 'soun') audio.push(track);
    else invalid();
    for (const container of children.filter((box) => box.type === 'edts'))
      boxes(container.payload, container.end);
    for (const container of mediaChildren.filter(
      (box) => box.type === 'minf',
    )) {
      const information = boxes(container.payload, container.end);
      allowed(information, [
        'vmhd',
        'smhd',
        'hmhd',
        'nmhd',
        'dinf',
        'stbl',
        'free',
        'skip',
      ]);
      for (const nested of information.filter((box) =>
        ['dinf', 'stbl'].includes(box.type),
      ))
        boxes(nested.payload, nested.end);
    }
  }
  if (videoCount === 0) invalid();
  const output = new Uint8Array(input);
  for (const track of audio) output.set([102, 114, 101, 101], track.start + 4);
  return {
    output,
    durationSeconds: movieDuration
      ? Math.min(movieDuration.seconds, ...videoDurations)
      : undefined,
  };
}

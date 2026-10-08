const utf8 = new TextEncoder();
export function joinMp4(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
export function mp4Box(
  type: string,
  data: Uint8Array = new Uint8Array(),
  extended = false,
): Uint8Array<ArrayBuffer> {
  const header = new Uint8Array(extended ? 16 : 8);
  const view = new DataView(header.buffer);
  view.setUint32(0, extended ? 1 : header.length + data.length);
  header.set(utf8.encode(type), 4);
  if (extended) view.setBigUint64(8, BigInt(header.length + data.length));
  return joinMp4(header, data);
}
export function mp4Track(
  handler: string,
  extended = false,
): Uint8Array<ArrayBuffer> {
  const data = new Uint8Array(24);
  data.set(utf8.encode(handler), 8);
  return mp4Box('trak', mp4Box('mdia', mp4Box('hdlr', data)), extended);
}
export function mp4Fixture(
  audio = true,
  extended = false,
): Uint8Array<ArrayBuffer> {
  return joinMp4(
    mp4Box('ftyp', utf8.encode('isom\u0000\u0000\u0000\u0000isom')),
    mp4Box(
      'moov',
      joinMp4(mp4Track('vide'), ...(audio ? [mp4Track('soun', extended)] : [])),
      extended,
    ),
    mp4Box('mdat', new Uint8Array([10, 11, 12, 13])),
  );
}

/** Timed ISO BMFF metadata for duration-validation tests. */
export function mp4DurationFixture(
  durationSeconds: number,
  videoDurationSeconds = durationSeconds,
  version = 0,
): Uint8Array<ArrayBuffer> {
  const timedHeader = (seconds: number) => {
    const data = new Uint8Array(version === 1 ? 32 : 20);
    data[0] = version;
    const view = new DataView(data.buffer);
    view.setUint32(version === 1 ? 20 : 12, 24000);
    if (version === 1)
      view.setBigUint64(24, BigInt(Math.round(seconds * 24000)));
    else view.setUint32(16, Math.round(seconds * 24000));
    return data;
  };
  const trackHeader = new Uint8Array(version === 1 ? 36 : 24);
  trackHeader[0] = version;
  const view = new DataView(trackHeader.buffer);
  if (version === 1)
    view.setBigUint64(28, BigInt(Math.round(videoDurationSeconds * 24000)));
  else view.setUint32(20, Math.round(videoDurationSeconds * 24000));
  const handler = new Uint8Array(24);
  handler.set(utf8.encode('vide'), 8);
  return joinMp4(
    mp4Box('ftyp', utf8.encode('isom\u0000\u0000\u0000\u0000isom')),
    mp4Box(
      'moov',
      joinMp4(
        mp4Box('mvhd', timedHeader(durationSeconds)),
        mp4Box(
          'trak',
          joinMp4(
            mp4Box('tkhd', trackHeader),
            mp4Box(
              'mdia',
              joinMp4(
                mp4Box('mdhd', timedHeader(videoDurationSeconds)),
                mp4Box('hdlr', handler),
              ),
            ),
          ),
        ),
        mp4Track('soun'),
      ),
    ),
    mp4Box('mdat', new Uint8Array([10, 11, 12, 13])),
  );
}

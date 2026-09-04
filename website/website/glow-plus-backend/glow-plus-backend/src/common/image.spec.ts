/**
 * Tests for logo validation  (M1 — mobile spec W3)
 *
 * W3: *"The website must validate that an uploaded logo is a reasonable image
 * file (an actual image, within a sensible file size limit) before accepting
 * it, and must give the salon owner a clear error if the upload is rejected."*
 *
 * The one that matters most is the first: these bytes are served back from
 * `GET /merchants/:id/logo` **on the API's own origin**, so "the caller said it
 * was a PNG" is not a fact about them. Everything else here is a supporting
 * cast.
 */
import { BadRequestException } from '@nestjs/common';
import { decodeImageDataUrl, sniffImage } from './image';
import { MAX_LOGO_BYTES } from './limits';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const GIF = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP'),
  Buffer.from([0x56, 0x50, 0x38, 0x20]),
]);

const asDataUrl = (buf: Buffer, declared = 'image/png') =>
  `data:${declared};base64,${buf.toString('base64')}`;

describe('sniffImage — format comes from the bytes, never from the claim', () => {
  it.each([
    ['PNG', PNG, 'image/png'],
    ['JPEG', JPEG, 'image/jpeg'],
    ['GIF', GIF, 'image/gif'],
    ['WebP', WEBP, 'image/webp'],
  ])('identifies %s', (_name, bytes, mime) => {
    expect(sniffImage(bytes as Buffer)?.mimeType).toBe(mime);
  });

  it('rejects an SVG, which is a document and not a picture', () => {
    // Deliberately unsupported. An SVG can carry <script> and external
    // references, and it would be served from the API's own origin. There is
    // no magic number that makes one safe, and a logo has no need of one.
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
  });

  it('rejects HTML wearing an image name', () => {
    expect(sniffImage(Buffer.from('<!doctype html><script>alert(1)</script>'))).toBeNull();
  });

  it('does not read past the end of a short buffer', () => {
    // A 2-byte "file" must be a clean null, not a range error.
    expect(sniffImage(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(sniffImage(Buffer.alloc(0))).toBeNull();
  });

  it('is not fooled by a RIFF container that is not WebP', () => {
    const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')]);
    expect(sniffImage(wav)).toBeNull();
  });
});

describe('decodeImageDataUrl', () => {
  it('stores the DERIVED mime type, not the declared one', () => {
    // The whole point. A JPEG announced as `image/png` is stored as a JPEG,
    // because that is what it is — and the stored type is what the logo route
    // later sends as `Content-Type`.
    const { format } = decodeImageDataUrl(asDataUrl(JPEG, 'image/png'));
    expect(format.mimeType).toBe('image/jpeg');
  });

  it('refuses a payload that is base64 but not an image', () => {
    expect(() => decodeImageDataUrl(asDataUrl(Buffer.from('just some text')))).toThrow(
      BadRequestException,
    );
  });

  it('refuses anything that is not a base64 data URL at all', () => {
    for (const bad of ['', 'https://example.com/logo.png', 'data:image/png,notbase64']) {
      expect(() => decodeImageDataUrl(bad)).toThrow(BadRequestException);
    }
  });

  it('refuses an empty file rather than storing a zero-byte logo', () => {
    // A zero-byte row would make `logoUpdatedAt` non-null, so every surface
    // would render a broken image instead of the placeholder R3.12 asks for.
    expect(() => decodeImageDataUrl('data:image/png;base64,')).toThrow(BadRequestException);
  });

  it('refuses an oversized image, and says so in words a salon owner can act on', () => {
    const huge = Buffer.concat([PNG, Buffer.alloc(MAX_LOGO_BYTES)]);
    try {
      decodeImageDataUrl(asDataUrl(huge));
      throw new Error('expected a rejection');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      // W3's "clear error" is the requirement. A bare "Bad Request" satisfies
      // the status code and none of the intent.
      expect((err as Error).message).toMatch(/too large/i);
      expect((err as Error).message).toMatch(/2\.0 MB/);
    }
  });

  it('accepts an image exactly at the limit', () => {
    // The boundary is a real one: a salon whose logo is 2 MB to the byte has
    // done nothing wrong, and an off-by-one here would reject it with a
    // message saying the maximum is the size they sent.
    const atLimit = Buffer.concat([PNG, Buffer.alloc(MAX_LOGO_BYTES - PNG.length)]);
    expect(atLimit.length).toBe(MAX_LOGO_BYTES);
    expect(decodeImageDataUrl(asDataUrl(atLimit)).sizeBytes).toBe(MAX_LOGO_BYTES);
  });

  it('reports the real byte length, which is what the DB constraint checks', () => {
    const { sizeBytes, buffer } = decodeImageDataUrl(asDataUrl(PNG));
    expect(sizeBytes).toBe(PNG.length);
    expect(buffer.equals(PNG)).toBe(true);
  });
});

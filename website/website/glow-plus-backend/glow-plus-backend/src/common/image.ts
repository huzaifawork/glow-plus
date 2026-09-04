import { BadRequestException } from '@nestjs/common';
import { MAX_LOGO_BYTES } from './limits';

/**
 * "Is this actually an image?"  (W3)
 *
 * The requirement is `must validate that an uploaded logo is a reasonable
 * image file (an actual image, within a sensible file size limit) ... and must
 * give the salon owner a clear error if the upload is rejected`.
 *
 * **Why the declared MIME type is not the check.** The `data:` URL's media
 * type is written by the caller. `data:image/png;base64,<an HTML page>` claims
 * to be a PNG and is not one, and we serve these bytes back from a route on
 * our own origin — so the claim has to be verified against the CONTENT, not
 * trusted. Every accepted format is therefore identified by its magic bytes,
 * and the stored `mimeType` is the one WE derived, never the one we were
 * handed.
 *
 * **Why SVG is not on the list.** An SVG is a document: it can carry
 * `<script>`, `<foreignObject>` and external references, and it would be
 * served from the API's own origin to anyone who opens a salon page. There is
 * no magic number that makes an SVG safe, and a logo has no need of one.
 *
 * The four accepted formats are the four every phone camera and every design
 * tool can produce, and the three that every `Image` component on both
 * clients can already render (WebP included — React Native and every current
 * browser handle it).
 */
export type LogoFormat = { mimeType: string; extension: string };

const MAGIC: ReadonlyArray<{ bytes: number[]; offset?: number; format: LogoFormat }> = [
  // PNG — \x89 P N G \r \n \x1a \n
  { bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], format: { mimeType: 'image/png', extension: 'png' } },
  // JPEG — SOI marker. The third byte varies by encoder, so it is not matched.
  { bytes: [0xff, 0xd8, 0xff], format: { mimeType: 'image/jpeg', extension: 'jpg' } },
  // GIF87a / GIF89a
  { bytes: [0x47, 0x49, 0x46, 0x38], format: { mimeType: 'image/gif', extension: 'gif' } },
];

/** RIFF....WEBP — a container, so the tag sits at offset 8, not 0. */
const WEBP = { riff: [0x52, 0x49, 0x46, 0x46], webp: [0x57, 0x45, 0x42, 0x50] };

function startsWith(buf: Buffer, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buf[offset + i] === b);
}

/** The format these bytes really are, or null if they are not an image we accept. */
export function sniffImage(buf: Buffer): LogoFormat | null {
  for (const entry of MAGIC) {
    if (startsWith(buf, entry.bytes, entry.offset ?? 0)) return entry.format;
  }
  if (startsWith(buf, WEBP.riff) && startsWith(buf, WEBP.webp, 8)) {
    return { mimeType: 'image/webp', extension: 'webp' };
  }
  return null;
}

/** Human-readable size, for an error message a salon owner can act on. */
function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type DecodedImage = { buffer: Buffer; format: LogoFormat; sizeBytes: number };

/**
 * Decode and validate a `data:` URL into bytes we are willing to store.
 *
 * Throws `BadRequestException` with a message written for the salon owner, not
 * for a developer — W3's "clear error" is the requirement, and a 400 saying
 * `Bad Request` satisfies the status code and none of the intent.
 *
 * Order matters: the ENCODED length is rejected before `Buffer.from` runs, so
 * an oversized payload is never materialised twice in memory to be told it was
 * too big.
 */
export function decodeImageDataUrl(dataUrl: string): DecodedImage {
  const match = /^data:([a-z]+\/[a-z0-9.+-]+)?;base64,([\s\S]+)$/i.exec(dataUrl.trim());
  if (!match) {
    throw new BadRequestException(
      "That doesn't look like an image file. Upload a PNG, JPEG, GIF or WebP.",
    );
  }

  const base64 = match[2];
  // 4 base64 chars per 3 bytes. Checked before decoding — see above.
  if ((base64.length * 3) / 4 > MAX_LOGO_BYTES + 3) {
    throw new BadRequestException(
      `That image is too large. The maximum logo size is ${humanSize(MAX_LOGO_BYTES)}.`,
    );
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64, 'base64');
  } catch {
    throw new BadRequestException("That file couldn't be read. Try uploading it again.");
  }

  if (buffer.length === 0) {
    throw new BadRequestException('That file is empty. Choose an image and try again.');
  }
  if (buffer.length > MAX_LOGO_BYTES) {
    throw new BadRequestException(
      `That image is too large (${humanSize(buffer.length)}). The maximum logo size is ${humanSize(MAX_LOGO_BYTES)}.`,
    );
  }

  const format = sniffImage(buffer);
  if (!format) {
    throw new BadRequestException(
      "That file isn't an image we can display. Upload a PNG, JPEG, GIF or WebP.",
    );
  }

  return { buffer, format, sizeBytes: buffer.length };
}

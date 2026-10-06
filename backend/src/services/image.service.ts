// Shared rules for uploaded images (prize images AC-PRZ-8, complimentary option images AC-CMP-11).

export const maxImageBytes = 2 * 1024 * 1024;

export class ImageError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/** Identify the image by its leading bytes, never by the file name or declared type. */
export function detectImageType(data: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** Validates an upload and returns its real type plus bytes in the form Prisma stores. */
export function checkImage(data: Buffer) {
  if (data.length === 0) throw new ImageError('INVALID_IMAGE', 'Choose an image to upload.', 400);
  if (data.length > maxImageBytes) throw new ImageError('IMAGE_TOO_LARGE', 'Images can be at most 2 MB.', 413);
  const mimeType = detectImageType(data);
  if (!mimeType) throw new ImageError('INVALID_IMAGE', 'Upload a JPG, PNG or WebP image.', 415);
  return { mimeType, bytes: new Uint8Array(data) };
}

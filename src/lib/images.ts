import sharp from 'sharp'

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024 // raw upload limit (phones send ~2–8 MB)

/** Detects the real image type from the first bytes; never trusts name or MIME header. */
export function sniffImageType(buf: Uint8Array): 'jpeg' | 'png' | 'webp' | 'gif' | null {
  if (buf.length < 12) return null
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg'
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png'
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'gif'
  const riff = String.fromCharCode(...buf.slice(0, 4))
  const webp = String.fromCharCode(...buf.slice(8, 12))
  if (riff === 'RIFF' && webp === 'WEBP') return 'webp'
  return null
}

/**
 * Re-encodes an upload: honours EXIF rotation, strips metadata (incl. GPS),
 * limits pixel count against decompression bombs, outputs WebP.
 */
export async function processRecipeImage(input: Buffer): Promise<{ large: Buffer; small: Buffer }> {
  const base = sharp(input, { limitInputPixels: 50_000_000, failOn: 'error' }).rotate()
  const large = await base.clone().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer()
  const small = await base.clone().resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true }).webp({ quality: 72 }).toBuffer()
  return { large, small }
}

/** Card thumbnails live next to the main image: foo.webp → foo-sm.webp */
export function smallVariant(path: string): string {
  return path.replace(/\.webp$/, '-sm.webp')
}

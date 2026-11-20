import { test } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { sniffImageType, processRecipeImage, smallVariant } from '../images'

test('sniffs real image types and rejects disguised files', async () => {
  const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#f80' } }).png().toBuffer()
  const jpg = await sharp(png).jpeg().toBuffer()
  const webp = await sharp(png).webp().toBuffer()
  assert.equal(sniffImageType(png), 'png')
  assert.equal(sniffImageType(jpg), 'jpeg')
  assert.equal(sniffImageType(webp), 'webp')
  assert.equal(sniffImageType(Buffer.from('<html><script>alert(1)</script></html>')), null)
  assert.equal(sniffImageType(Buffer.from('')), null)
})

test('resizes to WebP within bounds and makes a small variant', async () => {
  const big = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#0a0' } }).jpeg().toBuffer()
  const { large, small } = await processRecipeImage(big)
  const l = await sharp(large).metadata()
  const s = await sharp(small).metadata()
  assert.equal(l.format, 'webp')
  assert.deepEqual([l.width, l.height], [1600, 1200])
  assert.equal(s.width, 640)
  assert.equal(l.exif, undefined) // metadata stripped
})

test('corrupt image data is rejected', async () => {
  const fake = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)])
  await assert.rejects(processRecipeImage(fake))
})

test('smallVariant', () => {
  assert.equal(smallVariant('abc/123.webp'), 'abc/123-sm.webp')
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { crc32, createZip } from '../zip'

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926)
})

test('zip is readable by a standard unzipper, incl. UTF-8 names', () => {
  const zip = createZip([
    { name: 'chili-sin-carne.md', data: '---\ntitle: Chili\n---\n' },
    { name: 'hähnchen.md', data: 'Ä Ö Ü' },
  ])
  const dir = mkdtempSync(join(tmpdir(), 'ziptest-'))
  const file = join(dir, 'x.zip')
  writeFileSync(file, zip)
  const out = execFileSync('python3', ['-I', '-c',
    'import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print("|".join(z.namelist()));print(z.read("hähnchen.md").decode())', file]).toString()
  assert.equal(out, 'chili-sin-carne.md|hähnchen.md\nÄ Ö Ü\n')
})

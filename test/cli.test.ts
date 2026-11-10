// @vitest-environment node
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { main, outputPath } from '../src/cli.js'

const dir = mkdtempSync(join(tmpdir(), 'takesix-cli-'))
const valid = JSON.stringify({ takesix: '1.0', title: 'Shop', blocks: [{ id: 'a', title: 'A', at: 'A1' }] })

afterEach(() => vi.restoreAllMocks())

describe('outputPath', () => {
  it('puts the page next to the input, without .takesix.json', () => {
    expect(outputPath('x/shop.takesix.json', [])).toBe(resolve('x/shop.html'))
    expect(outputPath('shop.json', [])).toBe(resolve('shop.html'))
  })
  it('takes -o', () => {
    expect(outputPath('shop.json', ['-o', 'out/a.html'])).toBe(resolve('out/a.html'))
  })
})

describe('takesix build', () => {
  it('writes a self-contained page', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const file = join(dir, 'shop.takesix.json')
    writeFileSync(file, valid)
    expect(main(['build', file])).toBe(0)
    const html = readFileSync(join(dir, 'shop.html'), 'utf8')
    expect(html).toContain('<title>Shop</title>')
    expect(html).toContain('id="takesix-data"')
  })
  it('refuses an invalid document', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const file = join(dir, 'bad.json')
    writeFileSync(file, '{"takesix":"1.0"}')
    expect(main(['build', file])).toBe(1)
  })
  it('prints usage without a file', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(main(['build'])).toBe(2)
    expect(error.mock.calls[0]![0]).toContain('Usage')
  })
})

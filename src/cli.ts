import { readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { formatIssues, parseDocument } from '@takesix/core'
import { standaloneHtml } from './standalone/index.js'

const USAGE = `Usage: takesix build <diagram.json> [-o out.html]
  Validates a takesix document and writes one self-contained HTML page:
  it opens as the diagram without a server or network.`

/** Output path: -o, or the input next to itself with .html instead of (.takesix).json. */
export function outputPath(file: string, args: string[]): string {
  const o = args.indexOf('-o')
  if (o >= 0 && args[o + 1]) return resolve(args[o + 1]!)
  return resolve(join(dirname(file), basename(file).replace(/(\.takesix)?\.json$/i, '') + '.html'))
}

export function main(argv: string[]): number {
  const [command, file, ...rest] = argv
  if (command !== 'build' || !file) {
    console.error(USAGE)
    return 2
  }
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch (e) {
    console.error(`Cannot read ${file}: ${(e as Error).message}`)
    return 2
  }
  const result = parseDocument(text)
  if (!result.ok) {
    console.error(`${file}: invalid takesix document:`)
    console.error(formatIssues(result.issues))
    return 1
  }
  if (result.issues.length) console.error(formatIssues(result.issues))
  const out = outputPath(file, rest)
  writeFileSync(out, standaloneHtml(result.document))
  console.log(`Wrote ${out}`)
  return 0
}

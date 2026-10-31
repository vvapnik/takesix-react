import { Fragment, type ReactNode } from 'react'

// A small Markdown subset rendered straight to React elements. No HTML is
// ever produced or parsed, so text from an untrusted document cannot inject
// markup or scripts. Supported:
//   # / ## / ### headings, paragraphs, - / * / 1. lists, ``` code blocks,
//   **bold**, *italic*, `code`, [text](url) with http(s)/mailto URLs.

const SAFE_URL = /^(https?:\/\/|mailto:)/i

type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'code'; text: string }

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (line.trim() === '') { i++; continue }

    if (line.startsWith('```')) {
      const body: string[] = []
      i++
      while (i < lines.length && !lines[i]!.startsWith('```')) body.push(lines[i++]!)
      i++ // closing fence (or end of text)
      blocks.push({ kind: 'code', text: body.join('\n') })
      continue
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line)
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1]!.length as 1 | 2 | 3, text: heading[2]! })
      i++
      continue
    }

    const bullet = /^\s*([-*]|\d+\.)\s+/
    const first = bullet.exec(line)
    if (first) {
      const ordered = /\d/.test(first[1]!)
      const items: string[] = []
      while (i < lines.length && bullet.test(lines[i]!)) items.push(lines[i++]!.replace(bullet, ''))
      blocks.push({ kind: 'list', ordered, items })
      continue
    }

    const text: string[] = []
    while (
      i < lines.length && lines[i]!.trim() !== '' &&
      !lines[i]!.startsWith('```') && !/^#{1,3}\s/.test(lines[i]!) && !bullet.test(lines[i]!)
    ) text.push(lines[i++]!)
    blocks.push({ kind: 'paragraph', text: text.join('\n') })
  }
  return blocks
}

// Inline markup, matched left to right. Order matters: code first, so its
// content is never formatted.
const INLINE = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)\s]+)\)|\n/g

export function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let key = 0
  for (const m of text.matchAll(INLINE)) {
    if (m.index! > last) out.push(text.slice(last, m.index))
    const [whole, code, bold, italic, linkText, url] = m
    if (code !== undefined) out.push(<code key={key++}>{code}</code>)
    else if (bold !== undefined) out.push(<strong key={key++}>{renderInline(bold)}</strong>)
    else if (italic !== undefined) out.push(<em key={key++}>{renderInline(italic)}</em>)
    else if (linkText !== undefined) {
      out.push(SAFE_URL.test(url!)
        ? <a key={key++} href={url} target="_blank" rel="noopener noreferrer">{renderInline(linkText)}</a>
        // Unsafe scheme (javascript:, data:…): keep the text, drop the link
        : <Fragment key={key++}>{renderInline(linkText)}</Fragment>)
    } else if (whole === '\n') out.push(<br key={key++} />)
    last = m.index! + whole.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** Renders the supported Markdown subset as React elements. */
export function Markdown({ source, className }: { source: string; className?: string }) {
  return (
    <div className={className}>
      {parseBlocks(source).map((b, i) => {
        switch (b.kind) {
          case 'heading': {
            // Panel headings sit below the block title (h2): start at h3
            const Tag = (['h3', 'h4', 'h5'] as const)[b.level - 1]!
            return <Tag key={i}>{renderInline(b.text)}</Tag>
          }
          case 'paragraph':
            return <p key={i}>{renderInline(b.text)}</p>
          case 'list': {
            const Tag = b.ordered ? 'ol' : 'ul'
            return <Tag key={i}>{b.items.map((item, j) => <li key={j}>{renderInline(item)}</li>)}</Tag>
          }
          case 'code':
            return <pre key={i}><code>{b.text}</code></pre>
        }
      })}
    </div>
  )
}

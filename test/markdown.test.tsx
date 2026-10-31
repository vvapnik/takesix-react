import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Markdown } from '../src/markdown.js'

const html = (source: string) => render(<Markdown source={source} />).container.innerHTML

describe('Markdown', () => {
  it('renders headings, paragraphs and lists', () => {
    expect(html('# Title\n\nFirst line\nsecond line\n\n- a\n- b\n\n1. one\n2. two')).toBe(
      '<div><h3>Title</h3><p>First line<br>second line</p><ul><li>a</li><li>b</li></ul><ol><li>one</li><li>two</li></ol></div>',
    )
  })

  it('renders inline formatting', () => {
    expect(html('**bold** and *italic* and `x < y`')).toBe(
      '<div><p><strong>bold</strong> and <em>italic</em> and <code>x &lt; y</code></p></div>',
    )
  })

  it('renders fenced code as is', () => {
    expect(html('```\n**not bold**\n<b>\n```')).toBe('<div><pre><code>**not bold**\n&lt;b&gt;</code></pre></div>')
  })

  it('keeps safe links and drops unsafe ones', () => {
    expect(html('[docs](https://example.com)')).toBe(
      '<div><p><a href="https://example.com" target="_blank" rel="noopener noreferrer">docs</a></p></div>',
    )
    expect(html('[click](javascript:alert(1))')).not.toContain('href')
  })

  it('never turns text into HTML', () => {
    const out = html('<img src=x onerror=alert(1)> <script>alert(1)</script>')
    expect(out).not.toContain('<img')
    expect(out).not.toContain('<script')
    expect(out).toContain('&lt;img')
  })
})

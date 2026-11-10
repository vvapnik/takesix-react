import { describe, expect, it } from 'vitest'
import type { TakeSixDocument } from '@takesix/core'
import { renderHtml } from '../src/standalone/html.js'

const doc: TakeSixDocument = {
  takesix: '1.0',
  title: 'A <b>"quoted"</b> title',
  blocks: [
    { id: 'a', title: 'A', at: 'A1', children: [{ id: 'a1', title: 'A1', at: 'A1' }] },
    { id: 'b', title: 'B', at: 'C1', description: '</script><script>alert(1)</script>' },
    { id: 'c', title: 'C', at: 'E1:F2', children: [{ id: 'c1', title: 'C1', at: 'B2' }] },
  ],
  links: [
    { id: 'ab', from: 'a', to: 'b' },
    { id: 'deep', from: 'a1', to: 'c1' },
  ],
}

describe('renderHtml', () => {
  const html = renderHtml(doc, 'VIEWER_JS', 'VIEWER_CSS')

  it('inlines the document, the viewer script and the stylesheet', () => {
    expect(html).toContain('<script type="application/json" id="takesix-data">')
    expect(html).toContain('<script>VIEWER_JS</script>')
    expect(html).toContain('<style>VIEWER_CSS</style>')
    expect(html).not.toMatch(/src=|href=/)
  })

  it('shows a loading screen in place of the viewer until it renders', () => {
    expect(html).toMatch(/<div id="root"><div class="takesix-preloader" role="status"[^]*<\/svg><\/div><\/div>/)
  })

  it('escapes the title', () => {
    expect(html).toContain('<title>A &lt;b&gt;&quot;quoted&quot;&lt;/b&gt; title</title>')
  })

  it('keeps document text from closing the data script', () => {
    // only the real closing tags of the two script elements
    expect(html.match(/<\/script>/g)).toHaveLength(2)
    const data = html.split('id="takesix-data">')[1]!.split('</script>')[0]!
    expect(JSON.parse(data)).toEqual(doc)
  })
})


describe('standaloneHtml', () => {
  it('inlines the built viewer', async () => {
    const { standaloneHtml } = await import('../src/standalone/index.js')
    const page = standaloneHtml(doc)
    expect(page).toContain('takesix-data')
    expect(page.length).toBeGreaterThan(100_000)
  })
})

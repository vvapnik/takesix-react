import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { waitFor } from '@testing-library/react'
import type { TakeSixDocument } from '@takesix/core'
import { defineTakeSixElement, TAG } from './define.js'

const doc: TakeSixDocument = {
  takesix: '1.0',
  title: 'Shop',
  blocks: [
    { id: 'web', title: 'Web', at: 'A1', children: [{ id: 'cart', title: 'Cart', at: 'A1' }] },
    { id: 'api', title: 'API', at: 'C1' },
  ],
}

const shadowText = (el: Element) => el.shadowRoot?.textContent ?? ''

function place(html: string): HTMLElement {
  document.body.innerHTML = html
  return document.querySelector(TAG)!
}

beforeAll(() => defineTakeSixElement('.css-marker{}'))

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('<take-six>', () => {
  it('registers once', () => {
    defineTakeSixElement('')
    expect(customElements.get(TAG)).toBeDefined()
  })

  it('shows an inline document in a shadow root with its stylesheet', async () => {
    const el = place(`<take-six><script type="application/json">${JSON.stringify(doc)}</script></take-six>`)
    await waitFor(() => expect(shadowText(el)).toContain('Web'))
    expect(shadowText(el)).toContain('API')
    expect(el.shadowRoot!.innerHTML).toContain('.css-marker{}')
    // The diagram stays in the shadow root: the page's DOM holds only the script
    expect(el.children).toHaveLength(1)
  })

  it('opens the screen named by `view`', async () => {
    const el = place(`<take-six view="in=web"><script type="application/json">${JSON.stringify(doc)}</script></take-six>`)
    await waitFor(() => expect(shadowText(el)).toContain('Cart'))
  })

  it('opens a screen named in the page URL when its block is in the document', async () => {
    window.history.replaceState(null, '', '#in=web')
    try {
      const el = place(`<take-six><script type="application/json">${JSON.stringify(doc)}</script></take-six>`)
      await waitFor(() => expect(shadowText(el)).toContain('Cart'))
      const other = place(`<take-six><script type="application/json">${JSON.stringify({ ...doc, blocks: [{ id: 'db', title: 'Database', at: 'A1' }] })}</script></take-six>`)
      await waitFor(() => expect(shadowText(other)).toContain('Database'))
    } finally {
      window.history.replaceState(null, '', '#')
    }
  })

  it('loads the document from `src`', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(doc)))
    vi.stubGlobal('fetch', fetchMock)
    const el = place('<take-six src="/docs/shop.takesix.json"></take-six>')
    await waitFor(() => expect(shadowText(el)).toContain('Web'))
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toMatch(/\/docs\/shop\.takesix\.json$/)
  })

  it('loads again when `src` changes', async () => {
    const other = { ...doc, title: 'Other', blocks: [{ id: 'db', title: 'Database', at: 'A1' }] }
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => new Response(JSON.stringify(String(url).includes('other') ? other : doc))))
    const el = place('<take-six src="shop.json"></take-six>')
    await waitFor(() => expect(shadowText(el)).toContain('Web'))
    el.setAttribute('src', 'other.json')
    await waitFor(() => expect(shadowText(el)).toContain('Database'))
  })

  it('says why when the file cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404, statusText: 'Not Found' })))
    const el = place('<take-six src="missing.json"></take-six>')
    await waitFor(() => expect(el.shadowRoot!.querySelector('[role=alert]')).not.toBeNull())
    expect(shadowText(el)).toContain('Cannot load missing.json: 404 Not Found')
  })

  it('says why when the document is invalid', async () => {
    const el = place('<take-six><script type="application/json">{"takesix":"1.0","blocks":[]}</script></take-six>')
    await waitFor(() => expect(el.shadowRoot!.querySelector('[role=alert]')).not.toBeNull())
    expect(shadowText(el)).toContain('This diagram cannot be shown')
  })

  it('applies the theme attribute', async () => {
    const el = place(`<take-six theme="dark"><script type="application/json">${JSON.stringify(doc)}</script></take-six>`)
    await waitFor(() => expect(el.shadowRoot!.querySelector('[data-theme]')).not.toBeNull())
    expect(el.shadowRoot!.querySelector('[data-theme]')!.getAttribute('data-theme')).toBe('dark')
  })
})

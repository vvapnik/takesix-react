import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TakeSixDocument, ViewAddress } from '@takesix/core'
import { TakeSix, screenLink } from '../src/index.js'

function sampleDoc(): TakeSixDocument {
  return {
    takesix: '1.0',
    title: 'Shop',
    blocks: [
      { id: 'web', title: 'Web app', at: 'A1:C1' },
      {
        id: 'api',
        title: 'API',
        at: 'D1:F1',
        children: [
          { id: 'auth', title: 'Auth', at: 'A1:C1' },
          { id: 'orders', title: 'Orders', at: 'D1:F1', children: [{ id: 'queue', title: 'Queue', at: 'A1' }] },
        ],
      },
      { id: 'db', title: 'Database', at: 'A2:F2' },
    ],
  }
}

const heading = () => screen.getByRole('heading', { level: 1 }).textContent
const card = (id: string) => document.querySelector(`[data-block-id="${id}"]`) as HTMLElement

function setHash(hash: string) {
  window.history.replaceState(null, '', `/${hash}`)
}

/** Back or Forward as the browser does it: the URL first, then popstate. */
function pop(hash: string) {
  act(() => {
    setHash(hash)
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
}

beforeEach(() => setHash(''))
afterEach(() => setHash(''))

describe('opening by address', () => {
  it('opens #in straight inside the block', () => {
    setHash('#in=orders')
    render(<TakeSix document={sampleDoc()} syncUrl />)
    expect(heading()).toBe('Orders')
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Shop/API/Orders')
  })

  it('opens #at on the block level with the block outlined', () => {
    setHash('#at=orders')
    render(<TakeSix document={sampleDoc()} syncUrl />)
    expect(heading()).toBe('API')
    expect(card('orders').className).toMatch(/cardHighlighted/)
    expect(card('auth').className).not.toMatch(/cardHighlighted/)
  })

  it('works next to #takesix=<data>', () => {
    setHash('#takesix=abc&in=api')
    render(<TakeSix document={sampleDoc()} syncUrl />)
    expect(heading()).toBe('API')
  })

  it('opens the top level for an unknown id, without errors', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    setHash('#in=nope')
    render(<TakeSix document={sampleDoc()} syncUrl />)
    expect(heading()).toBe('Shop')
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it('leaves the URL alone without syncUrl', () => {
    setHash('#in=api')
    render(<TakeSix document={sampleDoc()} />)
    expect(heading()).toBe('Shop')
  })
})

describe('history', () => {
  it('writes every move and follows Back and Forward', async () => {
    const user = userEvent.setup()
    const push = vi.spyOn(window.history, 'pushState')
    render(<TakeSix document={sampleDoc()} syncUrl />)

    await user.click(screen.getByRole('button', { name: 'Zoom into API' }))
    expect(window.location.hash).toBe('#in=api')
    await user.click(screen.getByRole('button', { name: 'Zoom into Orders' }))
    expect(window.location.hash).toBe('#in=orders')
    expect(push).toHaveBeenCalledTimes(2)

    pop('#in=api')
    expect(heading()).toBe('API')
    pop('')
    await waitFor(() => expect(heading()).toBe('Shop'))
    pop('#in=orders')
    expect(heading()).toBe('Orders')
    push.mockRestore()
  })

  it('writes the top level as a URL without a fragment', async () => {
    const user = userEvent.setup()
    setHash('#in=api')
    render(<TakeSix document={sampleDoc()} syncUrl />)
    await user.click(screen.getByRole('button', { name: 'Shop' }))
    expect(heading()).toBe('Shop')
    expect(window.location.hash).toBe('')
  })

  it('does not let two viewers fight over the URL', async () => {
    const user = userEvent.setup()
    render(<>
      <TakeSix document={sampleDoc()} syncUrl />
      <TakeSix document={sampleDoc()} />
    </>)
    const [, second] = screen.getAllByRole('button', { name: 'Zoom into API' })
    await user.click(second!)
    expect(window.location.hash).toBe('')
    expect(screen.getAllByRole('heading', { level: 1 }).map(h => h.textContent)).toEqual(['Shop', 'API'])
  })
})

describe('controlled view', () => {
  it('shows the view prop and reports moves', async () => {
    const user = userEvent.setup()
    const seen: ViewAddress[] = []
    function Host() {
      const [view, setView] = useState<ViewAddress>({ at: 'auth' })
      return <>
        <button onClick={() => setView(null)}>home</button>
        <TakeSix document={sampleDoc()} view={view} onViewChange={v => { seen.push(v); setView(v) }} syncUrl />
      </>
    }
    render(<Host />)
    expect(heading()).toBe('API')
    expect(card('auth').className).toMatch(/cardHighlighted/)
    await user.click(screen.getByRole('button', { name: 'Zoom into Orders' }))
    expect(seen).toEqual([{ in: 'orders' }])
    expect(heading()).toBe('Orders')
    // Controlled: syncUrl is ignored
    expect(window.location.hash).toBe('')
    await user.click(screen.getByRole('button', { name: 'home' }))
    expect(heading()).toBe('Shop')
  })
})

describe('links', () => {
  it('builds a link to a screen from the page URL', () => {
    expect(screenLink({ in: 'a b' }, 'file:///x/plan.html#takesix=abc&at=old')).toBe('file:///x/plan.html#takesix=abc&in=a%20b')
    expect(screenLink(null, 'https://e.com/p#in=x')).toBe('https://e.com/p')
  })

  it('copies a link to a block and to the screen', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<TakeSix document={sampleDoc()} menu syncUrl />)

    await user.click(screen.getByRole('button', { name: 'Copy link to Database' }))
    expect(writeText).toHaveBeenLastCalledWith(`${window.location.origin}/#at=db`)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy link to Database' })).toHaveAttribute('title', 'Link copied'))

    await user.click(screen.getByRole('button', { name: 'Zoom into API' }))
    await user.click(screen.getByRole('button', { name: 'TakeSix menu' }))
    await user.click(screen.getByRole('menuitem', { name: 'Copy link to this screen' }))
    expect(writeText).toHaveBeenLastCalledWith(`${window.location.origin}/#in=api`)
    expect(await screen.findByRole('menuitem', { name: 'Link copied' })).toBeInTheDocument()
  })

  it('copies a link to the screen from its header', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    setHash('#at=orders')
    render(<TakeSix document={sampleDoc()} syncUrl />)
    // The screen, not the outlined block
    await user.click(screen.getByRole('button', { name: 'Copy link to this screen' }))
    expect(writeText).toHaveBeenLastCalledWith(`${window.location.origin}/#in=api`)
  })

  it('has no link buttons while editing', () => {
    render(<TakeSix document={sampleDoc()} onChange={() => {}} editing />)
    expect(screen.queryByRole('button', { name: /Copy link/ })).toBeNull()
  })
})

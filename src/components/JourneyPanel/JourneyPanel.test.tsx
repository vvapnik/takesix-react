import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TakeSixDocument } from '@takesix/core'
import { TakeSix } from '../../index.js'

function tourDoc(): TakeSixDocument {
  return {
    takesix: '1.2',
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
    journeys: [
      {
        id: 'tour',
        title: 'Tour',
        steps: [{ label: 'Overview' }, { in: 'api', label: 'The API', duration: 2 }, { at: 'db', label: 'Storage' }],
      },
      { id: 'short', title: 'Short', steps: [{ in: 'orders' }] },
    ],
  }
}

const heading = () => screen.getByRole('heading', { level: 1 }).textContent
const panel = () => screen.queryByRole('toolbar', { name: /^Journey/ })
const count = () => panel()?.querySelector('[aria-live]')?.textContent

function setHash(hash: string) {
  window.history.replaceState(null, '', `/${hash}`)
}

beforeEach(() => setHash(''))
afterEach(() => {
  setHash('')
  vi.useRealTimers()
})

async function startTour() {
  const user = userEvent.setup()
  render(<TakeSix document={tourDoc()} menu syncUrl />)
  await user.click(screen.getByRole('button', { name: 'TakeSix menu' }))
  await user.click(screen.getByRole('menuitemradio', { name: /^Tour/ }))
  return user
}

describe('journeys', () => {
  it('lists the journeys in the menu and starts one', async () => {
    await startTour()
    expect(count()).toBe('1 / 3Overview')
    expect(window.location.hash).toBe('#journey=tour&step=1')
    expect(panel()).toBeTruthy()
  })

  it('steps with the buttons and the keys, writing the step into the URL', async () => {
    const user = await startTour()
    await user.click(screen.getByRole('button', { name: 'Pause' }))
    await user.click(screen.getByRole('button', { name: 'Next step' }))
    expect(heading()).toBe('API')
    expect(window.location.hash).toBe('#in=api&journey=tour&step=2')
    ;(document.activeElement as HTMLElement).blur()
    fireEvent.keyDown(window, { key: ' ' })
    await waitFor(() => expect(heading()).toBe('Shop'), { timeout: 3000 })
    expect(count()).toBe('3 / 3Storage')
    expect(document.querySelector('[data-block-id="db"]')!.className).toMatch(/cardHighlighted/)
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(count()).toBe('2 / 3The API')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(panel()).toBeNull()
    expect(window.location.hash).toBe('#in=api')
  })

  it('plays on a timer and pauses', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<TakeSix document={tourDoc()} menu syncUrl />)
    await user.click(screen.getByRole('button', { name: 'TakeSix menu' }))
    await user.click(screen.getByRole('menuitemradio', { name: /^Tour/ }))
    // Overview has no duration: the default 6 s
    act(() => { vi.advanceTimersByTime(5900) })
    expect(count()).toBe('1 / 3Overview')
    act(() => { vi.advanceTimersByTime(200) })
    expect(count()).toBe('2 / 3The API')
    await user.click(screen.getByRole('button', { name: 'Pause' }))
    act(() => { vi.advanceTimersByTime(10000) })
    expect(count()).toBe('2 / 3The API')
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy()
  })

  it('reopens on the step in the URL', () => {
    setHash('#journey=tour&step=2')
    render(<TakeSix document={tourDoc()} syncUrl />)
    expect(heading()).toBe('API')
    expect(count()).toBe('2 / 3The API')
  })

  it('keeps the screen the reader moved to, with the journey step', () => {
    setHash('#in=orders&journey=tour&step=2')
    render(<TakeSix document={tourDoc()} syncUrl />)
    expect(heading()).toBe('Orders')
    expect(count()).toBe('2 / 3The API')
  })

  it('ignores an unknown journey and clamps the step', () => {
    setHash('#journey=nope&step=2')
    const { unmount } = render(<TakeSix document={tourDoc()} syncUrl />)
    expect(panel()).toBeNull()
    expect(heading()).toBe('Shop')
    unmount()
    setHash('#journey=short&step=9')
    render(<TakeSix document={tourDoc()} syncUrl />)
    expect(count()).toBe('1 / 1Short')
  })

  it('shows no New journey in a read-only diagram', async () => {
    const user = userEvent.setup()
    render(<TakeSix document={tourDoc()} menu />)
    await user.click(screen.getByRole('button', { name: 'TakeSix menu' }))
    expect(screen.queryByRole('menuitem', { name: 'New journey' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit journey' })).toBeNull()
  })

  it('makes a journey: new, add screens, caption, remove a step, delete', async () => {
    const user = userEvent.setup()
    let latest: TakeSixDocument | undefined
    function Host() {
      const [doc, setDoc] = useState<TakeSixDocument>(() => ({ ...tourDoc(), journeys: undefined }))
      latest = doc
      return <TakeSix document={doc} onChange={setDoc} menu />
    }
    render(<Host />)
    await user.click(screen.getByRole('button', { name: 'TakeSix menu' }))
    await user.click(screen.getByRole('menuitem', { name: 'New journey' }))
    expect(count()).toBe('No steps yetJourney 1')

    const edit = () => user.click(screen.getByRole('button', { name: 'Edit journey' }))
    await user.click(screen.getByRole('button', { name: 'Add this screen as a step' }))
    await user.click(screen.getByRole('button', { name: 'Zoom into API' }))
    await user.click(screen.getByRole('button', { name: 'Add this screen as a step' }))
    expect(latest!.journeys![0]!.steps).toEqual([{}, { in: 'api' }])
    expect(count()).toBe('2 / 2Journey 1')

    await edit()
    const caption = screen.getByRole('textbox', { name: 'Step caption' })
    await user.type(caption, 'Inside the API{Enter}')
    expect(latest!.journeys![0]!.steps[1]).toEqual({ in: 'api', label: 'Inside the API' })

    await user.click(screen.getByRole('button', { name: 'Remove this step' }))
    expect(latest!.journeys![0]!.steps).toEqual([{}])
    expect(count()).toBe('1 / 1Journey 1')

    await user.click(screen.getByRole('button', { name: 'Delete journey' }))
    expect(latest!.journeys).toBeUndefined()
    expect(panel()).toBeNull()
  })
})

describe('journeys controlled by the host', () => {
  it('shows the step the host picks and reports moves', async () => {
    const user = userEvent.setup()
    const seen: unknown[] = []
    function Host() {
      const [journey, setJourney] = useState<{ journey: string; step: number } | null>(null)
      return <>
        <button onClick={() => setJourney({ journey: 'short', step: 0 })}>start</button>
        <TakeSix document={tourDoc()} journey={journey} onJourneyChange={j => { seen.push(j); setJourney(j) }} />
      </>
    }
    render(<Host />)
    expect(panel()).toBeNull()
    await user.click(screen.getByRole('button', { name: 'start' }))
    await waitFor(() => expect(heading()).toBe('Orders'), { timeout: 3000 })
    expect(count()).toBe('1 / 1Short')
    await user.click(screen.getByRole('button', { name: 'Close journey' }))
    expect(seen).toEqual([null])
    expect(panel()).toBeNull()
  })
})

describe('the list of steps', () => {
  const rows = () => [...document.querySelectorAll('[data-step-go]')].map(r => r.textContent)

  it('lists every step and shows the one clicked', async () => {
    const user = await startTour()
    await user.click(screen.getByRole('button', { name: 'All steps' }))
    expect(rows()).toEqual(['1Overview' + 'Shop', '2The APIAPI', '3StorageDatabase'])
    expect(screen.getByRole('button', { current: 'step' }).textContent).toBe('1OverviewShop')
    await user.click(screen.getByRole('button', { name: /^3Storage/ }))
    await waitFor(() => expect(document.querySelector('[data-block-id="db"]')!.className).toMatch(/cardHighlighted/), { timeout: 3000 })
    expect(count()).toBe('3 / 3Storage')
    // Read-only: nothing to remove or drag
    expect(screen.queryByRole('button', { name: /^Remove step/ })).toBeNull()
  })

  function Host({ onDoc }: { onDoc: (doc: TakeSixDocument) => void }) {
    const [doc, setDoc] = useState<TakeSixDocument>(tourDoc)
    onDoc(doc)
    return <TakeSix document={doc} onChange={setDoc} menu />
  }

  async function startEditable() {
    const user = userEvent.setup()
    let latest!: TakeSixDocument
    render(<Host onDoc={d => { latest = d }} />)
    await user.click(screen.getByRole('button', { name: 'TakeSix menu' }))
    await user.click(screen.getByRole('menuitemradio', { name: /^Tour/ }))
    await user.click(screen.getByRole('button', { name: 'Pause' }))
    await user.click(screen.getByRole('button', { name: 'All steps' }))
    return { user, doc: () => latest }
  }
  const labels = (doc: TakeSixDocument) => doc.journeys![0]!.steps.map(s => s.label)

  it('removes a step, keeping the step on screen', async () => {
    const { user, doc } = await startEditable()
    // The list stays open while the reader picks steps
    await user.click(screen.getByRole('button', { name: /^2The API/ }))
    await user.click(screen.getByRole('button', { name: 'Remove step 1' }))
    expect(labels(doc())).toEqual(['The API', 'Storage'])
    expect(count()).toBe('1 / 2The API')
  })

  it('moves a step with Alt+arrows and by dragging, the step on screen following', async () => {
    const { user, doc } = await startEditable()
    screen.getByRole('button', { name: /^1Overview/ }).focus()
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}')
    expect(labels(doc())).toEqual(['The API', 'Overview', 'Storage'])
    expect(count()).toBe('2 / 3Overview')
    expect(document.activeElement?.textContent).toBe('2OverviewShop')

    // Drag Storage (row 3) by its grip above the middle of row 2: it lands second
    const rowsEl = [...document.querySelectorAll('[data-step-go]')].map(b => b.closest('li')!)
    rowsEl.forEach((row, i) => { row.getBoundingClientRect = () => ({ top: i * 40, height: 40, bottom: i * 40 + 40 }) as DOMRect })
    const grip = rowsEl[2]!.querySelector('[data-step-grip]')!
    grip.setPointerCapture = () => {}
    fireEvent.pointerDown(grip, { button: 0, pointerId: 1, clientY: 100 })
    fireEvent.pointerMove(grip, { pointerId: 1, clientY: 50 })
    fireEvent.pointerUp(grip, { pointerId: 1, clientY: 50 })
    expect(labels(doc())).toEqual(['The API', 'Storage', 'Overview'])
    expect(count()).toBe('3 / 3Overview')
  })
})

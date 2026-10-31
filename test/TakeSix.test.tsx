import { act, createEvent, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { findBlock, getLevel, validateDocument, type TakeSixDocument } from '@takesix/core'
import { TakeSix } from '../src/index.js'

function sampleDoc(): TakeSixDocument {
  return {
    takesix: '1.0',
    title: 'Shop',
    description: 'Online shop architecture',
    blocks: [
      { id: 'web', title: 'Web app', description: 'Frontend' },
      {
        id: 'api',
        title: 'API',
        children: [
          { id: 'auth', title: 'Auth' },
          { id: 'orders', title: 'Orders' },
        ],
      },
      { id: 'db', title: 'Database' },
    ],
    links: [{ id: 'l1', from: 'web', to: 'api' }],
  }
}

/** Renders TakeSix in edit mode and exposes the latest document. */
function renderEditable(initial = sampleDoc()) {
  const latest = { doc: initial }
  const onChange = vi.fn((d: TakeSixDocument) => { latest.doc = d })
  function Harness() {
    const [doc, setDoc] = useState(initial)
    return <TakeSix document={doc} onChange={d => { onChange(d); setDoc(d) }} editing />
  }
  render(<Harness />)
  return { latest, onChange, user: userEvent.setup() }
}

// No breadcrumb on the top level: [] there.
const crumbs = () => {
  const nav = screen.queryByRole('navigation', { name: 'Breadcrumb' })
  return nav ? within(nav).getAllByRole('button').map(b => b.textContent) : []
}
const titles = () => screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)

describe('TakeSix (read-only)', () => {
  it('shows the top level as a pure view', () => {
    render(<TakeSix document={sampleDoc()} />)
    expect(crumbs()).toEqual([])
    expect(titles()).toEqual(['Web app', 'API', 'Database'])
    expect(screen.queryByRole('button', { name: 'Add block' })).toBeNull()
  })

  it('shows the document title and description as the top-level header', () => {
    render(<TakeSix document={sampleDoc()} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Shop')
    expect(screen.getByText('Online shop architecture')).toBeInTheDocument()
  })

  it('counts direct children instead of previewing them', () => {
    const doc = sampleDoc()
    doc.blocks[1]!.children![1]!.children = [{ id: 'deep', title: 'Deep' }]
    render(<TakeSix document={doc} />)
    expect(screen.getByRole('button', { name: 'Zoom into API' })).toHaveTextContent('2 more inside')
    expect(screen.queryByText('Auth')).toBeNull()
  })

  it('ignores editing without onChange', () => {
    render(<TakeSix document={sampleDoc()} editing />)
    expect(screen.queryByRole('button', { name: 'Add block' })).toBeNull()
  })

  it('drills into a block and back through the breadcrumb', async () => {
    const user = userEvent.setup()
    render(<TakeSix document={sampleDoc()} />)

    await user.click(screen.getByRole('button', { name: 'Zoom into API' }))
    expect(crumbs()).toEqual(['Shop', 'API'])
    expect(titles()).toEqual(['Auth', 'Orders'])
    // the header now describes the opened block
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('API')

    await user.click(screen.getByRole('button', { name: 'Shop' }))
    // zoom-out finishes after its animation timeout
    await act(() => new Promise(r => setTimeout(r, 400)))
    expect(crumbs()).toEqual([])
  })

  it('zooms out on a click on the breadcrumb strip, but not on the current crumb', async () => {
    const user = userEvent.setup()
    render(<TakeSix document={sampleDoc()} />)
    await user.click(screen.getByRole('button', { name: 'Zoom into API' }))

    await user.click(screen.getByRole('button', { name: 'API' }))
    expect(crumbs()).toEqual(['Shop', 'API'])

    await user.click(screen.getByRole('navigation', { name: 'Breadcrumb' }))
    await act(() => new Promise(r => setTimeout(r, 400)))
    expect(crumbs()).toEqual([])
  })

  it('opens a block on a click anywhere on its card, but not on its text', async () => {
    const user = userEvent.setup()
    const { container } = render(<TakeSix document={sampleDoc()} />)
    const card = () => container.querySelector('[data-block-id="api"]') as HTMLElement

    await user.click(screen.getByRole('heading', { name: 'API' }))
    expect(crumbs()).toEqual([])

    await user.click(card())
    expect(crumbs()).toEqual(['Shop', 'API'])
  })

  it('does not open a block while text in it is selected', () => {
    const { container } = render(<TakeSix document={sampleDoc()} />)
    const card = container.querySelector('[data-block-id="api"]') as HTMLElement
    const title = screen.getByRole('heading', { name: 'API' })
    window.getSelection()!.selectAllChildren(title)

    // The click that ends a drag-selection arrives with the selection still in place.
    fireEvent.click(card)
    expect(crumbs()).toEqual([])
    window.getSelection()!.removeAllRanges()
  })

  it('does not zoom from cards without children', async () => {
    const user = userEvent.setup()
    const { container } = render(<TakeSix document={sampleDoc()} />)
    const card = container.querySelector('[data-block-id="db"]') as HTMLElement
    expect(card.className).not.toMatch(/cardZoomable/)
    await user.click(card)
    expect(crumbs()).toEqual([])
  })

  it('shows an empty state', () => {
    render(<TakeSix document={{ takesix: '1.0', title: 'Empty', blocks: [] }} />)
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument()
  })
})

describe('TakeSix (editing)', () => {
  it('shows edit controls', () => {
    renderEditable()
    expect(screen.getByRole('button', { name: 'Add block' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete API' })).toBeInTheDocument()
  })

  it('adds blocks until the level is full', async () => {
    const { user, latest } = renderEditable()
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole('button', { name: 'Add block' }))
    expect(latest.doc.blocks).toHaveLength(6)
    expect(screen.queryByRole('button', { name: 'Add block' })).toBeNull()
    expect(validateDocument(latest.doc).valid).toBe(true)
  })

  it('deletes a block with its links', async () => {
    const { user, latest } = renderEditable()
    await user.click(screen.getByRole('button', { name: 'Delete Web app' }))
    expect(latest.doc.blocks.map(b => b.id)).toEqual(['api', 'db'])
    expect(latest.doc.links).toBeUndefined()
  })

  it('renames a block and ignores an empty title', async () => {
    const { user, latest } = renderEditable()
    const title = screen.getByRole('heading', { name: 'Database' })

    await user.clear(title)
    await user.type(title, 'Postgres{Enter}')
    expect(findBlock(latest.doc, 'db')?.title).toBe('Postgres')

    const renamed = screen.getByRole('heading', { name: 'Postgres' })
    await user.clear(renamed)
    await user.tab()
    expect(findBlock(latest.doc, 'db')?.title).toBe('Postgres')
  })

  it('links two blocks and unlinks them again', async () => {
    const { user, latest } = renderEditable()

    await user.click(screen.getByRole('button', { name: 'Connect from API' }))
    await user.click(screen.getByRole('button', { name: 'Connect to Database' }))
    expect(latest.doc.links?.map(l => [l.from, l.to])).toEqual([['web', 'api'], ['api', 'db']])

    await user.click(screen.getByRole('button', { name: 'Connect from Web app' }))
    await user.click(screen.getByRole('button', { name: 'Disconnect from API' }))
    expect(latest.doc.links?.map(l => [l.from, l.to])).toEqual([['api', 'db']])
  })

  it('reorders blocks by dragging the handle', () => {
    const { latest } = renderEditable()
    const card = (id: string) => document.querySelector(`[data-block-id="${id}"]`) as HTMLElement
    const handle = (id: string) => card(id).querySelector('[data-drag-handle]') as HTMLElement
    const dataTransfer = { setData: () => {}, effectAllowed: '' }

    // Without holding the handle the card does not start a drag
    expect(card('db')).toHaveAttribute('draggable', 'false')

    fireEvent.pointerDown(handle('db'))
    expect(card('db')).toHaveAttribute('draggable', 'true')
    fireEvent.dragStart(card('db'), { dataTransfer })
    // jsdom rects are all zero and its drag events carry no coordinates:
    // set clientX by hand, left of the middle means "before"
    const over = createEvent.dragOver(card('web'), { dataTransfer })
    Object.defineProperty(over, 'clientX', { value: -1 })
    fireEvent(card('web'), over)
    expect(card('web')).toHaveAttribute('data-drop', 'before')
    fireEvent.drop(card('web'), { dataTransfer })
    fireEvent.dragEnd(card('db'), { dataTransfer })

    expect(latest.doc.blocks.map(b => b.id)).toEqual(['db', 'web', 'api'])
    expect(card('web')).not.toHaveAttribute('data-drop')
  })

  it('does not open a block from its drag handle', async () => {
    const { user } = renderEditable()
    const handle = document.querySelector('[data-block-id="api"] [data-drag-handle]') as HTMLElement
    await user.click(handle)
    expect(crumbs()).toEqual([])
  })

  it('links blocks on different levels', async () => {
    const { user, latest } = renderEditable()
    await user.click(screen.getByRole('button', { name: 'Connect from Database' }))
    expect(screen.getByRole('status')).toHaveTextContent('Linking from Database')

    // open API while linking, then pick a block inside it
    await user.click(screen.getByRole('button', { name: 'Zoom into API' }))
    expect(crumbs()).toEqual(['Shop', 'API'])
    await user.click(screen.getByRole('button', { name: 'Connect to Auth' }))

    expect(latest.doc.links?.map(l => [l.from, l.to])).toEqual([['web', 'api'], ['db', 'auth']])
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('does not offer a block\'s ancestors or descendants as link targets', async () => {
    const { user } = renderEditable()
    await user.click(screen.getByRole('button', { name: 'Zoom into API' }))
    await user.click(screen.getByRole('button', { name: 'Connect from Auth' }))
    await user.click(screen.getByRole('button', { name: 'Shop' }))
    await act(() => new Promise(r => setTimeout(r, 400)))

    expect(screen.getByRole('status')).toHaveTextContent('Linking from Auth')
    expect(screen.getByRole('button', { name: 'Connect to Web app' })).toBeInTheDocument()
    // API contains Auth: not a target
    expect(screen.queryByRole('button', { name: 'Connect to API' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('edits a link: label, direction, reverse and delete', async () => {
    // Arrows are routed from card rects; give the cards some so the arrow exists in jsdom
    const rects: Record<string, DOMRect> = {
      web: new DOMRect(0, 0, 100, 60),
      api: new DOMRect(300, 0, 100, 60),
      db: new DOMRect(600, 0, 100, 60),
    }
    const original = HTMLElement.prototype.getBoundingClientRect
    HTMLElement.prototype.getBoundingClientRect = function () {
      const id = (this as HTMLElement).dataset.blockId
      return (id && rects[id]) || new DOMRect(0, 0, 1000, 600)
    }
    try {
      const { user, latest } = renderEditable()
      const link = () => latest.doc.links![0]!

      await user.click(await screen.findByRole('button', { name: 'Edit link Web app – API' }))
      const dialog = screen.getByRole('dialog', { name: 'Link' })
      expect(dialog).toHaveTextContent('Web app → API')

      const label = within(dialog).getByRole('textbox', { name: 'Label' })
      await user.type(label, 'REST{Enter}')
      expect(link().label).toBe('REST')

      await user.click(within(dialog).getByRole('button', { name: 'Both ways' }))
      expect(link().direction).toBe('both')
      // reverse only makes sense one way
      expect(within(dialog).getByRole('button', { name: 'Reverse' })).toBeDisabled()

      await user.click(within(dialog).getByRole('button', { name: 'One way' }))
      expect(link()).not.toHaveProperty('direction')
      await user.click(within(dialog).getByRole('button', { name: 'Reverse' }))
      expect([link().from, link().to]).toEqual(['api', 'web'])

      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete link' }))
      expect(latest.doc.links).toBeUndefined()
      expect(screen.queryByRole('dialog')).toBeNull()
    } finally {
      HTMLElement.prototype.getBoundingClientRect = original
    }
  })

  it('does not offer link editing outside edit mode', () => {
    render(<TakeSix document={sampleDoc()} />)
    expect(screen.queryByRole('button', { name: /Edit link/ })).toBeNull()
  })

  it('stores the top-level layout in the document', async () => {
    const { user, latest } = renderEditable()
    await user.click(screen.getByRole('button', { name: 'List layout' }))
    expect(latest.doc.layout).toBe('list')
    expect(screen.getByRole('button', { name: 'List layout' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('adds a first child and opens the block', async () => {
    const { user, latest } = renderEditable()
    await user.click(screen.getByRole('button', { name: 'Add child to Database' }))
    expect(getLevel(latest.doc, 'db')).toHaveLength(1)
    expect(crumbs()).toEqual(['Shop', 'Database'])
  })

  it('leaves a level that was deleted from outside', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<TakeSix document={sampleDoc()} />)
    await user.click(screen.getByRole('button', { name: 'Zoom into API' }))
    expect(crumbs()).toEqual(['Shop', 'API'])

    const doc = sampleDoc()
    rerender(<TakeSix document={{ ...doc, blocks: doc.blocks.filter(b => b.id !== 'api'), links: [] }} />)
    expect(crumbs()).toEqual([])
  })
})

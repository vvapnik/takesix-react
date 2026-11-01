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

  it('shows details in a side panel, only for blocks that have them', async () => {
    const user = userEvent.setup()
    const doc = sampleDoc()
    doc.blocks[0]!.details = 'Built with **React**'
    render(<TakeSix document={doc} />)

    expect(screen.queryByRole('button', { name: 'Details of Database' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Details of Web app' }))
    const panel = screen.getByRole('complementary', { name: 'Details: Web app' })
    expect(within(panel).getByText('React').tagName).toBe('STRONG')
    // the details button does not open the block
    expect(crumbs()).toEqual([])

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('complementary')).toBeNull()
  })

  it('offers the opened block\'s details in its header', async () => {
    const user = userEvent.setup()
    const doc = sampleDoc()
    doc.blocks[1]!.details = 'All public endpoints'
    render(<TakeSix document={doc} />)
    await user.click(screen.getByRole('button', { name: 'Zoom into API' }))
    await user.click(screen.getByRole('button', { name: 'Details of API' }))
    expect(screen.getByRole('complementary')).toHaveTextContent('All public endpoints')
  })

  it('follows the system theme by default and can force one', () => {
    const { container, rerender } = render(<TakeSix document={sampleDoc()} />)
    const root = () => container.firstElementChild as HTMLElement
    expect(root()).toHaveAttribute('data-theme', 'auto')
    rerender(<TakeSix document={sampleDoc()} theme="dark" />)
    expect(root()).toHaveAttribute('data-theme', 'dark')
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

  it('opens a block on a click anywhere on its card, its text included', async () => {
    const user = userEvent.setup()
    render(<TakeSix document={sampleDoc()} />)

    await user.click(screen.getByRole('heading', { name: 'API' }))
    expect(crumbs()).toEqual(['Shop', 'API'])
  })

  it('edits rather than opens when the text is clicked in edit mode', async () => {
    const { user } = renderEditable()
    await user.click(screen.getByRole('heading', { name: 'API' }))
    expect(crumbs()).toEqual([])
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

  it('moves a block into another one dropped on its middle', () => {
    const { latest } = renderEditable()
    const card = (id: string) => document.querySelector(`[data-block-id="${id}"]`) as HTMLElement
    const dataTransfer = { setData: () => {}, effectAllowed: '' }

    const db = card('db')
    fireEvent.pointerDown(db.querySelector('[data-drag-handle]')!)
    fireEvent.dragStart(db, { dataTransfer })
    // jsdom has no layout: give the target a box and point at its middle
    card('api').getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 200, height: 100 })
    const over = createEvent.dragOver(card('api'), { dataTransfer })
    Object.defineProperty(over, 'clientX', { value: 100 })
    Object.defineProperty(over, 'clientY', { value: 50 })
    fireEvent(card('api'), over)
    expect(card('api')).toHaveAttribute('data-drop', 'inside')
    fireEvent.drop(card('api'), { dataTransfer })
    fireEvent.dragEnd(db, { dataTransfer })

    expect(latest.doc.blocks.map(b => b.id)).toEqual(['web', 'api'])
    expect(getLevel(latest.doc, 'api').map(b => b.id)).toEqual(['auth', 'orders', 'db'])
  })

  it('moves a block up a level when dropped on a breadcrumb', async () => {
    const { latest, user } = renderEditable()
    await user.click(screen.getByRole('button', { name: 'Zoom into API' }))
    expect(crumbs()).toEqual(['Shop', 'API'])
    const card = (id: string) => document.querySelector(`[data-block-id="${id}"]`) as HTMLElement
    const dataTransfer = { setData: () => {}, effectAllowed: '' }

    fireEvent.pointerDown(card('auth').querySelector('[data-drag-handle]')!)
    fireEvent.dragStart(card('auth'), { dataTransfer })
    const shop = screen.getByRole('button', { name: 'Shop' })
    fireEvent.dragOver(shop, { dataTransfer })
    fireEvent.drop(shop, { dataTransfer })

    expect(latest.doc.blocks.map(b => b.id)).toEqual(['web', 'api', 'db', 'auth'])
    expect(getLevel(latest.doc, 'api').map(b => b.id)).toEqual(['orders'])
  })

  it('reorders blocks with the arrow keys on the drag handle', async () => {
    const { latest, user } = renderEditable()
    const handle = screen.getByRole('button', { name: 'Move Database' })

    handle.focus()
    await user.keyboard('{ArrowUp}')
    expect(latest.doc.blocks.map(b => b.id)).toEqual(['web', 'db', 'api'])
    // focus stays on the moved block, so it can keep going
    expect(screen.getByRole('button', { name: 'Move Database' })).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(latest.doc.blocks.map(b => b.id)).toEqual(['db', 'web', 'api'])
    // already first: nothing happens
    await user.keyboard('{ArrowUp}')
    expect(latest.doc.blocks.map(b => b.id)).toEqual(['db', 'web', 'api'])
    await user.keyboard('{ArrowDown}')
    expect(latest.doc.blocks.map(b => b.id)).toEqual(['web', 'db', 'api'])
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

  it('adds, edits and removes details in edit mode', async () => {
    const { user, latest } = renderEditable()
    await user.click(screen.getByRole('button', { name: 'Details of Database' }))
    const editor = screen.getByRole('textbox', { name: 'Details (Markdown)' })

    await user.type(editor, 'Primary store')
    await user.tab()
    expect(findBlock(latest.doc, 'db')?.details).toBe('Primary store')

    await user.clear(screen.getByRole('textbox', { name: 'Details (Markdown)' }))
    await user.tab()
    expect(findBlock(latest.doc, 'db')).not.toHaveProperty('details')
  })

  it('groups blocks to make room on a full level', async () => {
    const full = sampleDoc()
    full.blocks.push(
      { id: 'cdn', title: 'CDN' },
      { id: 'queue', title: 'Queue' },
      { id: 'mail', title: 'Mail' },
    )
    const { user, latest } = renderEditable(full)
    expect(screen.queryByRole('button', { name: 'Add block' })).toBeNull()
    expect(screen.getByText('6 of 6: group blocks to add more')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Group blocks' }))
    const bar = screen.getByRole('status')
    expect(within(bar).getByRole('button', { name: 'Group' })).toBeDisabled()

    // selecting does not open blocks
    await user.click(screen.getByRole('button', { name: 'Select Mail' }))
    await user.click(screen.getByRole('button', { name: 'Select Queue' }))
    expect(screen.getByRole('button', { name: 'Select Queue' })).toHaveAttribute('aria-pressed', 'true')
    expect(bar).toHaveTextContent('2 selected')
    await user.click(within(bar).getByRole('button', { name: 'Group' }))

    // the group takes the place of the first of them, in level order
    expect(latest.doc.blocks.map(b => b.id)).toHaveLength(5)
    const group = latest.doc.blocks[4]!
    expect(group).toMatchObject({ title: 'New group', description: '2 blocks' })
    expect(group.children!.map(b => b.id)).toEqual(['queue', 'mail'])
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('button', { name: 'Add block' })).toBeInTheDocument()
  })

  it('cancels grouping with Esc', async () => {
    const { user } = renderEditable()
    await user.click(screen.getByRole('button', { name: 'Group blocks' }))
    expect(screen.getByRole('button', { name: 'Select API' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('button', { name: 'Select API' })).toBeNull()
  })

  it('cycles a block\'s size with its size button', async () => {
    const { user, latest } = renderEditable()
    const card = () => document.querySelector('[data-block-id="db"]') as HTMLElement
    expect(card()).toHaveAttribute('data-size', 'M')

    await user.click(screen.getByRole('button', { name: 'Size of Database: half' }))
    expect(findBlock(latest.doc, 'db')?.size).toBe('L')
    await user.click(screen.getByRole('button', { name: 'Size of Database: two thirds' }))
    expect(findBlock(latest.doc, 'db')?.size).toBe('F')
    expect(card()).toHaveAttribute('data-size', 'F')
    await user.click(screen.getByRole('button', { name: 'Size of Database: full width' }))
    expect(findBlock(latest.doc, 'db')?.size).toBe('S')
    // back to the default: the field is dropped from the file
    await user.click(screen.getByRole('button', { name: 'Size of Database: a third' }))
    expect(findBlock(latest.doc, 'db')).not.toHaveProperty('size')
  })

  it('resizes a block by dragging its right edge, snapping to the sizes', () => {
    const { latest } = renderEditable()
    const card = document.querySelector('[data-block-id="db"]') as HTMLElement
    const grid = card.parentElement!
    // a 600px grid without gaps in jsdom: 100px per column, the card starts at 0
    grid.getBoundingClientRect = () => new DOMRect(0, 0, 600, 400)
    card.getBoundingClientRect = () => new DOMRect(0, 0, 300, 80)
    const handle = card.querySelector('[data-resize-handle]') as HTMLElement
    const move = (x: number) => {
      const e = createEvent.pointerMove(handle)
      Object.defineProperty(e, 'clientX', { value: x })
      fireEvent(handle, e)
    }

    fireEvent.pointerDown(handle)
    move(380) // 3.8 columns: closest size is L (4)
    expect(card).toHaveAttribute('data-size', 'L')
    move(590) // nearly the full width
    expect(card).toHaveAttribute('data-size', 'F')
    // nothing is saved until the pointer is released
    expect(findBlock(latest.doc, 'db')).not.toHaveProperty('size')
    fireEvent.pointerUp(handle)
    expect(findBlock(latest.doc, 'db')?.size).toBe('F')
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

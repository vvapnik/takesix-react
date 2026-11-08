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
      { id: 'web', title: 'Web app', description: 'Frontend', at: 'A1:C1' },
      {
        id: 'api',
        title: 'API',
        at: 'D1:F1',
        children: [
          { id: 'auth', title: 'Auth', at: 'A1:C1' },
          { id: 'orders', title: 'Orders', at: 'D1:F1' },
        ],
      },
      { id: 'db', title: 'Database', at: 'A2:F2' },
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

// jsdom has no layout: give the edit-mode cells a 100×80 box each
function layoutCells() {
  for (const el of document.querySelectorAll<HTMLElement>('[data-cell]')) {
    const [col, row] = el.dataset.cell!.split(',').map(Number)
    el.getBoundingClientRect = () => new DOMRect(col! * 100, row! * 80, 100, 80)
  }
}
const cell = (col: number, row: number) => document.querySelector(`[data-cell="${col},${row}"]`) as HTMLElement

/** A drag event with coordinates, which jsdom's drag events do not carry. */
function dragAt(type: 'dragStart' | 'dragOver', target: HTMLElement, x: number, y: number, dataTransfer: object) {
  const event = createEvent[type](target, { dataTransfer })
  Object.defineProperty(event, 'clientX', { value: x })
  Object.defineProperty(event, 'clientY', { value: y })
  fireEvent(target, event)
}
const dragOverAt = (target: HTMLElement, x: number, y: number, dataTransfer: object) => dragAt('dragOver', target, x, y, dataTransfer)

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
    doc.blocks[1]!.children![1]!.children = [{ id: 'deep', title: 'Deep', at: 'A1' }]
    render(<TakeSix document={doc} />)
    expect(screen.getByRole('button', { name: 'Zoom into API' })).toHaveTextContent('2 more inside')
    expect(screen.queryByText('Auth')).toBeNull()
  })

  it('opens a text block as a level: same header, the Markdown instead of a grid', async () => {
    const user = userEvent.setup()
    const doc = sampleDoc()
    doc.blocks[0]!.details = 'Built with **React**'
    render(<TakeSix document={doc} />)

    // The card says it opens into text, where others say what is inside
    const read = screen.getByRole('button', { name: 'Read Web app' })
    expect(read).toHaveTextContent('Read')
    expect(screen.queryByRole('button', { name: 'Read Database' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Details/ })).toBeNull()

    await user.click(read)
    expect(crumbs()).toEqual(['Shop', 'Web app'])
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Web app')
    expect(screen.getByText('Frontend')).toBeInTheDocument()
    expect(screen.getByText('React').tagName).toBe('STRONG')
    expect(screen.queryByRole('dialog')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Shop' }))
    await act(() => new Promise(r => setTimeout(r, 400)))
    expect(crumbs()).toEqual([])
  })

  it('does not open an empty text block outside edit mode', () => {
    const doc = sampleDoc()
    doc.blocks[2]!.details = ''
    render(<TakeSix document={doc} />)
    expect(screen.queryByRole('button', { name: 'Read Database' })).toBeNull()
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

  it('edits the header: the document on the top level, the opened block below it', async () => {
    const { user, latest } = renderEditable()
    const title = screen.getByRole('heading', { level: 1 })
    await user.click(title)
    await user.keyboard('{Control>}a{/Control}Store{Enter}')
    expect(latest.doc.title).toBe('Store')
    // the description can be cleared: the field leaves the file
    const description = screen.getByText('Online shop architecture')
    await user.click(description)
    await user.keyboard('{Control>}a{/Control}{Backspace}')
    await user.tab()
    expect(latest.doc).not.toHaveProperty('description')

    await user.click(screen.getByRole('button', { name: 'Zoom into API' }))
    const nested = screen.getByRole('heading', { level: 1 })
    expect(nested).toHaveTextContent('API')
    await user.click(nested)
    await user.keyboard('{Control>}a{/Control}Gateway{Enter}')
    expect(findBlock(latest.doc, 'api')?.title).toBe('Gateway')
  })

  it('keeps the level tools in the header, not above the grid', () => {
    renderEditable()
    const tools = screen.getByRole('group', { name: 'Level tools' })
    // Level tools → header actions → the header, which holds the title
    expect(tools.parentElement!.parentElement).toContainElement(screen.getByRole('heading', { level: 1 }))
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

  it('moves a block to a free place by dragging the handle', () => {
    const { latest } = renderEditable()
    const card = (id: string) => document.querySelector(`[data-block-id="${id}"]`) as HTMLElement
    const handle = (id: string) => card(id).querySelector('[data-drag-handle]') as HTMLElement
    const dataTransfer = { setData: () => {}, effectAllowed: '' }

    // Without holding the handle the card does not start a drag
    expect(card('db')).toHaveAttribute('draggable', 'false')

    fireEvent.pointerDown(handle('db'))
    expect(card('db')).toHaveAttribute('draggable', 'true')
    // grabbed at the card's top-left corner (its rect is all zero in jsdom)
    dragAt('dragStart', card('db'), 0, 0, dataTransfer)
    layoutCells()
    // A taken place is shown but not accepted
    dragOverAt(cell(0, 0), 10, 10, dataTransfer)
    fireEvent.drop(cell(0, 0), { dataTransfer })
    expect(findBlock(latest.doc, 'db')?.at).toBe('A2:F2')

    fireEvent.pointerDown(handle('db'))
    dragAt('dragStart', card('db'), 0, 0, dataTransfer)
    layoutCells()
    dragOverAt(cell(0, 2), 10, 170, dataTransfer)
    fireEvent.drop(cell(0, 2), { dataTransfer })
    fireEvent.dragEnd(card('db'), { dataTransfer })

    expect(findBlock(latest.doc, 'db')?.at).toBe('A3:F3')
    expect(validateDocument(latest.doc).valid).toBe(true)
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

  it('moves and resizes a block with the arrow keys on the drag handle', async () => {
    const { latest, user } = renderEditable()
    const at = () => findBlock(latest.doc, 'db')?.at

    screen.getByRole('button', { name: 'Move Database' }).focus()
    await user.keyboard('{ArrowDown}')
    expect(at()).toBe('A3:F3')
    // focus stays on the moved block, so it can keep going
    expect(screen.getByRole('button', { name: 'Move Database' })).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(at()).toBe('A2:F2')
    // the row above is taken: nothing happens
    await user.keyboard('{ArrowUp}')
    expect(at()).toBe('A2:F2')
    // with Shift the arrows resize
    await user.keyboard('{Shift>}{ArrowLeft}{ArrowDown}{/Shift}')
    expect(at()).toBe('A2:E3')
    await user.keyboard('{ArrowRight}')
    expect(at()).toBe('B2:F3')
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

  it('marks arrows that run through a block, in edit mode only', () => {
    const doc: TakeSixDocument = {
      takesix: '1.0',
      title: 'Row',
      blocks: [
        { id: 'a', title: 'A', at: 'A1:B1' },
        { id: 'b', title: 'B', at: 'C1:D1' },
        { id: 'c', title: 'C', at: 'E1:F1' },
      ],
      links: [{ id: 'l', from: 'a', to: 'c' }],
    }
    // Arrows are routed from card rects: give the cards some in jsdom
    const rects: Record<string, DOMRect> = {
      a: new DOMRect(0, 0, 100, 60), b: new DOMRect(200, 0, 100, 60), c: new DOMRect(400, 0, 100, 60),
    }
    const original = HTMLElement.prototype.getBoundingClientRect
    HTMLElement.prototype.getBoundingClientRect = function () {
      const id = (this as HTMLElement).dataset.blockId
      return (id && rects[id]) || new DOMRect(0, 0, 1000, 600)
    }
    try {
      const { rerender } = render(<TakeSix document={doc} onChange={() => {}} />)
      expect(screen.queryByText(/layout hint/)).toBeNull()
      expect(document.querySelector('[data-layout-warning]')).toBeNull()

      rerender(<TakeSix document={doc} onChange={() => {}} editing />)
      const hint = screen.getByText('1 layout hint')
      expect(hint).toHaveAttribute('title', expect.stringContaining('has block "b" in its way'))
      expect(document.querySelector('[data-link="a|c"]')).toHaveAttribute('data-layout-warning')
    } finally {
      HTMLElement.prototype.getBoundingClientRect = original
    }
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

  it('turns an empty block into a text block and edits the text on its level', async () => {
    const { user, latest } = renderEditable()
    await user.click(screen.getByRole('button', { name: 'Add text inside Database' }))
    expect(findBlock(latest.doc, 'db')?.details).toBe('')
    expect(crumbs()).toEqual(['Shop', 'Database'])
    // A text block holds no blocks: no grid to add to
    expect(screen.queryByRole('button', { name: 'Add block' })).toBeNull()

    const editor = screen.getByRole('textbox', { name: 'Text of Database (Markdown)' })
    await user.type(editor, 'Primary store')
    await user.tab()
    expect(findBlock(latest.doc, 'db')?.details).toBe('Primary store')
    // With text, it stays a text block
    expect(screen.queryByRole('button', { name: /Blocks instead/ })).toBeNull()

    // Emptied, it may become a block of blocks again
    await user.clear(screen.getByRole('textbox', { name: 'Text of Database (Markdown)' }))
    await user.tab()
    expect(findBlock(latest.doc, 'db')?.details).toBe('')
    await user.click(screen.getByRole('button', { name: /Blocks instead/ }))
    expect(findBlock(latest.doc, 'db')).not.toHaveProperty('details')
    expect(getLevel(latest.doc, 'db')).toHaveLength(1)
  })

  it('offers no way to add text to a block with children, or blocks to one with text', () => {
    const doc = sampleDoc()
    doc.blocks[0]!.details = 'Some text'
    renderEditable(doc)
    expect(screen.queryByRole('button', { name: 'Add text inside API' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add blocks inside Web app' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Read Web app' })).toBeInTheDocument()
  })

  it('groups blocks to make room on a full level', async () => {
    const full = sampleDoc()
    full.blocks.push(
      { id: 'cdn', title: 'CDN', at: 'A3:F3' },
      { id: 'queue', title: 'Queue', at: 'A4:F4' },
      { id: 'mail', title: 'Mail', at: 'A5:F5' },
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

    // the group covers the place of both, which keep their arrangement inside
    expect(latest.doc.blocks.map(b => b.id)).toHaveLength(5)
    const group = latest.doc.blocks[4]!
    expect(group).toMatchObject({ title: 'New group', description: '2 blocks', at: 'A4:F5' })
    expect(group.children!.map(b => [b.id, b.at])).toEqual([['queue', 'A1:F1'], ['mail', 'A2:F2']])
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

  it('adds a block in a free cell when it is clicked', async () => {
    const { user, latest } = renderEditable()
    expect(screen.queryByRole('button', { name: 'Add block at A1' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Add block at B3' }))
    // half the grid wide when there is room
    expect(latest.doc.blocks.at(-1)).toMatchObject({ title: 'New block', at: 'B3:D3' })
  })

  it('resizes a block by dragging its corner, snapping to the cells', () => {
    const { latest } = renderEditable()
    const card = document.querySelector('[data-block-id="db"]') as HTMLElement
    const handle = card.querySelector('[data-resize-handle]') as HTMLElement
    layoutCells()
    const move = (x: number, y: number) => {
      const e = createEvent.pointerMove(handle)
      Object.defineProperty(e, 'clientX', { value: x })
      Object.defineProperty(e, 'clientY', { value: y })
      fireEvent(handle, e)
    }

    fireEvent.pointerDown(handle)
    move(250, 100) // cell C2
    expect(card).toHaveAttribute('data-at', 'A2:C2')
    move(350, 180) // cell D3
    expect(card).toHaveAttribute('data-at', 'A2:D3')
    // nothing is saved until the pointer is released
    expect(findBlock(latest.doc, 'db')?.at).toBe('A2:F2')
    fireEvent.pointerUp(handle)
    expect(findBlock(latest.doc, 'db')?.at).toBe('A2:D3')
  })

  it('adds a first child and opens the block', async () => {
    const { user, latest } = renderEditable()
    await user.click(screen.getByRole('button', { name: 'Add blocks inside Database' }))
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

import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { findBlock, getLevel, validateDocument, type TakeSixDocument } from '@takesix/core'
import { TakeSix } from '../src/index.js'

function sampleDoc(): TakeSixDocument {
  return {
    takesix: '1.0',
    title: 'Shop',
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

/** Renders an editable TakeSix and exposes the latest document. */
function renderEditable(initial = sampleDoc()) {
  const latest = { doc: initial }
  const onChange = vi.fn((d: TakeSixDocument) => { latest.doc = d })
  function Harness() {
    const [doc, setDoc] = useState(initial)
    return <TakeSix document={doc} onChange={d => { onChange(d); setDoc(d) }} />
  }
  render(<Harness />)
  return { latest, onChange, user: userEvent.setup() }
}

const crumbs = () => within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getAllByRole('button').map(b => b.textContent)
const titles = () => screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)

describe('TakeSix (read-only)', () => {
  it('shows the top level and no edit controls', () => {
    render(<TakeSix document={sampleDoc()} />)
    expect(crumbs()).toEqual(['Shop'])
    expect(titles()).toEqual(['Web app', 'API', 'Database'])
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add block' })).toBeNull()
  })

  it('drills into a block and back through the breadcrumb', async () => {
    const user = userEvent.setup()
    render(<TakeSix document={sampleDoc()} />)

    await user.click(screen.getByRole('button', { name: 'Zoom into API' }))
    expect(crumbs()).toEqual(['Shop', 'API'])
    // header of the opened block + its children
    expect(titles()).toEqual(['API', 'Auth', 'Orders'])

    await user.click(screen.getByRole('button', { name: 'Shop' }))
    // zoom-out finishes after its animation timeout
    await act(() => new Promise(r => setTimeout(r, 400)))
    expect(crumbs()).toEqual(['Shop'])
  })

  it('shows an empty state', () => {
    render(<TakeSix document={{ takesix: '1.0', title: 'Empty', blocks: [] }} />)
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument()
  })
})

describe('TakeSix (editing)', () => {
  it('toggles edit mode', async () => {
    const { user } = renderEditable()
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('button', { name: 'Done' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Add block' })).toBeInTheDocument()
  })

  it('adds blocks until the level is full', async () => {
    const { user, latest } = renderEditable()
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole('button', { name: 'Add block' }))
    expect(latest.doc.blocks).toHaveLength(6)
    expect(screen.queryByRole('button', { name: 'Add block' })).toBeNull()
    expect(validateDocument(latest.doc).valid).toBe(true)
  })

  it('deletes a block with its links', async () => {
    const { user, latest } = renderEditable()
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('button', { name: 'Delete Web app' }))
    expect(latest.doc.blocks.map(b => b.id)).toEqual(['api', 'db'])
    expect(latest.doc.links).toBeUndefined()
  })

  it('renames a block and ignores an empty title', async () => {
    const { user, latest } = renderEditable()
    await user.click(screen.getByRole('button', { name: 'Edit' }))
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
    await user.click(screen.getByRole('button', { name: 'Edit' }))

    await user.click(screen.getByRole('button', { name: 'Connect from API' }))
    await user.click(screen.getByRole('button', { name: 'Connect to Database' }))
    expect(latest.doc.links?.map(l => [l.from, l.to])).toEqual([['web', 'api'], ['api', 'db']])

    await user.click(screen.getByRole('button', { name: 'Connect from Web app' }))
    await user.click(screen.getByRole('button', { name: 'Disconnect from API' }))
    expect(latest.doc.links?.map(l => [l.from, l.to])).toEqual([['api', 'db']])
  })

  it('stores the top-level layout in the document', async () => {
    const { user, latest } = renderEditable()
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('button', { name: 'List layout' }))
    expect(latest.doc.layout).toBe('list')
    expect(screen.getByRole('button', { name: 'List layout' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('adds a first child and opens the block', async () => {
    const { user, latest } = renderEditable()
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('button', { name: 'Add child to Database' }))
    expect(getLevel(latest.doc, 'db')).toHaveLength(1)
    expect(crumbs()).toEqual(['Shop', 'Database'])
  })

  it('leaves a level that was deleted from outside', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<TakeSix document={sampleDoc()} onChange={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Zoom into API' }))
    expect(crumbs()).toEqual(['Shop', 'API'])

    const doc = sampleDoc()
    rerender(<TakeSix document={{ ...doc, blocks: doc.blocks.filter(b => b.id !== 'api'), links: [] }} onChange={() => {}} />)
    expect(crumbs()).toEqual(['Shop'])
  })
})

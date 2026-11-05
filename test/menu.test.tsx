import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { TakeSixDocument } from '@takesix/core'
import { createEditorLink, MAX_LINK_LENGTH, readDocumentFromHash, TakeSix } from '../src/index.js'
import pkg from '../package.json'

const doc: TakeSixDocument = {
  takesix: '1.0',
  title: 'Shop system',
  blocks: [
    { id: 'web', title: 'Web app', description: 'Frontend — ünïcødé', at: 'A1:C1' },
    { id: 'api', title: 'API', at: 'D1:F1' },
  ],
}

/** A document whose JSON does not compress well, so its link is long. */
function bigDocument(): TakeSixDocument {
  let seed = 1
  const noise = () => Array.from({ length: 60_000 }, () => {
    seed = (seed * 48271) % 2147483647
    return String.fromCharCode(33 + (seed % 90))
  }).join('')
  return { ...doc, blocks: doc.blocks.map(b => ({ ...b, details: noise() })) }
}

describe('editor links', () => {
  it('round-trips a document through the URL fragment', async () => {
    const link = await createEditorLink(doc, 'https://example.test/editor/')
    expect(link).toMatch(/^https:\/\/example\.test\/editor\/#takesix=[A-Za-z0-9_-]+$/)
    expect(await readDocumentFromHash(new URL(link!).hash)).toEqual(doc)
  })

  it('returns null for a document too big for a link', async () => {
    expect(await createEditorLink(bigDocument())).toBeNull()
    expect(MAX_LINK_LENGTH).toBeGreaterThan(10_000)
  })

  it('reads nothing from a fragment without a document', async () => {
    expect(await readDocumentFromHash('')).toBeUndefined()
    expect(await readDocumentFromHash('#other=1')).toBeUndefined()
  })

  it('throws on damaged data', async () => {
    await expect(readDocumentFromHash('#takesix=AAAA')).rejects.toThrow()
  })
})

describe('menu', () => {
  it('is hidden unless asked for, and while editing', () => {
    const { rerender } = render(<TakeSix document={doc} />)
    expect(screen.queryByRole('button', { name: 'TakeSix menu' })).toBeNull()
    rerender(<TakeSix document={doc} menu onChange={() => {}} editing />)
    expect(screen.queryByRole('button', { name: 'TakeSix menu' })).toBeNull()
  })

  it('links to the editor with the document and shows the version', async () => {
    const user = userEvent.setup()
    render(<TakeSix document={doc} menu={{ editorUrl: 'https://example.test/editor/' }} />)
    await user.click(screen.getByRole('button', { name: 'TakeSix menu' }))
    const item = screen.getByRole('menuitem', { name: 'Open in editor' })
    await waitFor(() => expect(item).toHaveAttribute('href'))
    expect(await readDocumentFromHash(new URL(item.getAttribute('href')!).hash)).toEqual(doc)
    expect(item).toHaveAttribute('target', '_blank')
    expect(screen.getByText(`TakeSix v${pkg.version}`)).toBeInTheDocument()
    // Without an HTML source only JSON can be saved
    expect(screen.queryByRole('menuitem', { name: 'HTML' })).toBeNull()
  })

  it('shows an error instead of opening a diagram that is too big', async () => {
    const user = userEvent.setup()
    const openLink = vi.fn()
    render(<TakeSix document={bigDocument()} menu={{ openLink }} />)
    await user.click(screen.getByRole('button', { name: 'TakeSix menu' }))
    const item = screen.getByRole('menuitem', { name: 'Open in editor' })
    await waitFor(() => expect(item).toHaveAttribute('aria-disabled', 'false'))
    await user.click(item)
    expect(screen.getByRole('alert')).toHaveTextContent('Big Diagrams export coming soon')
    expect(openLink).not.toHaveBeenCalled()
  })

  it('hands links and files to the host when it asks to', async () => {
    const user = userEvent.setup()
    const openLink = vi.fn()
    const download = vi.fn()
    render(<TakeSix document={doc} menu={{ openLink, download, html: () => '<!doctype html><p>page</p>' }} />)
    const fab = screen.getByRole('button', { name: 'TakeSix menu' })

    await user.click(fab)
    const item = screen.getByRole('menuitem', { name: 'Open in editor' })
    await waitFor(() => expect(item).toHaveAttribute('href'))
    await user.click(item)
    expect(openLink).toHaveBeenCalledWith(expect.stringContaining('#takesix='))

    await user.click(fab)
    await user.click(screen.getByRole('menuitem', { name: 'JSON' }))
    expect(download).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'shop-system.takesix.json', mimeType: 'application/json' }))
    expect(JSON.parse(download.mock.lastCall![0].text)).toEqual(doc)

    await user.click(fab)
    await user.click(screen.getByRole('menuitem', { name: 'HTML' }))
    expect(download).toHaveBeenLastCalledWith({ name: 'shop-system.html', mimeType: 'text/html', text: '<!doctype html><p>page</p>' })
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    render(<TakeSix document={doc} menu />)
    await user.click(screen.getByRole('button', { name: 'TakeSix menu' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

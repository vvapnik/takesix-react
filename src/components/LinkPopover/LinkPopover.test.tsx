import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Link } from '@takesix/core'
import { describe, expect, it, vi } from 'vitest'
import { LinkPopover } from './index.js'

const link: Link = { from: 'web', to: 'api', label: 'calls' }
const titles: Record<string, string> = { web: 'Web app', api: 'API' }

function setup(links: Link[] = [link]) {
  const handlers = { onUpdate: vi.fn(), onRemove: vi.fn(), onClose: vi.fn() }
  render(<LinkPopover links={links} x={0} y={0} titleOf={id => titles[id] ?? id} {...handlers} />)
  return handlers
}

describe('LinkPopover', () => {
  it('names one link or several', () => {
    setup([link, { from: 'api', to: 'web' }])
    expect(screen.getByRole('dialog', { name: '2 links' })).toBeInTheDocument()
  })

  it('reverses and deletes a link', async () => {
    const { onUpdate, onRemove } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Reverse' }))
    expect(onUpdate).toHaveBeenCalledWith(link, { from: 'api', to: 'web' })
    await userEvent.click(screen.getByRole('button', { name: 'Delete link' }))
    expect(onRemove).toHaveBeenCalledWith(link)
  })

  it('closes on the close button and on Escape', async () => {
    const { onClose } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})

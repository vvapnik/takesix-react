import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Block } from '@takesix/core'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { BlockCard } from './index.js'

const block: Block = { id: 'web', title: 'Web app', description: 'Frontend', at: 'A1:C2', children: [] }

function setup(props: Partial<ComponentProps<typeof BlockCard>> = {}) {
  const all: ComponentProps<typeof BlockCard> = {
    block, area: { col: 0, row: 0, width: 3, height: 2 }, editing: false,
    onRename: vi.fn(), onDescribe: vi.fn(), onOpenShapes: vi.fn(), onDelete: vi.fn(),
    onAddChild: vi.fn(), onAddText: vi.fn(), onDrillIn: vi.fn(),
    connectingFrom: null, canLinkTo: false, isConnected: false,
    onStartConnect: vi.fn(), onConnectTarget: vi.fn(), onRegisterEl: vi.fn(),
    isDragged: false, isDropTarget: false, onDragStartBlock: vi.fn(), onDragEndBlock: vi.fn(),
    onNudge: vi.fn(), selectable: false, selected: false, onToggleSelect: vi.fn(),
    cellAt: () => null, canPlace: () => true, onPlace: vi.fn(),
    ...props,
  }
  const { container } = render(<BlockCard {...all} />)
  return { props: all, card: container.querySelector<HTMLElement>('[data-block-id="web"]')! }
}

describe('BlockCard', () => {
  it('shows the title and description and its place', () => {
    const { card } = setup()
    expect(screen.getByText('Web app')).toBeInTheDocument()
    expect(screen.getByText('Frontend')).toBeInTheDocument()
    expect(card.dataset.at).toBe('A1:C2')
  })

  it('has no edit controls when reading', () => {
    setup()
    expect(screen.queryByRole('button', { name: 'Delete Web app' })).toBeNull()
  })

  it('deletes the block in edit mode', async () => {
    const { props } = setup({ editing: true })
    await userEvent.click(screen.getByRole('button', { name: 'Delete Web app' }))
    expect(props.onDelete).toHaveBeenCalledWith('web')
  })

  it('offers a link button only with onCopyLink', async () => {
    const onCopyLink = vi.fn(async () => true)
    setup({ onCopyLink })
    await userEvent.click(screen.getByRole('button', { name: 'Copy link to Web app' }))
    expect(onCopyLink).toHaveBeenCalledWith('web')
  })
})

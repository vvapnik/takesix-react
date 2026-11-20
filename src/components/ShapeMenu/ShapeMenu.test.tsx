import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ShapeMenu } from './index.js'

function setup(value: 'process' | 'decision' = 'process') {
  const onPick = vi.fn()
  const onClose = vi.fn()
  render(<ShapeMenu value={value} x={0} y={0} onPick={onPick} onClose={onClose} />)
  return { onPick, onClose }
}

describe('ShapeMenu', () => {
  it('marks and focuses the current shape', () => {
    setup('decision')
    const current = screen.getByRole('radio', { checked: true })
    expect(current).toHaveAccessibleName('Decision')
    expect(current).toHaveFocus()
  })

  it('picks another shape and closes', async () => {
    const { onPick, onClose } = setup()
    await userEvent.click(screen.getByRole('radio', { name: 'Decision' }))
    expect(onPick).toHaveBeenCalledWith('decision')
    expect(onClose).toHaveBeenCalled()
  })

  it('closes without a pick on the current shape or Escape', async () => {
    const { onPick, onClose } = setup()
    await userEvent.click(screen.getByRole('radio', { checked: true }))
    await userEvent.keyboard('{Escape}')
    expect(onPick).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})

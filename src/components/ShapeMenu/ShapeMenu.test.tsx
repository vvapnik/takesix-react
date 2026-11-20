import { fireEvent, render, screen, within } from '@testing-library/react'
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

  it('picks a tone, neutral as none, and a colour of its own', async () => {
    const onPickTone = vi.fn()
    const onClose = vi.fn()
    render(<ShapeMenu value="process" tone="accent" x={0} y={0} onPick={vi.fn()} onPickTone={onPickTone} onClose={onClose} />)
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Shape and colour')
    const colours = screen.getByRole('radiogroup', { name: 'Colour' })
    expect(within(colours).getByRole('radio', { checked: true })).toHaveAccessibleName('Accent')
    await userEvent.click(within(colours).getByRole('radio', { name: 'Danger' }))
    expect(onPickTone).toHaveBeenLastCalledWith('danger')
    await userEvent.click(within(colours).getByRole('radio', { name: 'Neutral' }))
    expect(onPickTone).toHaveBeenLastCalledWith(undefined)
    const input = document.querySelector<HTMLInputElement>('input[type="color"]')!
    fireEvent.change(input, { target: { value: '#123456' } })
    input.dispatchEvent(new Event('change'))
    expect(onPickTone).toHaveBeenLastCalledWith('#123456')
  })

  it('marks a colour of its own as chosen', () => {
    render(<ShapeMenu value="process" tone="#abc" x={0} y={0} onPick={vi.fn()} onPickTone={vi.fn()} onClose={vi.fn()} />)
    const colours = screen.getByRole('radiogroup', { name: 'Colour' })
    expect(within(colours).getByRole('radio', { checked: true })).toHaveAccessibleName('Your colour')
    expect(document.querySelector<HTMLInputElement>('input[type="color"]')!.value).toBe('#aabbcc')
  })

  it('has no colours without onPickTone', () => {
    setup()
    expect(screen.queryByRole('radiogroup', { name: 'Colour' })).toBeNull()
  })
})

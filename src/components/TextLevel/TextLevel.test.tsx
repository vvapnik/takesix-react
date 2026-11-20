import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TextLevel } from './index.js'

const block = { id: 'notes', title: 'Notes', at: 'A1', details: 'Some **bold** text' }

describe('TextLevel', () => {
  it('renders the Markdown when reading', () => {
    render(<TextLevel block={block} editing={false} onChange={() => {}} />)
    expect(screen.getByText('bold').tagName).toBe('STRONG')
  })

  it('says when there is no text yet', () => {
    render(<TextLevel block={{ ...block, details: '' }} editing={false} onChange={() => {}} />)
    expect(screen.getByText('No text yet')).toBeInTheDocument()
  })

  it('saves the edited source on blur, only when it changed', async () => {
    const onChange = vi.fn()
    render(<TextLevel block={block} editing onChange={onChange} />)
    const editor = screen.getByRole('textbox', { name: 'Text of Notes (Markdown)' })
    await userEvent.click(editor)
    await userEvent.tab()
    expect(onChange).not.toHaveBeenCalled()
    await userEvent.type(editor, '!')
    await userEvent.tab()
    expect(onChange).toHaveBeenCalledWith('Some **bold** text!')
  })
})

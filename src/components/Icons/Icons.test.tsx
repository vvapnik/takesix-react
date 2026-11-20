import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BlockIcon } from './index.js'

describe('BlockIcon', () => {
  it('shows an emoji as text', () => {
    const { container } = render(<BlockIcon icon="🛒" />)
    expect(container.textContent).toBe('🛒')
  })

  it('shows inline SVG as an image and adds the namespace', () => {
    const { container } = render(<BlockIcon icon='<svg viewBox="0 0 1 1"></svg>' />)
    const src = decodeURIComponent(container.querySelector('img')!.getAttribute('src')!)
    expect(src).toContain('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1">')
  })
})

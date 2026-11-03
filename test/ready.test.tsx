import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TakeSix } from '../src/index.js'

const doc = { takesix: '1.0', title: 'Shop', blocks: [{ id: 'web', title: 'Web app', at: 'A1:C1' }] }

/** A browser font API whose fonts are still loading until `finish` is called. */
function mockFonts() {
  let finish!: () => void
  const ready = new Promise<void>(resolve => { finish = resolve })
  const fonts = {
    status: 'loading' as FontFaceSetLoadStatus,
    ready,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  Object.defineProperty(document, 'fonts', { value: fonts, configurable: true })
  return {
    finish: async () => {
      fonts.status = 'loaded'
      finish()
      await act(() => ready)
    },
  }
}

describe('waiting for styles and fonts', () => {
  afterEach(() => {
    delete (document as { fonts?: unknown }).fonts
    vi.restoreAllMocks()
  })

  it('shows the diagram right away when the browser has no font API', () => {
    const { container } = render(<TakeSix document={doc} />)
    expect((container.firstElementChild as HTMLElement).style.visibility).toBe('')
  })

  it('keeps the diagram invisible until its fonts have loaded', async () => {
    // jsdom applies no stylesheet: pretend ours is in
    const real = window.getComputedStyle
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudo) => {
      const style = real(el, pseudo)
      return new Proxy(style, {
        get: (target, key) => key === 'getPropertyValue'
          ? (name: string) => (name === '--ts-bg' ? '#fff' : target.getPropertyValue(name))
          : Reflect.get(target, key),
      })
    })
    const fonts = mockFonts()
    const { container } = render(<TakeSix document={doc} />)
    const root = container.firstElementChild as HTMLElement

    // Laid out, so it can be measured, but not shown
    expect(root.style.visibility).toBe('hidden')
    expect(screen.queryByRole('heading', { name: 'Web app' })).toBeNull()

    await fonts.finish()
    expect(root.style.visibility).toBe('')
    expect(screen.getByRole('heading', { name: 'Web app' })).toBeInTheDocument()
  })
})

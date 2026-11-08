import { describe, expect, it } from 'vitest'
import { PRELOADER_HTML, preloaderErrorHtml } from '../src/preloader.js'

describe('preloader', () => {
  it('is plain HTML with its own styles and the logo, shown only after a delay', () => {
    const el = document.createElement('div')
    el.innerHTML = PRELOADER_HTML
    const screen = el.querySelector('.takesix-preloader')!
    expect(screen.getAttribute('role')).toBe('status')
    // the logo without the six
    expect(screen.querySelectorAll('svg rect')).toHaveLength(5)
    expect(screen.querySelector('svg mask')).toBeNull()
    const css = screen.querySelector('style')!.textContent!
    // hidden at first, so a fast load does not flash it
    expect(css).toMatch(/\.takesix-preloader\{[^}]*opacity:0;animation:takesix-preloader-in [^}]* \.4s forwards/)
    expect(css).toContain('prefers-color-scheme:dark')
  })

  it('turns into an error message, escaped', () => {
    const el = document.createElement('div')
    el.innerHTML = preloaderErrorHtml('Bad <b>document</b>')
    const screen = el.querySelector('[data-error]')!
    expect(screen.getAttribute('role')).toBe('alert')
    expect(screen.querySelector('p')!.textContent).toBe('Bad <b>document</b>')
    expect(screen.querySelector('b')).toBeNull()
  })
})

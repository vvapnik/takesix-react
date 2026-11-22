import { useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { findBlock, formatIssues, parseDocument, parseViewAddress, type TakeSixDocument, type ViewAddress } from '@takesix/core'
import { TakeSix, type Theme } from '../components/TakeSix/index.js'
import { PRELOADER_HTML, preloaderErrorHtml } from '../utils/preloader.js'

/** The tag name the element is registered under. */
export const TAG = 'take-six'

// The element's box on the page: a block 30rem tall unless the page sets
// another height. Page styles for `take-six` win over these.
const HOST_CSS = `:host{display:block;position:relative;height:30rem;overflow:hidden}
:host([hidden]){display:none}
.mount{height:100%}`

const THEMES: readonly Theme[] = ['auto', 'light', 'dark']

function Diagram({ document, theme, view: initialView, menu }: {
  document: TakeSixDocument
  theme: Theme
  view: ViewAddress
  menu: boolean
}) {
  // The screen on display stays inside the element: the page's URL is not touched
  const [view, setView] = useState(initialView)
  return <TakeSix document={document} theme={theme} view={view} onViewChange={setView} menu={menu} />
}

/**
 * Registers `<take-six>`: a diagram on any page, without React on it. The
 * document comes from `src` (a URL to a `.takesix.json` file) or from a
 * `<script type="application/json">` inside the element. Attributes: `theme`
 * (`auto`, `light`, `dark`), `view` (the screen to open, e.g. `in=api`), `menu`
 * (show the menu). The viewer lives in a shadow root together with `css`, so
 * page styles and the diagram's styles do not mix.
 */
export function defineTakeSixElement(css: string, registry: CustomElementRegistry = customElements): void {
  if (registry.get(TAG)) return

  class TakeSixElement extends HTMLElement {
    static observedAttributes = ['src', 'theme', 'view', 'menu']

    #mount: HTMLDivElement | undefined
    #root: Root | undefined
    #loading: AbortController | undefined
    #document: TakeSixDocument | undefined
    #observer: MutationObserver | undefined
    #pending = false
    // Counts documents shown, so a new one opens at its top level
    #loads = 0
    #text: string | undefined

    connectedCallback(): void {
      if (!this.#mount) {
        const shadow = this.shadowRoot ?? this.attachShadow({ mode: 'open' })
        shadow.innerHTML = `<style>${HOST_CSS}</style><style>${css}</style>`
        this.#mount = document.createElement('div')
        this.#mount.className = 'mount'
        shadow.append(this.#mount)
      }
      // An inline document may still be arriving while the parser fills the element
      this.#observer = new MutationObserver(() => { if (!this.hasAttribute('src')) this.#load() })
      this.#observer.observe(this, { childList: true, subtree: true, characterData: true })
      this.#load()
    }

    disconnectedCallback(): void {
      this.#observer?.disconnect()
      this.#loading?.abort()
      // Unmount after the current task: moving the element in the DOM calls
      // disconnected and connected back to back, and keeps the diagram
      queueMicrotask(() => {
        if (this.isConnected) return
        this.#root?.unmount()
        this.#root = undefined
        this.#document = undefined
        this.#text = undefined
        if (this.#mount) this.#mount.innerHTML = ''
      })
    }

    attributeChangedCallback(name: string, old: string | null, value: string | null): void {
      if (!this.isConnected || old === value) return
      if (name === 'src') this.#load()
      else this.#render()
    }

    // Reads the document again, from `src` or from the inline script
    #load(): void {
      // Several changes in one task (attributes, parser filling the element) load once
      if (this.#pending) return
      this.#pending = true
      queueMicrotask(() => {
        this.#pending = false
        if (this.isConnected) void this.#read()
      })
    }

    async #read(): Promise<void> {
      this.#loading?.abort()
      const src = this.getAttribute('src')
      if (!src) {
        const text = this.querySelector('script[type="application/json"]')?.textContent?.trim()
        // Nothing yet: the parser may not have reached the script
        if (text) this.#show(text)
        else if (!this.#document) this.#placeholder(PRELOADER_HTML)
        return
      }
      const loading = new AbortController()
      this.#loading = loading
      if (!this.#document) this.#placeholder(PRELOADER_HTML)
      try {
        const response = await fetch(new URL(src, document.baseURI), { signal: loading.signal })
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim())
        const text = await response.text()
        if (!loading.signal.aborted) this.#show(text)
      } catch (e) {
        if (loading.signal.aborted) return
        this.#fail(`Cannot load ${src}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    #show(text: string): void {
      // The same document again (the inline script touched, `src` reloaded): keep the screen
      if (text === this.#text && this.#document) return
      this.#text = text
      const result = parseDocument(text)
      if (!result.ok) {
        this.#fail(`This diagram cannot be shown:\n${formatIssues(result.issues.filter(i => i.severity === 'error'))}`)
        return
      }
      this.#document = result.document
      this.#loads++
      this.#render()
    }

    #render(): void {
      if (!this.#document || !this.#mount) return
      const theme = this.getAttribute('theme') as Theme | null
      if (!this.#root) {
        this.#mount.innerHTML = ''
        this.#root = createRoot(this.#mount)
      }
      // A new document or a new `view` opens the diagram anew at that screen.
      // Without `view`, a screen named in the page's URL opens when it is in
      // this document: links from "Copy link to this screen" lead back to it.
      const fromPage = parseViewAddress(window.location.hash)
      const pageId = fromPage && ('in' in fromPage ? fromPage.in : fromPage.at)
      const view = this.getAttribute('view') ?? (pageId && findBlock(this.#document, pageId) ? window.location.hash : '')
      this.#root.render(
        <Diagram
          key={`${this.#loads} ${view}`}
          document={this.#document}
          theme={theme && THEMES.includes(theme) ? theme : 'auto'}
          view={parseViewAddress(view.replace(/^#?/, '#'))}
          menu={this.hasAttribute('menu') && this.getAttribute('menu') !== 'false'}
        />,
      )
    }

    #placeholder(html: string): void {
      this.#root?.unmount()
      this.#root = undefined
      if (this.#mount) this.#mount.innerHTML = html
    }

    #fail(message: string): void {
      this.#document = undefined
      this.#placeholder(preloaderErrorHtml(message))
    }
  }

  registry.define(TAG, TakeSixElement)
}

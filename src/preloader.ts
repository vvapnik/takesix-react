// A loading screen in plain HTML and CSS, shown before any script runs.

/** The TakeSix logo (takesix-logo.svg). */
const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1.5 2 35 35" width="56" height="56" fill="currentColor" aria-hidden="true">
<rect x="3.6" y="9" width="3.6" height="12" rx="1.8"/><rect x="7.9" y="5" width="3.6" height="16" rx="1.8"/>
<rect x="12.2" y="3" width="3.6" height="18" rx="1.8"/><rect x="16.5" y="4" width="3.6" height="17" rx="1.8"/>
<rect x="20.8" y="7" width="3.6" height="14" rx="1.8"/>
<path d="M3.6 18.6L7.55 17.6L11.85 15.4L16.15 14.6L20.45 15.3L24.4 16.6V29.5C24.4 33.3 21.4 36 17.6 36H10.6C6.7 36 3.6 33 3.6 29.1Z"/>
<line x1="21.5" y1="31" x2="28.4" y2="19.6" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
</svg>`

// Hidden for the first 0.4 s, so a fast load never flashes it; then the
// logo fades in and breathes. Colours follow the viewer's light and dark themes.
const STYLE = `<style>
.takesix-preloader{box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;
height:100%;min-height:240px;background:#f0f2f5;color:#8fa3b8;font:500 0.8rem/1.4 system-ui,-apple-system,sans-serif;
opacity:0;animation:takesix-preloader-in .3s ease-out .4s forwards}
.takesix-preloader svg{animation:takesix-preloader-breathe 1.6s ease-in-out .4s infinite}
.takesix-preloader[data-error]{opacity:1;animation:none;padding:24px;text-align:center}
.takesix-preloader[data-error] svg{animation:none}
.takesix-preloader p{margin:0;max-width:60ch;color:#c2410c;white-space:pre-wrap}
@keyframes takesix-preloader-in{to{opacity:1}}
@keyframes takesix-preloader-breathe{50%{opacity:.45}}
@media (prefers-color-scheme:dark){.takesix-preloader{background:#0f141b;color:#7d8ca0}.takesix-preloader p{color:#fb923c}}
@media (prefers-reduced-motion:reduce){.takesix-preloader svg{animation:none}}
</style>`

/**
 * A loading screen to put inside the element the viewer mounts on, e.g.
 * `<div id="root">${PRELOADER_HTML}</div>`. It needs no script: React
 * replaces it when the diagram renders. For a document that fails to load,
 * see {@link preloaderErrorHtml}.
 */
export const PRELOADER_HTML = `<div class="takesix-preloader" role="status" aria-label="Loading the diagram">${STYLE}${LOGO}</div>`

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The loading screen turned into a message that the diagram could not be shown. */
export function preloaderErrorHtml(message: string): string {
  return `<div class="takesix-preloader" data-error role="alert">${STYLE}${LOGO}<p>${escapeHtml(message)}</p></div>`
}

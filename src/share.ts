import { serializeDocument, type TakeSixDocument } from '@takesix/core'

// A document travels to the editor in the URL fragment: deflate-raw, then
// base64url, as `#takesix=<data>`. The fragment never reaches the server, so
// opening a diagram in the editor uploads nothing.

/** The online editor that "Open in editor" links to. */
export const DEFAULT_EDITOR_URL = 'https://takesix.vapnik.de/editor/'

/** Fragment key the document is stored under. */
export const HASH_KEY = 'takesix'

/**
 * Longest link we hand out. Browsers take more (Chrome 2 MB), but links this
 * long are already awkward to pass around; bigger diagrams need a server.
 */
export const MAX_LINK_LENGTH = 100_000

async function pipe(bytes: BufferSource, transform: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const stream = new Response(bytes).body!.pipeThrough(transform)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  // Chunks keep String.fromCharCode under the argument limit
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** The document packed for a URL fragment (without the `#takesix=` part). */
export async function encodeDocument(doc: TakeSixDocument): Promise<string> {
  const json = new TextEncoder().encode(serializeDocument(doc))
  return toBase64Url(await pipe(json, new CompressionStream('deflate-raw')))
}

/**
 * Link that opens the document in the editor, or `null` when the document is
 * too big for a link (longer than `MAX_LINK_LENGTH`).
 */
export async function createEditorLink(doc: TakeSixDocument, editorUrl = DEFAULT_EDITOR_URL): Promise<string | null> {
  const base = editorUrl.split('#')[0]
  const url = `${base}#${HASH_KEY}=${await encodeDocument(doc)}`
  return url.length > MAX_LINK_LENGTH ? null : url
}

/**
 * Reads a document from a URL fragment such as `location.hash`. Returns
 * `undefined` when the fragment holds none, otherwise the parsed JSON, which
 * is still unvalidated: pass it to `parseDocument` from `@takesix/core`.
 * Throws when the data is damaged.
 */
export async function readDocumentFromHash(hash: string): Promise<unknown> {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const data = params.get(HASH_KEY)
  if (!data) return undefined
  const json = await pipe(fromBase64Url(data), new DecompressionStream('deflate-raw'))
  return JSON.parse(new TextDecoder().decode(json))
}

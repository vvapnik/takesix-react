import type { BlockShape, Link } from '@takesix/core'
import type { LinkEdit } from '../LinkPopover/index.js'

/** Edits the viewer asks for. All of them are optional: without one, the matching control is hidden. */
export interface ViewerActions {
  rename: (id: string, title: string) => void
  describe: (id: string, description: string) => void
  renameDocument: (title: string) => void
  describeDocument: (description: string) => void
  remove: (id: string) => void
  /** Adds an empty block under `parentId` (`null` = top level), at `at` or the first free place. */
  add: (parentId: string | null, at?: string) => void
  /** Moves or resizes a block on its own level. */
  place: (id: string, at: string) => void
  /** Links `fromId` → `toId`, or removes that link when it exists. */
  toggleLink: (fromId: string, toId: string) => void
  /** Moves a block under `parentId`, to `at` or (without it) its own place if free, else the first free one. */
  move: (id: string, parentId: string | null, at?: string) => void
  /** Edits one link, found by identity (links in files may have no id). */
  updateLink: (link: Link, changes: LinkEdit) => void
  removeLink: (link: Link) => void
  /** Saves the Markdown text of a text block (one that opens into `details`). */
  setDetails: (id: string, details: string) => void
  /** Draws a block as a flowchart symbol; `'process'` is the plain card. */
  setShape: (id: string, shape: BlockShape) => void
  /** Turns an empty block into a text block: it then opens into text, not blocks. */
  makeText: (id: string) => void
  /** Turns an empty text block back into one that holds blocks, and adds the first. */
  toBlocks: (id: string) => void
  /** Wraps sibling blocks into a new parent block, freeing room on the level. */
  group: (ids: string[]) => void
}

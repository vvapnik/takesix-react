# @takesix/react

React viewer and editor for [takesix](https://github.com/vvapnik/takesix-core)
diagrams. One screen shows at most **6 blocks**; click a block to zoom into
its children. Links between blocks are drawn on every level, including links
between blocks nested deep inside different parents.

The document format and all editing logic live in
[`@takesix/core`](https://github.com/vvapnik/takesix-core); this package only
renders and edits.

## Install

```bash
npm install @takesix/react @takesix/core
```

Peer dependencies: `react` and `react-dom` 18 or newer.

## Usage

```tsx
import { useState } from 'react'
import { parseDocument, type TakeSixDocument } from '@takesix/core'
import { TakeSix } from '@takesix/react'
import '@takesix/react/style.css'

export function Diagram({ json }: { json: string }) {
  const result = parseDocument(json)
  if (!result.ok) return <p>Invalid diagram</p>
  return <Editor initial={result.document} />
}

function Editor({ initial }: { initial: TakeSixDocument }) {
  const [doc, setDoc] = useState(initial)
  const [editing, setEditing] = useState(false)
  return (
    <>
      <button onClick={() => setEditing(e => !e)}>{editing ? 'Done' : 'Edit'}</button>
      <div style={{ height: 600 }}>
        <TakeSix document={doc} onChange={setDoc} editing={editing} />
      </div>
    </>
  )
}
```

`TakeSix` fills its container, so give the container a height. It is only the
view: the Edit toggle belongs to your app (a toolbar, a menu).

### Props

| Prop | Type | Meaning |
|---|---|---|
| `document` | `TakeSixDocument` | The diagram. Validate untrusted input with `parseDocument` first. |
| `onChange` | `(doc) => void` | Receives the edited document. Without it the diagram is read-only. |
| `editing` | `boolean` | Show the edit controls. Ignored without `onChange`. |
| `className` | `string` | Extra class for the root element. |

### What is shown

- **One level per screen**, with a breadcrumb. There is no header for the
  opened block: if a level needs a title or summary, make it the first block.
- **Cards** show icon, title and description, and "N more inside" when the
  block has children (direct children only). Click anywhere on such a card to
  open it; text stays selectable.

- **Arrows**: a link between nested blocks is drawn between their ancestors on
  the current screen. Several links between the same pair of blocks merge into
  one arrow labelled with their labels, or with the count when there are more
  than two. An arrow that stands for nested links is dashed.
- **Directions**: `forward` has one arrowhead, `both` two, `none` none.
- **Details**: a block with `details` gets a details button (on its card, and
  in the header once opened) that opens a side panel. `details` is Markdown,
  a safe subset rendered without HTML: `#`–`###` headings, paragraphs, `-`/`1.`
  lists, fenced code, `**bold**`, `*italic*`, `` `code` ``, and links with
  `http(s)`/`mailto` URLs (other schemes are shown as plain text).
- **Layouts**: `tiles`, `list` and `circle`, per level (`layout` on the parent
  block, or on the document for the top level).

### Editing

In edit mode you can:

- rename blocks and edit descriptions in place;
- add and delete blocks; a level stops offering "add" at 6 blocks;
- group blocks: "Group blocks" in the toolbar, select two or more, Group. They
  move into a new block ("New group") where the first of them was, which frees
  room on a full level;
- reorder blocks by dragging the dotted handle on their left;
- link blocks: press the arrow button on the source, then click the target.
  The target may be on any level: while linking, open blocks ("N more inside")
  or go back up to find it. A block's own ancestors and descendants cannot be
  targets. Clicking a linked target removes the link; Esc or Cancel stops;
- edit links: click an arrow or its label to change the label and direction
  (one way, both ways, none), reverse or delete it. A merged arrow lists every
  link it stands for, with their real endpoints;
- write details: the details button opens the panel with a Markdown editor
  and a live preview;
- switch the layout of the current level.

## Development

Node 24 LTS (see `.nvmrc`; with nvm: `nvm use`). Until `@takesix/core` is
published, it is linked from `../takesix-core`: clone both repositories side
by side and run `npm run build` in `takesix-core` first.

```bash
npm install
npm run dev      # demo app from examples/
npm test
npm run build
```

## AI-assisted development

This project is developed with the help of [Claude Code](https://claude.com/claude-code)
(Anthropic). Commits are authored and reviewed by the maintainer.

## License

MIT

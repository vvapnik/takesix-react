# @takesix/react

> TakeSix is an open format and libraries that let an AI agent answer with a diagram you can click into instead of a wall of text: at most six blocks per screen, and any block opens into up to six more.
> **[takesix.vapnik.de](https://takesix.vapnik.de/)** · [FAQ](https://takesix.vapnik.de/faq/)

![TakeSix: answers as diagrams, not walls of text. Six blocks of a checkout diagram with arrows.](https://takesix.vapnik.de/og.png)

React viewer and editor for [takesix](https://github.com/vvapnik/takesix-core)
diagrams. One screen shows at most **6 blocks**; click a block to zoom into
its children. Links between blocks are drawn on every level, including links
between blocks nested deep inside different parents.

Use it to show an AI agent's answer as a diagram rather than a wall of text:
render the takesix JSON the agent wrote, let the reader zoom in, refine it in
the editor.

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

The diagram stays invisible until `style.css` is applied (at most 3 s) and the
fonts its text uses have loaded, so the first thing people see is the final
layout. Fonts that load later make it measure the text again.

The text is set in Inter when the page has it, otherwise in the system font.
Load Inter with the page (for example `@fontsource/inter`) rather than relying
on a copy installed on the computer: some browsers activate a local font only
after the first paint, and the whole page then reflows.

### Props

| Prop | Type | Meaning |
|---|---|---|
| `document` | `TakeSixDocument` | The diagram. Validate untrusted input with `parseDocument` first. |
| `onChange` | `(doc) => void` | Receives the edited document. Without it the diagram is read-only. |
| `editing` | `boolean` | Show the edit controls. Ignored without `onChange`. |
| `theme` | `'auto' \| 'light' \| 'dark'` | Colour theme. `auto` (default) follows the system setting. |
| `menu` | `boolean \| MenuOptions` | Logo button in the bottom-left corner while not editing: open in the online editor, save as HTML/JSON, version. Off by default. |
| `className` | `string` | Extra class for the root element. |

### Menu

`menu` (or `menu={{ ... }}`) adds a round logo button with a small menu:

- **Open in editor** opens the diagram in the
  [online editor](https://takesix.vapnik.de/editor/). The document travels in
  the URL fragment (`#takesix=…`, compressed), which is never sent to a
  server. Diagrams whose link would be longer than 100 000 characters show an
  error for now.
- **Save as** HTML (only with the `html` option) or JSON.
- The package version.

Options: `editorUrl` (another editor), `html: () => string` (the page to save
as HTML), and `openLink(url)` / `download(file)` for sandboxed frames that
cannot open tabs or download, such as MCP Apps. To read such a link in your
own editor, use `readDocumentFromHash(location.hash)` and validate the result
with `parseDocument`; `createEditorLink(doc, url)` builds one.

### Self-contained HTML

One HTML file with the document and the viewer inside opens as the diagram
without a server or network. From the command line:

```bash
npx @takesix/react build diagram.takesix.json        # writes diagram.html
npx @takesix/react build diagram.json -o page.html
```

In code, `@takesix/react/standalone` builds the same page (the viewer with
React is ~300 KB, so import it lazily):

```tsx
const { standaloneHtml } = await import('@takesix/react/standalone')
<TakeSix document={doc} menu={{ html: () => standaloneHtml(doc) }} />
```

### Theming

All colours are CSS variables on the root element (`--ts-bg`, `--ts-surface`,
`--ts-text`, `--ts-accent`, …; see `src/TakeSix.module.css`). Pick a built-in
theme with the `theme` prop, or override variables through `className`:

```css
.myDiagram {
  --ts-accent: #0f9d58;
  --ts-bg: transparent;
}
```

### What is shown

- **One level per screen**, with a breadcrumb below the top level. The header
  shows the document's title and description on the top level, and the opened
  block's below it.
- **Short screens**: a level taller than the space it has is shrunk to fit
  (down to 60%), instead of scrolling.
- **Cards** show icon, title and description, and what the block opens
  into: "N more inside" when it has children (direct children only), "Read"
  when it has text (`details`). Click anywhere on such a card, text included,
  to open it; selecting text to copy it does not open it.
- **Phones**: the level keeps its structure. Blocks of a third or a half show
  only icon, title and "N more inside"; the gaps between columns narrow.

- **Arrows**: a link is drawn on the screen of the level both its blocks are
  on; links between blocks of different levels are not drawn. Several links
  between the same pair of blocks merge into one arrow labelled with their
  labels, or with the count when there are more than two. A straight arrow
  with a card in its way goes around it with right-angled turns: below the
  cards of a row, beside the cards of a column (the way back of a loop), on
  the side that stays clear of other cards.
- **Directions**: `forward` has one arrowhead, `both` two, `none` none.
  **Styles**: `solid`, `dashed` or `dotted` line.
- **Flowcharts**: `shape` draws a block as an ISO 5807 symbol within its
  cells: `terminator` (round ends), `decision` (diamond, its text in the
  middle half), `io` (parallelogram), `subprocess` (double sides),
  `loop-start` and `loop-end` (cut corners). Their text is centred. Arrows
  meet a diamond at its corners.
- **Text**: a block opens either into blocks or into text (`details`, never
  both). Text opens like any level: the same zoom, the breadcrumb, the
  block's title and full description on top, and the text below in a column
  of reading width (about 70 characters). `details` is Markdown,
  a safe subset rendered without HTML: `#`–`###` headings, paragraphs, `-`/`1.`
  lists, fenced code, `**bold**`, `*italic*`, `` `code` ``, and links with
  `http(s)`/`mailto` URLs (other schemes are shown as plain text).
- **Grid**: every level is a 6×6 grid and each block covers the cells its
  `at` names (`"A1:C2"`). The six columns always share the full width; rows
  take the height of their content, and an empty row in between stays as a
  gap. Arrows run straight across the rows or columns two blocks share. A
  full-width single-row card is laid out as a row. On phone widths cards half
  the grid wide or narrower show only icon and title, and empty columns and
  rows shrink away.

### Editing

In edit mode you can:

- rename blocks and edit descriptions in place; pick a block's flowchart
  symbol from their outlines with the button in its top right corner (arrow
  keys move between them, Esc closes);
- add and delete blocks: "Add block" in the toolbar puts one in the first free
  place, a click on an empty cell of the grid puts it there; a level stops
  offering "add" at 6 blocks or when the grid is full;
- group blocks: "Group blocks" in the toolbar, select two or more, Group. They
  move into a new block ("New group") that covers their place (or the first
  one's, when another block is in the way), which frees room on a full level;
- move blocks by dragging the dotted handle on their left onto other cells
  (the target lights up, red when it is taken), or focus the handle and use the
  arrow keys; drop on the middle of another card to move the block inside it,
  or on a breadcrumb to move it up to that level;
- link blocks: press the arrow button on the source, then click the target.
  The target is another block of the same level; opening a block or going
  back up stops linking. Clicking a linked target removes the link; Esc or
  Cancel stops;
- edit links: click an arrow or its label to change the label, direction
  (one way, both ways, none) and line (solid, dashed, dotted), reverse or
  delete it. A merged arrow lists every
  link it stands for, with their real endpoints;
- choose what an empty block opens into: "add inside: blocks · text" on its
  card. A text block's level edits the Markdown with a live preview; while
  its text is empty, "Blocks instead" turns it back. A block with children
  or with text keeps its kind;
- resize blocks: drag the card's bottom-right corner, which snaps to the
  cells, or Shift + arrow keys on the focused handle.

## Development

Node 24 LTS (see `.nvmrc`; with nvm: `nvm use`). `@takesix/core` comes from
npm; to try unreleased core changes, run `npm link` in a `takesix-core` checkout
and `npm link @takesix/core` here.

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

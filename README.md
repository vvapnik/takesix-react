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
  return (
    <div style={{ height: 600 }}>
      <TakeSix document={doc} onChange={setDoc} />
    </div>
  )
}
```

`TakeSix` fills its container, so give the container a height.

### Props

| Prop | Type | Meaning |
|---|---|---|
| `document` | `TakeSixDocument` | The diagram. Validate untrusted input with `parseDocument` first. |
| `onChange` | `(doc) => void` | Receives the edited document. Without it the diagram is read-only and the Edit button is hidden. |
| `defaultEditing` | `boolean` | Start in edit mode. |
| `className` | `string` | Extra class for the root element. |

### What is shown

- **Arrows**: a link between nested blocks is drawn between their ancestors on
  the current screen. Several links between the same pair of blocks merge into
  one arrow labelled with their labels, or with the count when there are more
  than two. An arrow that stands for nested links is dashed.
- **Directions**: `forward` has one arrowhead, `both` two, `none` none.
- **Layouts**: `tiles`, `list` and `circle`, per level (`layout` on the parent
  block, or on the document for the top level).

### Editing

In edit mode you can rename blocks and edit descriptions in place, add and
delete blocks, link blocks on the same screen (arrow button, then the target;
clicking a linked target removes the link), and switch the layout. A level
stops offering "add" at 6 blocks.

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

## License

MIT

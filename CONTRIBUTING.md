# Contributing

Thanks for helping with takesix! This file covers how to set up the project
and how to write commits.

## Setup

Use Node 24 LTS (`.nvmrc`; with nvm run `nvm use`). `@takesix/core` comes from
npm; to work against unreleased core changes, run `npm link` in a
`takesix-core` checkout and `npm link @takesix/core` here.

```bash
npm install
npm run dev
npm test
npm run build
```

Check visual changes in the demo app (`npm run dev`), not only in tests: jsdom
has no layout, so arrow positions and animations are not covered there.

Every change should keep `npm test` and `npx tsc --noEmit` passing. New
behaviour needs a test.

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/). The
history drives versioning and the changelog, so please follow it.

```
<type>(<scope>): <summary>

<body: why and what, optional>

<footer: BREAKING CHANGE, Refs #12, optional>
```

- English, imperative mood: "add", not "added" or "adds".
- Lower case summary, no trailing period, first line at most 72 characters.
- One logical change per commit.

### Types

| Type | Use for | Release |
|---|---|---|
| `feat` | a new capability | minor |
| `fix` | a bug fix | patch |
| `perf` | faster, same behaviour | patch |
| `refactor` | code change without behaviour change | — |
| `docs` | README, comments | — |
| `test` | tests only | — |
| `build` | build setup, dependencies, package.json | — |
| `ci` | GitHub Actions | — |
| `chore` | anything else (.gitignore, configs) | — |

### Scopes

`viewer` (navigation, animation), `editor` (edit mode), `arrows`, `layout`,
`style`, `examples`, `deps`. Leave the scope out when a change touches the
whole package.

### Breaking changes

Add `!` after the type and explain in a `BREAKING CHANGE:` footer. This bumps
the major version.

```
feat(editor)!: rename onUpdate prop to onChange

BREAKING CHANGE: TakeSix now takes onChange instead of onUpdate.
```

### Examples

```
feat(arrows): label arrows with link labels
fix(viewer): measure arrows after the zoom animation ends
feat(editor)!: rename onUpdate prop to onChange
build(deps): bump vite to 8.4
```

### No AI co-author trailers

Do not add `Co-Authored-By` trailers (or similar attribution lines) for AI
models or coding assistants. Commits are authored by the person who submits
them, and that person is responsible for the change. `Co-Authored-By` is for
human co-authors only.

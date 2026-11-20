// Conventional Commits, see CONTRIBUTING.md
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [2, 'always', ['viewer', 'editor', 'arrows', 'layout', 'style', 'examples', 'deps', 'release']],
  },
}

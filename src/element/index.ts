import { defineTakeSixElement } from './define.js'

// The entry of dist/element.js (vite.element.config.ts): React and the viewer
// in one script that registers <take-six>. The build puts the viewer's
// stylesheet in place of this string.
defineTakeSixElement('__TAKESIX_ELEMENT_CSS__')

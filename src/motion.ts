// The TakeSix zoom: one pace and one curve for every zoom, in and out, here
// and wherever a diagram opens a block (the site's demos use the same values).

/** Duration of a zoom into a block or back out, in ms. */
export const ZOOM_MS = 480

/** Easing of a zoom: a quick start that settles softly. */
export const ZOOM_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

import { describe, expect, it } from 'vitest'
import { validateDocument } from '@takesix/core'
import { sample } from '../examples/sample.js'

// The demo document is also the first thing people see: keep it valid.
describe('demo document', () => {
  it('is a valid takesix document without warnings', () => {
    expect(validateDocument(sample).issues).toEqual([])
  })
})

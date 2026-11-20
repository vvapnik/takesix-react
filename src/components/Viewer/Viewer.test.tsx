import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { TakeSixDocument } from '@takesix/core'
import { describe, expect, it, vi } from 'vitest'
import { Viewer, type ViewerActions } from './index.js'

const doc: TakeSixDocument = {
  takesix: '1.0',
  title: 'Shop',
  blocks: [
    { id: 'web', title: 'Web app', at: 'A1:C2' },
    { id: 'api', title: 'API', at: 'D1:F2', children: [{ id: 'auth', title: 'Auth', at: 'A1' }] },
  ],
}

/** Every action is a mock. */
const mockActions = () => new Proxy({}, {
  get: (target: Record<string, unknown>, key: string) => (target[key] ??= vi.fn()),
}) as unknown as ViewerActions

function setup(editing = false, view: { in: string } | null = null) {
  const actions = mockActions()
  const onNavigate = vi.fn()
  render(<Viewer document={doc} editing={editing} actions={actions} typographyTick={0} view={view} onNavigate={onNavigate} />)
  return { actions, onNavigate }
}

describe('Viewer', () => {
  it('shows the top level', () => {
    setup()
    expect(screen.getByText('Web app')).toBeInTheDocument()
    expect(screen.getByText('API')).toBeInTheDocument()
    expect(screen.queryByText('Auth')).toBeNull()
  })

  it('opens the screen it is given', () => {
    setup(false, { in: 'api' })
    expect(screen.getByText('Auth')).toBeInTheDocument()
  })

  it('passes edits to the actions', async () => {
    const { actions } = setup(true)
    await userEvent.click(screen.getByRole('button', { name: 'Delete Web app' }))
    expect(actions.remove).toHaveBeenCalledWith('web')
  })
})

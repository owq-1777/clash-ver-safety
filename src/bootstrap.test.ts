import { expect, it, vi } from 'vitest'

it('reveals a module startup failure instead of leaving the loading overlay visible', async () => {
  const failure = new Error('Startup failed')
  vi.doMock('./main', () => {
    throw failure
  })
  const overlay = { dataset: {}, remove: vi.fn() }
  const root = { replaceChildren: vi.fn() }
  const message = { setAttribute: vi.fn(), style: {}, textContent: '' }
  vi.stubGlobal('document', {
    createElement: () => message,
    getElementById: (id: string) => (id === 'root' ? root : overlay),
  })
  vi.stubGlobal('window', { setTimeout: vi.fn() })
  vi.spyOn(console, 'error').mockImplementation(() => {})

  try {
    await import('./bootstrap')
    await vi.dynamicImportSettled()

    const caughtError = vi.mocked(console.error).mock.calls[0][1] as Error
    expect(caughtError.cause).toBe(failure)
    expect(root.replaceChildren).toHaveBeenCalledWith(message)
    expect(message.textContent).toContain(caughtError.message)
    expect(message.setAttribute).toHaveBeenCalledWith('role', 'alert')
    expect(overlay.dataset).toEqual({ hidden: 'true' })
  } finally {
    vi.unstubAllGlobals()
    vi.doUnmock('./main')
  }
})

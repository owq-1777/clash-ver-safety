import { hideInitialOverlay } from './pages/_layout/utils/initial-loading-overlay'

void import('./main').catch((error: unknown) => {
  console.error('Failed to load the application:', error)

  const message = document.createElement('pre')
  message.setAttribute('role', 'alert')
  message.style.whiteSpace = 'pre-wrap'
  message.textContent =
    error instanceof Error ? error.stack || error.message : String(error)
  document.getElementById('root')?.replaceChildren(message)
  hideInitialOverlay()
})

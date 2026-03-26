import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

const rootEl = document.getElementById('root')
if (!rootEl) {
  throw new Error('Root element #root not found')
}

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY
const firebaseConfigured =
  typeof apiKey === 'string' &&
  apiKey.length > 0 &&
  apiKey !== 'your_api_key_here'

const root = createRoot(rootEl)

void (async () => {
  if (!firebaseConfigured) {
    root.render(
      <div className="min-h-screen flex items-center justify-center bg-[#fdfbf7] p-6 text-gray-800">
        <div
          className="max-w-lg rounded-xl border border-amber-200 bg-white p-8 shadow-sm"
          style={{ fontFamily: 'system-ui, sans-serif' }}
        >
          <h1 className="text-xl font-semibold text-[#0C5449] mb-3">
            Firebase configuration required
          </h1>
          <p className="text-gray-600 mb-4">
            No valid{' '}
            <code className="rounded bg-gray-100 px-1 text-sm">VITE_FIREBASE_API_KEY</code> was
            found. The app cannot connect to Firebase until environment variables are set.
          </p>
          <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-700 mb-6">
            <li>
              Copy <code className="rounded bg-gray-100 px-1">.env.example</code> to{' '}
              <code className="rounded bg-gray-100 px-1">.env</code> in the project root.
            </li>
            <li>
              Paste your web app config from the Firebase console (Project settings → Your apps).
            </li>
            <li>
              Restart the dev server (<code className="rounded bg-gray-100 px-1">npm run dev</code>
              ).
            </li>
          </ol>
          <p className="text-xs text-gray-500">
            Variable names must start with <code className="rounded bg-gray-100 px-1">VITE_</code>{' '}
            so Vite includes them in the build.
          </p>
        </div>
      </div>
    )
    return
  }

  const [{ ErrorBoundary }, { default: App }] = await Promise.all([
    import('./components/ErrorBoundary'),
    import('./App'),
  ])

  root.render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>
  )
})()

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { reportReactFailure } from './ui/reactErrorReporting.js'

const root = createRoot(document.getElementById('root'), {
  onCaughtError: () => reportReactFailure('caught'),
  onRecoverableError: () => reportReactFailure('recoverable'),
  onUncaughtError: () => reportReactFailure('uncaught'),
})

root.render(
  <StrictMode>
    <App />
  </StrictMode>,
)

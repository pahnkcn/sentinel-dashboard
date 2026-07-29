import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export function createViteConfig(environment = process.env) {
  const cspDevMode = environment.SENTINEL_CSP_DEV === '1'

  return {
    plugins: [react()],
    // Vercel Dev applies the production CSP, which intentionally rejects the
    // inline React Fast Refresh preamble. Keep the JSX transform but disable
    // HMR only for the deployment helper's CSP-compatible local environment.
    ...(cspDevMode ? { server: { hmr: false } } : {}),
  }
}

export default defineConfig(() => createViteConfig())

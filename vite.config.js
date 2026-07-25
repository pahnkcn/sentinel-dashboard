import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { cwd } from 'node:process'
import { readFirebaseEnvironment } from './src/config/firebaseEnvironment.js'

// https://vite.dev/config/
export default defineConfig(({ mode, command, isPreview }) => {
  const environment = readFirebaseEnvironment(
    loadEnv(mode, cwd()),
    { mode, command, isPreview },
  )

  return {
    plugins: [react()],
    server: environment.useEmulators
      ? {
          proxy: {
            '/api/chat': {
              target: 'http://127.0.0.1:5001',
              changeOrigin: true,
              rewrite: () => (
                `/${environment.firebaseConfig.projectId}/asia-southeast1/sentinelChat`
              ),
            },
          },
        }
      : undefined,
  }
})

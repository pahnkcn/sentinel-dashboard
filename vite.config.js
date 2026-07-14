import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { cwd } from 'node:process'
import { readFirebaseEnvironment } from './src/config/firebaseEnvironment.js'

// https://vite.dev/config/
export default defineConfig(({ mode, command, isPreview }) => {
  readFirebaseEnvironment(loadEnv(mode, cwd()), { mode, command, isPreview })

  return {
    plugins: [react()],
  }
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

// Build identifier for decision-log reproducibility (PR #7 review):
// decision records store the build commit, so a normal `npm run build`
// inside the repository embeds the current HEAD SHA automatically. An
// explicitly provided VITE_GIT_SHA wins. Outside a git checkout the
// value stays unset and records are honestly marked version_unknown.
function gitSha(): string | null {
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim() || null
  } catch {
    return null
  }
}

if (!process.env.VITE_GIT_SHA) {
  const sha = gitSha()
  if (sha) process.env.VITE_GIT_SHA = sha
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
})

import { describe, expect, it } from 'vitest'
import { APP_VERSION, BUILD_COMMIT } from './version'

// Regression test 7 (PR #7 review): the build identifier surface must be
// well-formed — a version string is always present, and the build commit
// is either a non-empty string (injected by vite.config.ts from git, or
// via VITE_GIT_SHA) or null, which records honestly mark as
// version_unknown for model comparison only.
describe('build identity', () => {
  it('exposes a non-empty app version', () => {
    expect(typeof APP_VERSION).toBe('string')
    expect(APP_VERSION.length).toBeGreaterThan(0)
  })
  it('exposes the build commit as a non-empty string or null', () => {
    expect(BUILD_COMMIT === null || (typeof BUILD_COMMIT === 'string' && BUILD_COMMIT.length > 0)).toBe(true)
  })
})

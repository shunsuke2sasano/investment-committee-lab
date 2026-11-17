import pkg from '../../package.json'

/** App version from package.json (currently "0.0.0"). */
export const APP_VERSION: string = pkg.version

/** Git commit the running build was produced from, injected at build time
 * via VITE_GIT_SHA. Null in development builds — decision logs created then
 * are marked versionUnknown and excluded from headline comparisons rather
 * than carrying a false precision (Issue #6, P0-5). */
export const BUILD_COMMIT: string | null =
  (import.meta.env.VITE_GIT_SHA as string | undefined) ?? null

/**
 * Minimap extension — no-op stub.
 *
 * @replit/codemirror-minimap resolves its @codemirror/state peer dep through
 * the pnpm virtual store path (.pnpm/@codemirror+state@6.5.3/…) which is a
 * different physical path from the root node_modules/@codemirror/state that
 * the app uses. Turbopack deduplicates by resolved path string, so the two
 * paths produce two module instances and all CodeMirror instanceof checks
 * break: "Unrecognized extension value in extension set ([object Object])".
 *
 * Minimap is a nice-to-have; removing the dependency is the clean fix.
 */
export const minimap = () => [];

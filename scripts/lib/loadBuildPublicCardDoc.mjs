/**
 * loadBuildPublicCardDoc — TASK-290.
 *
 * Compiles src/services/publicCards.ts down to its exported
 * `buildPublicCardDoc` alone, WITHOUT running that module's Firebase
 * client-app bootstrap. `publicCards.ts` statically imports
 * `{ db } from './firestore'`, and `services/firestore.ts` imports `app`
 * from `services/firebase.ts`, whose top-level `initializeAuth(app, {
 * persistence: browserLocalPersistence })` needs a real browser/IndexedDB —
 * it throws under plain Node (measured). `buildPublicCardDoc` itself never
 * reads `db` at all (it is a pure object builder — see its own doc comment
 * in publicCards.ts, TASK-247 tanda 2c: "Single source of truth for the
 * public_cards document shape"), so `./firestore` is stubbed here to a
 * no-op export rather than actually resolved.
 *
 * `firebase/firestore` is marked `external` rather than bundled — MEASURED:
 * esbuild bundling it under `platform: 'node'` pulls in the SDK's Node
 * build (`@grpc/grpc-js`), which does a dynamic `require(variable)` of
 * Node built-ins (e.g. `process`) that esbuild's ESM-output CJS shim cannot
 * execute ("Dynamic require... is not supported"). Left external, the real
 * `firebase` package (already a project dependency) is resolved and loaded
 * by Node itself when the compiled output runs — Node's own module loader
 * handles that dynamic require natively. `Timestamp.now()` works fine
 * outside a browser either way (it's just `Date.now()` underneath); only
 * `firebase/auth`'s `browserLocalPersistence` needs a real browser, and
 * nothing in `buildPublicCardDoc`'s import graph touches Auth.
 *
 * WHY THIS EXISTS AT ALL, rather than a hand-copied literal: publicCards.ts's
 * own comment on buildPublicCardDoc documents that THREE call sites used to
 * carry their own copy of this shape and drifted (TASK-247 tanda 2c) —
 * copying the literal a fourth time here, for a data-repair script, is
 * exactly that trap. Reusing the real function means this script produces
 * documents byte-for-byte identical in shape to what the app itself writes.
 */
import esbuild from 'esbuild'
import { writeFileSync, unlinkSync } from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..', '..')

export async function loadBuildPublicCardDoc() {
  const result = await esbuild.build({
    entryPoints: [path.join(repoRoot, 'src/services/publicCards.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    external: ['firebase/firestore'],
    plugins: [
      {
        name: 'stub-client-firestore-app',
        setup(build) {
          // Matches the exact import specifier text publicCards.ts uses
          // (`from './firestore'`) — never firebase/firestore itself.
          build.onResolve({ filter: /^\.\/firestore$/ }, () => ({
            path: 'stub:firestore',
            namespace: 'stub-client-firestore-app',
          }))
          build.onLoad({ filter: /.*/, namespace: 'stub-client-firestore-app' }, () => ({
            contents: 'export const db = {}',
            loader: 'js',
          }))
        },
      },
    ],
  })

  // Written to a real file inside the repo (not a data: URL) so Node's
  // bare-specifier resolution (the bundled `import ... from "firebase/firestore"`)
  // walks up to this repo's own node_modules normally.
  const outFile = path.join(repoRoot, `scripts/.tmp-build-public-card-doc.${process.pid}.${Date.now()}.mjs`)
  writeFileSync(outFile, result.outputFiles[0].text)
  try {
    const mod = await import(pathToFileURL(outFile).href)
    if (typeof mod.buildPublicCardDoc !== 'function') {
      throw new Error('buildPublicCardDoc export not found after bundling src/services/publicCards.ts — did the export get renamed?')
    }
    return mod.buildPublicCardDoc
  } finally {
    unlinkSync(outFile)
  }
}

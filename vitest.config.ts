import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'

export default defineConfig({
  plugins: [
    // TASK-121: test-env-only override of @vitejs/plugin-vue's asset-url
    // transform tag map (vite.config.ts / `npx vite build` use the default
    // and are untouched).
    //
    // Root cause: @vue/compiler-sfc's `transformAssetUrl` node-transform
    // (registered by default whenever a .vue SFC template is compiled)
    // rewrites any STATIC `<use href="/path.svg#frag">` attribute — which
    // its default `tags` map includes for `use` — into an ES module import
    // of the asset path (verified by dumping Vite's SSR-transformed output
    // for LandingHeader.vue: it produces
    // `__vite_ssr_import_N__ = await __vite_ssr_import__("/icons.svg", ...)`
    // plus `href: __vite_ssr_import_N__.default + "#cranial-logo"`).
    // Vitest's Node-based SSR module evaluator (VitestModuleEvaluator,
    // wrapping Vite's ModuleRunner) resolves that `/icons.svg` import by
    // calling Node's `Module.createRequire()` with a `file:///icons.svg`
    // URL — a malformed absolute file URL (no drive segment), which Node
    // only rejects on Windows: `TypeError [ERR_INVALID_ARG_VALUE]: The
    // argument 'filename' must be a file URL object, file URL string, or
    // absolute path string. Received 'file:///icons.svg'`. Any component
    // that mounts a literal `<use href="/icons.svg#...">` (RegisterView,
    // LandingHeader, etc.) crashes at import time in Vitest on Windows —
    // `npx vite build` is unaffected because Rollup's own asset pipeline
    // never goes through Node's createRequire for this. Dynamic bindings
    // (`:href="iconHref"`, see SvgIcon.vue) and pure-fragment refs
    // (`href="#i-name"`, see IconV2.vue) are NOT affected — the transform
    // only touches static, non-fragment-only href attributes.
    //
    // Fix: drop `use` from the tags this transform applies to, so
    // `<use href>` is left as a literal string in test-env SFC output too
    // (all other tags keep the library default behavior).
    vue({
      template: {
        transformAssetUrls: {
          tags: {
            video: ['src', 'poster'],
            source: ['src'],
            img: ['src'],
            image: ['xlink:href', 'href'],
          },
        },
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'happy-dom',
          globals: true,
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'happy-dom',
          globals: true,
          setupFiles: ['./tests/setup.ts'],
          testTimeout: 30000,
          hookTimeout: 30000,
          fileParallelism: false,
          sequence: { concurrent: false },
        },
      },
    ],
  },
})

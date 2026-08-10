import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'

export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src')
        }
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    // TASK-178 phase 2: split so the boot path (the router
                    // guard's auth subscription) downloads app+auth WITHOUT
                    // firestore. Measured separately: 50.63KB gzip for
                    // app+auth vs 112.07KB for firestore. Splitting the chunk
                    // alone does nothing — it only pays off together with
                    // loadAuthDeps/loadFirestoreDeps in stores/auth.ts, which
                    // is what stops the boot path from requesting both.
                    'firebase-auth': ['firebase/app', 'firebase/auth'],
                    'firebase-firestore': ['firebase/firestore'],
                    vendor: ['vue', 'vue-router', 'pinia'],
                }
            }
        }
    }
})
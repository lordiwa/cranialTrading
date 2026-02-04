/**
 * Test Setup - Initialize Firebase for Integration Tests
 *
 * This setup allows testing Firebase operations directly without the UI.
 * Uses real Firebase credentials from .env.local
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Manually load .env.local since dotenv has issues in vitest
const envPath = resolve(__dirname, '../.env.local')
try {
  const envContent = readFileSync(envPath, 'utf-8')
  const lines = envContent.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=')
      const value = valueParts.join('=') // Handle values with = in them
      if (key && value) {
        process.env[key.trim()] = value.trim()
      }
    }
  }
  console.log('✅ Loaded environment variables from .env.local')
} catch (err) {
  console.error('❌ Could not load .env.local:', err)
}

// Validate required environment variables
const requiredEnvVars = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
]

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`)
  }
}

// Make env vars available as import.meta.env for Firebase service
// @ts-ignore
globalThis.import = {
  meta: {
    env: {
      VITE_FIREBASE_API_KEY: process.env.VITE_FIREBASE_API_KEY,
      VITE_FIREBASE_AUTH_DOMAIN: process.env.VITE_FIREBASE_AUTH_DOMAIN,
      VITE_FIREBASE_PROJECT_ID: process.env.VITE_FIREBASE_PROJECT_ID,
      VITE_FIREBASE_STORAGE_BUCKET: process.env.VITE_FIREBASE_STORAGE_BUCKET,
      VITE_FIREBASE_MESSAGING_SENDER_ID: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      VITE_FIREBASE_APP_ID: process.env.VITE_FIREBASE_APP_ID,
    }
  }
}

console.log('✅ Test environment configured')
console.log(`   Project: ${process.env.VITE_FIREBASE_PROJECT_ID}`)

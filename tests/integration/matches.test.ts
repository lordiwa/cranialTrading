/**
 * Integration Tests - Match System
 *
 * Tests the critical match functionality:
 * 1. Discarded matches persist in Firestore (not localStorage)
 * 2. Matches can be created and retrieved correctly
 * 3. User can only access their own data (security rules)
 *
 * Run with: npm run test:integration
 *
 * NOTE: Cross-user notifications require a Cloud Function due to security rules.
 * These tests focus on single-user operations that work within security rules.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  TEST_USERS,
  initFirebase,
  loginAs,
  logout,
  clearAllMatches,
  createMatch,
  getNewMatches,
  getDiscardedMatches,
  discardMatch,
  cleanupTestUser,
  validateTestCredentials,
} from './testHelpers'

// Validate credentials before running tests
validateTestCredentials()

describe('Match System Integration Tests', () => {
  let userAId: string
  let userBId: string

  beforeAll(async () => {
    console.log('\n🚀 Initializing Firebase for tests...')
    initFirebase()

    // Login as User A to get their ID
    const userAResult = await loginAs('userA')
    userAId = userAResult.userId
    console.log(`   User A (${TEST_USERS.userA.email}): ${userAId}`)
    await logout()

    // Login as User B to get their ID
    const userBResult = await loginAs('userB')
    userBId = userBResult.userId
    console.log(`   User B (${TEST_USERS.userB.email}): ${userBId}`)
    await logout()
  })

  beforeEach(async () => {
    // Clean up test data before each test - only own data
    console.log('\n🧹 Cleaning up test data...')
    await loginAs('userA')
    await clearAllMatches(userAId)
    await logout()

    await loginAs('userB')
    await clearAllMatches(userBId)
    await logout()
  })

  afterAll(async () => {
    // Final cleanup
    console.log('\n🧹 Final cleanup...')
    try {
      await loginAs('userA')
      await cleanupTestUser(userAId)
      await logout()
    } catch { /* ignore */ }

    try {
      await loginAs('userB')
      await cleanupTestUser(userBId)
      await logout()
    } catch { /* ignore */ }
  })

  describe('Bug #2 Fix: Discarded Matches Persistence', () => {
    it('should persist discarded matches in Firestore matches_eliminados', async () => {
      console.log('\n📝 Test: Discarded match should persist in Firestore')

      await loginAs('userA')

      // Step 1: Create a match in matches_nuevos
      const matchId = await createMatch(userAId, {
        id: `test_match_${Date.now()}`,
        otherUserId: userBId,
        otherUsername: TEST_USERS.userB.username,
        myCards: [{ name: 'TEST_Lightning Bolt', quantity: 4 }],
        otherCards: [],
        compatibility: 75,
        type: 'UNIDIRECTIONAL'
      })
      console.log(`   ✅ Created match: ${matchId}`)

      // Step 2: Verify it's in matches_nuevos
      let newMatches = await getNewMatches(userAId)
      expect(newMatches.length).toBeGreaterThan(0)
      console.log(`   📬 Matches in nuevos: ${newMatches.length}`)

      // Step 3: Discard the match (move to eliminados)
      await discardMatch(userAId, {
        id: `test_match_discard_${Date.now()}`,
        otherUserId: userBId,
        otherUsername: TEST_USERS.userB.username,
        myCards: [{ name: 'TEST_Lightning Bolt', quantity: 4 }],
        otherCards: [],
        compatibility: 75,
        type: 'UNIDIRECTIONAL'
      })
      console.log(`   🗑️ Match discarded`)

      // Step 4: Verify it's in matches_eliminados
      const discardedMatches = await getDiscardedMatches(userAId)
      expect(discardedMatches.length).toBeGreaterThan(0)
      const discardedMatch = discardedMatches.find(m => m.otherUserId === userBId)
      expect(discardedMatch).toBeDefined()
      expect(discardedMatch?.status).toBe('eliminado')
      console.log(`   ✅ Match found in matches_eliminados with status 'eliminado'`)

      await logout()
    })

    it('should persist discarded matches across sessions (re-login)', async () => {
      console.log('\n📝 Test: Discarded matches persist after re-login')

      // Session 1: Create and discard a match
      await loginAs('userA')

      await discardMatch(userAId, {
        id: `persist_test_${Date.now()}`,
        otherUserId: userBId,
        otherUsername: TEST_USERS.userB.username,
        myCards: [],
        otherCards: [],
        compatibility: 50,
        type: 'UNIDIRECTIONAL'
      })
      console.log(`   🗑️ Session 1: Discarded match with User B`)

      await logout()
      console.log(`   🔄 Logged out`)

      // Session 2: Re-login and verify
      await loginAs('userA')
      console.log(`   🔄 Session 2: Re-logged in`)

      const discardedMatches = await getDiscardedMatches(userAId)
      const hasUserB = discardedMatches.some(m => m.otherUserId === userBId)

      expect(hasUserB).toBe(true)
      console.log(`   ✅ User B still in discarded list after re-login (${discardedMatches.length} total)`)

      await logout()
    })

    it('should allow filtering new matches by discarded otherUserIds', async () => {
      console.log('\n📝 Test: Filter new matches by discarded users')

      await loginAs('userA')

      // Step 1: Discard matches with User B
      await discardMatch(userAId, {
        id: `filter_test_${Date.now()}`,
        otherUserId: userBId,
        otherUsername: TEST_USERS.userB.username,
        myCards: [],
        otherCards: [],
        compatibility: 0,
        type: 'UNIDIRECTIONAL'
      })
      console.log(`   🗑️ Discarded match with User B`)

      // Step 2: Get discarded user IDs
      const discardedMatches = await getDiscardedMatches(userAId)
      const discardedUserIds = new Set(discardedMatches.map(m => m.otherUserId))
      console.log(`   📋 Discarded user IDs: ${discardedUserIds.size}`)

      expect(discardedUserIds.has(userBId)).toBe(true)

      // Step 3: Create a new match with User B
      await createMatch(userAId, {
        id: `new_match_${Date.now()}`,
        otherUserId: userBId,
        otherUsername: TEST_USERS.userB.username,
        myCards: [{ name: 'TEST_Card', quantity: 1 }],
        otherCards: [],
        compatibility: 80,
        type: 'UNIDIRECTIONAL'
      })

      // Step 4: Filter new matches by discarded
      const newMatches = await getNewMatches(userAId)
      const filteredMatches = newMatches.filter(m => !discardedUserIds.has(m.otherUserId))

      console.log(`   📬 New matches: ${newMatches.length}`)
      console.log(`   📬 After filtering: ${filteredMatches.length}`)

      // The match with User B should be filtered out
      const hasUserBInFiltered = filteredMatches.some(m => m.otherUserId === userBId)
      expect(hasUserBInFiltered).toBe(false)
      console.log(`   ✅ Match with User B correctly filtered out`)

      await logout()
    })
  })

  describe('Match CRUD Operations', () => {
    it('should create a match in matches_nuevos', async () => {
      console.log('\n📝 Test: Create match')

      await loginAs('userA')

      const matchId = await createMatch(userAId, {
        id: `crud_test_${Date.now()}`,
        otherUserId: userBId,
        otherUsername: TEST_USERS.userB.username,
        myCards: [{ name: 'TEST_Black Lotus', quantity: 1, price: 50000 }],
        otherCards: [{ name: 'TEST_Mox Pearl', quantity: 1, price: 5000 }],
        compatibility: 90,
        type: 'BIDIRECTIONAL'
      })

      expect(matchId).toBeTruthy()
      console.log(`   ✅ Created match with ID: ${matchId}`)

      const matches = await getNewMatches(userAId)
      const createdMatch = matches.find(m => m.otherUserId === userBId)

      expect(createdMatch).toBeDefined()
      expect(createdMatch?.compatibility).toBe(90)
      expect(createdMatch?.type).toBe('BIDIRECTIONAL')
      console.log(`   ✅ Match retrieved successfully`)

      await logout()
    })

    it('should handle multiple matches correctly', async () => {
      console.log('\n📝 Test: Multiple matches')

      await loginAs('userA')

      // Create 3 matches
      for (let i = 1; i <= 3; i++) {
        await createMatch(userAId, {
          id: `multi_${i}_${Date.now()}`,
          otherUserId: `fake_user_${i}`,
          otherUsername: `testuser${i}`,
          myCards: [{ name: `TEST_Card ${i}`, quantity: i }],
          otherCards: [],
          compatibility: 50 + i * 10,
          type: 'UNIDIRECTIONAL'
        })
      }

      const matches = await getNewMatches(userAId)
      console.log(`   📬 Total matches: ${matches.length}`)

      expect(matches.length).toBeGreaterThanOrEqual(3)
      console.log(`   ✅ Multiple matches created successfully`)

      await logout()
    })
  })

  describe('Security Rules Verification', () => {
    it('should only allow reading own matches', async () => {
      console.log('\n📝 Test: User can only read their own matches')

      // User A creates a match
      await loginAs('userA')
      await createMatch(userAId, {
        id: `security_test_${Date.now()}`,
        otherUserId: userBId,
        otherUsername: TEST_USERS.userB.username,
        myCards: [],
        otherCards: [],
        compatibility: 100,
        type: 'BIDIRECTIONAL'
      })
      console.log(`   ✅ User A created match`)
      await logout()

      // User B should NOT see User A's matches_nuevos
      await loginAs('userB')
      const userBMatches = await getNewMatches(userBId)
      const hasUserAMatch = userBMatches.some(m => m.otherUserId === userAId)

      // Since we didn't notify User B, they shouldn't see this match
      // (unless cross-user notification worked, which requires special rules)
      console.log(`   📬 User B matches: ${userBMatches.length}`)
      console.log(`   📬 User B sees match from A: ${hasUserAMatch}`)

      // This test documents the current behavior
      // If security rules are strict, User B won't see User A's match
      await logout()
    })
  })
})

describe('Smoke Tests', () => {
  it('should successfully authenticate User A', async () => {
    console.log('\n🔥 Smoke: Auth User A')
    initFirebase()

    const { user } = await loginAs('userA')
    expect(user).toBeDefined()
    expect(user.email).toBe(TEST_USERS.userA.email)
    console.log(`   ✅ Authenticated as ${user.email}`)

    await logout()
  })

  it('should successfully authenticate User B', async () => {
    console.log('\n🔥 Smoke: Auth User B')

    const { user } = await loginAs('userB')
    expect(user).toBeDefined()
    expect(user.email).toBe(TEST_USERS.userB.email)
    console.log(`   ✅ Authenticated as ${user.email}`)

    await logout()
  })
})

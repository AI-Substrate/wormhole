/**
 * Mock Helpers for Auth Tutorial
 *
 * Provides deterministic mocks for database, session storage, and crypto functions
 * to support the debugging tutorial in docs/how/simple-debug-flow.md
 */

// In-memory mock database
const mockDatabase = {
  users: [
    {
      id: 42,
      username: 'alice',
      passwordHash: '$2b$10$N9qo8uLOickgx2ZToZHeAOeexLVRwG0J0lZxJQTqGZ8j7yC8qKJ2C', // hash of 'secret123'
      email: 'alice@example.com'
    },
    {
      id: 43,
      username: 'bob',
      passwordHash: '$2b$10$differenthashhere',
      email: 'bob@example.com'
    }
  ]
};

/**
 * Find user by username in mock database
 */
async function findUserByUsername(username) {
  // Simulate async database lookup
  await new Promise(resolve => setTimeout(resolve, 10));

  const user = mockDatabase.users.find(u => u.username === username);
  if (!user) {
    throw new Error(`User not found: ${username}`);
  }

  return user;
}

/**
 * Verify password (simplified mock - always returns true for 'secret123')
 */
function verifyPassword(password, passwordHash) {
  // In real code this would use bcrypt.compare()
  // For tutorial purposes, we just check if password is 'secret123'
  return password === 'secret123';
}

/**
 * Generate deterministic token (always same output for same input)
 * This ensures tutorial examples are consistent
 */
function generateToken(userId) {
  // Simple deterministic token generation for tutorial
  // In real code, use crypto.randomBytes()
  const base = userId.toString().padStart(8, '0');
  return 'a7f3c2e91b4d8f6a3c5e9d2b7f1a8c4e';  // Fixed token for predictable tutorial output
}

/**
 * Mock session store
 */
const sessionStore = {
  sessions: [],

  async save(session) {
    // Simulate async save operation
    await new Promise(resolve => setTimeout(resolve, 10));

    // Add to in-memory store
    this.sessions.push({
      ...session,
      savedAt: Date.now()
    });

    return session;
  },

  async find(userId) {
    return this.sessions.find(s => s.userId === userId);
  },

  clear() {
    this.sessions = [];
  }
};

/**
 * Reset all mocks to initial state
 * Call this in beforeEach() to ensure clean state
 */
function resetMocks() {
  sessionStore.clear();
  mockDatabase.users = [
    {
      id: 42,
      username: 'alice',
      passwordHash: '$2b$10$N9qo8uLOickgx2ZToZHeAOeexLVRwG0J0lZxJQTqGZ8j7yC8qKJ2C',
      email: 'alice@example.com'
    },
    {
      id: 43,
      username: 'bob',
      passwordHash: '$2b$10$differenthashhere',
      email: 'bob@example.com'
    }
  ];
}

module.exports = {
  findUserByUsername,
  verifyPassword,
  generateToken,
  sessionStore,
  resetMocks,
  mockDatabase
};

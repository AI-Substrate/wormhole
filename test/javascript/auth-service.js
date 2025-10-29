/**
 * Authentication Service
 *
 * This file is part of the debugging tutorial in docs/how/simple-debug-flow.md
 *
 * ⚠️  CONTAINS INTENTIONAL BUG FOR TUTORIAL PURPOSES
 *
 * The bug is on line 42 - a missing return statement.
 * Use run-auth-tutorial.js to toggle between buggy and fixed versions.
 */

const { findUserByUsername, verifyPassword, generateToken, sessionStore } = require('./auth-mocks');

/**
 * Authenticate user and create session
 *
 * @param {string} username - User's username
 * @param {string} password - User's password
 * @returns {Promise<{token: string, expires: number}>} Token and expiration
 */
async function loginUser(username, password) {
  console.log('[Auth Service] Checking credentials...');

  // Look up user in database
  const user = await findUserByUsername(username);
  console.log('[Auth Service] User found in database');

  // Verify password
  if (!verifyPassword(password, user.passwordHash)) {
    throw new Error('Invalid credentials');
  }

  console.log('[Auth Service] Generating token for user', user.id);
  console.warn('Warning: Token generator using deprecated crypto method');
  const token = generateToken(user.id);
  console.log('[Auth Service] Token generated:', token.substring(0, 10) + '...');

  const session = {
    userId: user.id,
    token,
    expires: Date.now() + 3600000  // 1 hour from now
  };

  await sessionStore.save(session);
  console.log('[Auth Service] Session saved successfully');
  console.log('Login result:', { token, expires: session.expires });

  // TODO: Return the token object
}

module.exports = {
  loginUser
};

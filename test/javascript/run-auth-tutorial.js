#!/usr/bin/env node

/**
 * Auth Tutorial Helper Script
 *
 * Toggles the auth-service.js between buggy and fixed states
 * for practicing the debugging tutorial.
 *
 * Usage:
 *   node run-auth-tutorial.js --mode=buggy   # Introduce the bug
 *   node run-auth-tutorial.js --mode=fixed   # Fix the bug
 *   node run-auth-tutorial.js --mode=status  # Show current state
 */

const fs = require('fs');
const path = require('path');

const AUTH_SERVICE_FILE = path.join(__dirname, 'auth-service.js');

// The two versions of line 42
const BUGGY_LINE = '  // TODO: Return the token object';
const FIXED_LINE = '  return { token, expires: session.expires };';

function getCurrentState() {
  const content = fs.readFileSync(AUTH_SERVICE_FILE, 'utf8');
  const lines = content.split('\n');
  const line42 = lines[41];  // 0-indexed, so line 42 is index 41

  if (line42.includes('TODO')) {
    return 'BUGGY';
  } else if (line42.includes('return')) {
    return 'FIXED';
  } else {
    return 'UNKNOWN';
  }
}

function setBuggyState() {
  const content = fs.readFileSync(AUTH_SERVICE_FILE, 'utf8');
  const lines = content.split('\n');

  // Replace line 42 (index 41) with buggy version
  lines[41] = BUGGY_LINE;

  fs.writeFileSync(AUTH_SERVICE_FILE, lines.join('\n'), 'utf8');
  console.log('✅ Bug introduced: Line 42 is now a TODO comment');
  console.log('   The loginUser() function will return undefined');
  console.log('');
  console.log('Run the test with: just debug-wait --param testName="should return valid token"');
}

function setFixedState() {
  const content = fs.readFileSync(AUTH_SERVICE_FILE, 'utf8');
  const lines = content.split('\n');

  // Replace line 42 (index 41) with fixed version
  lines[41] = FIXED_LINE;

  fs.writeFileSync(AUTH_SERVICE_FILE, lines.join('\n'), 'utf8');
  console.log('✅ Bug fixed: Line 42 now returns the token object');
  console.log('   The loginUser() function will work correctly');
  console.log('');
  console.log('Run the test with: just debug-wait --param testName="should return valid token"');
}

function showStatus() {
  const state = getCurrentState();
  const content = fs.readFileSync(AUTH_SERVICE_FILE, 'utf8');
  const lines = content.split('\n');
  const line42 = lines[41];

  console.log('Current State:', state);
  console.log('');
  console.log('Line 42 in auth-service.js:');
  console.log('  ' + line42);
  console.log('');

  if (state === 'BUGGY') {
    console.log('💡 This is the BUGGY version - the test will fail');
    console.log('   Run: node run-auth-tutorial.js --mode=fixed  (to fix it)');
  } else if (state === 'FIXED') {
    console.log('✅ This is the FIXED version - the test will pass');
    console.log('   Run: node run-auth-tutorial.js --mode=buggy  (to practice again)');
  } else {
    console.log('⚠️  Unknown state - line 42 doesn\'t match expected pattern');
  }
}

function showUsage() {
  console.log('Auth Tutorial Helper Script');
  console.log('');
  console.log('Usage:');
  console.log('  node run-auth-tutorial.js --mode=buggy   # Introduce the bug (for practice)');
  console.log('  node run-auth-tutorial.js --mode=fixed   # Fix the bug (to verify solution)');
  console.log('  node run-auth-tutorial.js --mode=status  # Show current state');
  console.log('');
  console.log('See docs/how/simple-debug-flow.md for the full tutorial');
}

// Parse command line arguments
const args = process.argv.slice(2);
const modeArg = args.find(arg => arg.startsWith('--mode='));

if (!modeArg) {
  showUsage();
  process.exit(0);
}

const mode = modeArg.split('=')[1];

switch (mode) {
  case 'buggy':
    setBuggyState();
    break;
  case 'fixed':
    setFixedState();
    break;
  case 'status':
    showStatus();
    break;
  default:
    console.error('❌ Unknown mode:', mode);
    console.error('   Valid modes: buggy, fixed, status');
    process.exit(1);
}

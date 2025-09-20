#!/usr/bin/env node

/**
 * Script to retrieve Expo access token for GitHub Actions
 *
 * Usage: node scripts/get-expo-token.js
 *
 * Note: You must be logged in to Expo first:
 * npx expo login
 */

const { getUserAsync } = require('@expo/config');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function getExpoToken() {
  try {
    // The token is stored in ~/.expo/state.json
    const stateFile = path.join(os.homedir(), '.expo', 'state.json');

    if (!fs.existsSync(stateFile)) {
      console.error('❌ Expo state file not found. Please login first with: npx expo login');
      process.exit(1);
    }

    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));

    if (!state.auth || !state.auth.sessionSecret) {
      console.error('❌ No Expo token found. Please login first with: npx expo login');
      process.exit(1);
    }

    console.log('\n✅ Expo Token Found!\n');
    console.log('Token:', state.auth.sessionSecret);
    console.log('\n📋 Copy the token above and add it as EXPO_TOKEN secret in GitHub');
    console.log('   Settings → Secrets and variables → Actions → New repository secret');
    console.log('\n⚠️  Keep this token secure and do not commit it to the repository!');

  } catch (error) {
    console.error('Error reading Expo token:', error.message);
    process.exit(1);
  }
}

getExpoToken();
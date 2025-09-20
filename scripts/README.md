# Scripts Directory

This directory contains utility scripts for development and deployment.

## Available Scripts

### get-expo-token.js
Retrieves your Expo access token for GitHub Actions configuration.

**Usage:**
```bash
# First, ensure you're logged in to Expo
npx expo login

# Then get your token
node scripts/get-expo-token.js
```

The token will be displayed in the console. Copy it and add it as `EXPO_TOKEN` secret in GitHub:
- Go to Settings → Secrets and variables → Actions
- Click "New repository secret"
- Name: `EXPO_TOKEN`
- Value: Paste the token

### Demo Recording Scripts

Located in `scripts/demo/`:
- Scripts for recording and managing demo content
- See `scripts/demo/README.md` for details

## Security Notes

⚠️ **Never commit tokens or secrets to the repository**
- Always use GitHub Secrets for sensitive values
- Keep local `.env` files in `.gitignore`
- Rotate tokens regularly
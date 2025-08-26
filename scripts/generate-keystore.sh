#!/bin/bash

echo "========================================="
echo "Production Keystore Generator"
echo "========================================="
echo ""
echo "This script will generate a production keystore for Symposium AI."
echo "IMPORTANT: Save the passwords you enter - you'll need them for all future updates!"
echo ""
echo "You will be prompted for:"
echo "1. Keystore password (min 6 characters)"
echo "2. Key password (can be same as keystore password)"
echo "3. Your organization details"
echo ""
echo "Press Enter to continue..."
read

cd android/app

# Generate the keystore
keytool -genkey -v \
  -keystore symposium-ai-release.keystore \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -alias symposium-ai

echo ""
echo "========================================="
echo "Keystore generated successfully!"
echo "========================================="
echo ""
echo "Now getting SHA fingerprints..."
echo ""

# Get SHA fingerprints
keytool -list -v \
  -keystore symposium-ai-release.keystore \
  -alias symposium-ai

echo ""
echo "========================================="
echo "IMPORTANT: Save the following:"
echo "1. Your keystore password"
echo "2. Your key password"
echo "3. The SHA-1 fingerprint (add to Firebase)"
echo "4. The SHA-256 fingerprint (add to Firebase)"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Add these SHA fingerprints to Firebase Console"
echo "2. Download updated google-services.json"
echo "3. Create keystore.properties file with your passwords"
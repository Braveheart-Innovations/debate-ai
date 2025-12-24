#!/bin/bash
# EAS Pre-build script to decode Firebase config files from secrets

set -e

echo "=== EAS Pre-build: Setting up Firebase configs ==="

# Android: google-services.json
if [ -n "$GOOGLE_SERVICES_JSON_BASE64" ]; then
  echo "Decoding google-services.json..."
  echo "$GOOGLE_SERVICES_JSON_BASE64" | base64 --decode > android/app/google-services.json
  echo "Created android/app/google-services.json"
else
  echo "Warning: GOOGLE_SERVICES_JSON_BASE64 not set"
fi

# iOS: GoogleService-Info.plist
if [ -n "$GOOGLE_SERVICE_INFO_PLIST_BASE64" ]; then
  echo "Decoding GoogleService-Info.plist..."
  echo "$GOOGLE_SERVICE_INFO_PLIST_BASE64" | base64 --decode > ios/SymposiumAI/GoogleService-Info.plist
  echo "Created ios/SymposiumAI/GoogleService-Info.plist"
else
  echo "Warning: GOOGLE_SERVICE_INFO_PLIST_BASE64 not set"
fi

echo "=== Firebase config setup complete ==="

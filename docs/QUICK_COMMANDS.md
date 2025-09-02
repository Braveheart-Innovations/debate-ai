# EAS Build Quick Command Cheat Sheet

## Dev Client (debug native modules + Metro)
- iOS: `eas build -p ios --profile development`
- Android: `eas build -p android --profile development`
- Run Metro: `npx expo start --dev-client`

Install dev client after build:
- Android (USB): `eas build:run -p android --profile development`
- iOS (Test device): open the EAS link in Safari and follow the install prompt

## QA / Internal Testers (installable, no Metro)
- iOS: `eas build -p ios --profile preview && eas submit -p ios --profile preview`
- Android: `eas build -p android --profile preview && eas submit -p android --profile preview`

## Production Release
- iOS: `eas build -p ios --profile production && eas submit -p ios --profile production`
- Android: `eas build -p android --profile production && eas submit -p android --profile production`

## OTA Updates (EAS Update)
- To preview channel: `npx expo update --channel preview --message "Hotfix for preview"`
- To production channel: `npx expo update --channel production --message "Hotfix"`

## Diagnostics
- Doctor: `npx expo doctor --fix`
- Dependency check: `npx expo install --check`
- Clean Android (local):
  - `rm -rf android/.cxx android/app/build android/build`
  - `(cd android && ./gradlew clean)`


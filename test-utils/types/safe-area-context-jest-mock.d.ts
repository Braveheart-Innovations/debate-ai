// react-native-safe-area-context ships its jest mock as raw .tsx, which tsc
// would otherwise type-check as our code. tsconfig.tests.json maps the import
// here so the test typecheck covers only this repo's sources.
declare const mockSafeAreaContext: typeof import('react-native-safe-area-context');
export default mockSafeAreaContext;

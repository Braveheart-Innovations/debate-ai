# Repository Guidelines

## Project Structure & Module Organization
- `src/`: App code. Key dirs: `components/` (atoms/molecules/organisms), `screens/`, `navigation/`, `services/` (ai, firebase, streaming, etc.), `hooks/`, `store/`, `types/`, `utils/`, `config/`, `constants/`, `theme/`.
- Platform wrappers: `android/`, `ios/` (managed by Expo prebuild).
- Assets: `assets/` and `src/assets/`.
- Docs: `docs/` for architecture and feature plans.

## Build, Test, and Development Commands
- `npm start` or `npm run start`: Start Expo dev server (Dev Client enabled).
- `npm run ios` / `npm run android` / `npm run web`: Run on simulator/emulator/web.
- `npm run prebuild[:ios|:android]`: Generate native projects (cleans caches).
- `npm run lint` / `npm run lint:fix`: Lint TypeScript/TSX via ESLint.
- `npm run typecheck`: TypeScript checks only (no emit).
- `npm run check`: Runs `typecheck` then `lint`.
- EAS builds: `npm run build:dev:ios` / `npm run build:dev:android` (local dev profiles).

## Coding Style & Naming Conventions
- Language: TypeScript (strict). Path alias: use `@/` (e.g., `import { X } from "@/utils"`).
- Components: React function components in `.tsx`; PascalCase filenames (e.g., `ProfileSheet.tsx`).
- Modules/utils: `.ts` with camelCase exports; avoid default exports when reasonable.
- State & hooks: colocate in `store/` and `hooks/` by domain (e.g., `hooks/chat`).
- Lint rules: see `eslint.config.mjs` (no unused vars, React hooks rules, no console except warn/error).

## Testing Guidelines
- No formal test runner configured yet. Before PRs, run `npm run check` and verify in iOS/Android/web via Expo.
- If adding tests, prefer colocated `__tests__` or `*.test.ts[x]` near modules and consider React Native Testing Library + Jest.

## Commit & Pull Request Guidelines
- Commits: Conventional style preferred (`feat:`, `fix:`, `refactor:`) as seen in history.
- PRs must include: concise description, linked issues, screenshots/screen recordings for UI changes, and a manual test plan (platforms, steps, expected results).
- Ensure `npm run check` passes and diff is scoped; update docs under `docs/` when architecture or flows change.

## Security & Configuration Tips
- Secrets: never commit keys; use `.env` / `.env.local` (see `.env.local.example`).
- Firebase/third‑party setup: follow `FIREBASE_DEV_BUILD.md` and related docs in `docs/`.
- Prebuild notes: after `prebuild`, verify native changes into VCS only when intentional.

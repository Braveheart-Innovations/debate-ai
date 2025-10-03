# Gemini Code Assistant Context

This document provides context for the Gemini Code Assistant to understand the DebateAI project.

## Project Overview

DebateAI is a mobile application built with React Native and Expo that allows users to engage in debates with and compare various AI models. The app uses a "Bring-Your-Own-Key" (BYOK) model, where users can provide their own API keys for different AI services.

The project is written in TypeScript and uses the following key technologies:

*   **Frontend:** React Native, Expo
*   **State Management:** Redux Toolkit
*   **Navigation:** React Navigation
*   **Backend:** Firebase (Authentication, Firestore)
*   **AI Services:** Anthropic, Google (Generative AI), OpenAI

The application features a tab-based navigation system that includes screens for chat, debates, comparison, and history. It also includes features like user authentication, in-app purchases for premium features, and the ability to configure and manage API keys for different AI providers.

## Building and Running

The following commands are used to build, run, and test the project:

*   **Start development server:** `npm start` or `npm run start:dev`
*   **Run on Android:** `npm run android`
*   **Run on iOS:** `npm run ios`
*   **Run on web:** `npm run web`
*   **Run tests:** `npm test`
*   **Run tests with coverage:** `npm run test:coverage`
*   **Lint code:** `npm run lint`
*   **Type check:** `npm run typecheck`

## Development Conventions

*   **Code Style:** The project uses ESLint for code linting. The configuration can be found in `eslint.config.mjs`.
*   **Testing:** The project uses Jest for testing. Test files are located in the `__tests__` directory and follow the naming convention `*.test.ts` or `*.test.tsx`.
*   **Directory Structure:** The main application code is located in the `src` directory, with subdirectories for components, contexts, navigation, screens, services, and store.
*   **Commits:** Conventional commit messages are preferred.

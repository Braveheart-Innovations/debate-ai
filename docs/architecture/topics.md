# Topics Catalog Architecture

This document describes how debate topics are defined and consumed across the app.

## Single Source of Truth
- Catalog path: `src/config/debate/topics/`
  - `schema.ts` — Types for `Topic`, `TopicCategoryId`, and `TopicCatalog`.
  - `index.ts` — The authoritative list of topic categories and topics.
- All preset topics and Surprise Me derive from this catalog via `TopicService`.

## Schema
- Categories (`TopicCategory`)
  - `id`: stable string id (`fun`, `tech`, `philosophy`, `society`, `science`, `entertainment`, `health`, `relationships`).
  - `name`, `icon`, `color`, `description`.
- Topics (`Topic`)
  - `id`: unique string id.
  - `text`: motion statement (not a question).
  - `categoryId`: one of the category ids above.
  - Optional: `difficulty`, `tags`, `popularity`.

Rule: Topics must be motion statements (end with a period; avoid question marks). This ensures clear affirmative/negative stances in debates.

## How It’s Used
- `TopicService` (`src/services/debate/TopicService.ts`)
  - `getCategories()`, `getTopicsByCategory(category)`, `getSuggestedTopics()`, `generateRandomTopic/String()`, `searchTopics()`, `getRelatedTopics()`.
  - `validateCustomTopic(topic)`: basic checks; includes a suggested motion if the input looks like a question.
  - `normalizeMotion(topic)`: utility to propose a motion phrasing for custom topics only (never auto-applies).
- UI surfaces
  - Preset Topics modal (`PresetTopicsModal`) reads categories and topics via `TopicService`.
  - Surprise Me (Debate setup) uses `TopicService.generateRandomTopicString()`.
  - Topic selector dropdown (`TopicSelector`) lists topics directly from the catalog.

## Custom Topics (User Input)
- If the user enters a question, we show a suggestion card:
  - Use Suggested, Edit, or Use As-Is.
  - We never auto-apply the normalization.

## Editing / Adding Topics
1) Edit `src/config/debate/topics/index.ts`.
2) Ensure each `text` is a motion statement (e.g., `"Video games are art."`).
3) Assign a valid `categoryId`.
4) Optional: set `difficulty`, `tags`, `popularity` for sorting/search.
5) Run `npm run check` and test Preset Topics + Surprise Me in the app.

## What Was Removed
- Legacy topic lists and parallel configs were removed to prevent drift:
  - `src/constants/debateTopicCategories.ts`.
  - `src/constants/debateTopics.ts`.
  - `src/config/debateTopics.ts`.
- `src/config/debate/suggestedTopics.ts` is now a thin derived view over the catalog for components that expect that shape.

## Do Not
- Do not reintroduce new constants with topic strings.
- Do not add catalogs in other locations.

Keeping a single, typed catalog eliminates duplication, prevents subtle UI divergences, and makes topics easy to maintain.

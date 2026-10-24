# Store copy — v2.5.0

"What's new" text and App Review notes for the **v2.5.0** submission (marketing and runtime version 2.5.0).
Scope is every mobile change merged after the 2.4.1 build (`7363789e`). In that range only `aa80a614` touches the
mobile app's `src/` (a new account's user document gets the `freeAnalyzesRemaining` counter, as on the web), with no
user-visible effect; everything below comes from the 2.5.0 release branch.

| File | Where it goes | Limit | Count |
|------|---------------|-------|-------|
| `ios-whats-new.txt` | App Store **What's New in This Version** | 4000 | 1094 |
| `android-whats-new.txt` | Google Play **What's new** (release notes) | 500 | 418 |
| `app-review-notes.txt` | App Store Connect **App Review Information → Notes** | 4000 | 949 |

Description, short description, subtitle, and promotional text are unchanged from v2.0 (`docs/store/v2.0/`).

## Sources / accuracy decisions

- **Kimi K3.1 Pro** (new default) and **K3.1 Pro High-Speed**: in Moonshot's `/v1/models` from 2026-10-23;
  live-verified that day (temperature only 1, top_p only 0.95, tools and image input work). "A third cheaper than
  Kimi K3": $2/$10 per million tokens against K3's $3/$15, Moonshot's own endpoint as listed on OpenRouter (Moonshot's
  pricing page renders its tables client-side). "Two to three times the speed": Moonshot's K3.1 Pro quickstart.
- **Kimi K2 retiring**: Moonshot's pricing page says the K2 series closes to new users on 2026-10-31 and retires by the
  end of December 2026. K2.6, K2.7 Code and K2.7 Code High-Speed leave the picker and are aliased in the app (the app
  calls Moonshot directly, so the server's aliases don't apply). K2.7 Code High-Speed moves to K3.1 Pro High-Speed;
  the copy names only the two picker models.
- **Imagen 4**: Google shut it down on the Gemini API on 2026-08-17 (web 2.9.1 removed it then). The app called
  Google's `:predict` endpoint directly, so a saved Imagen pick failed until now. The `google-imagen` request path is
  removed and the three IDs alias to Gemini 3.1 Flash Image, Google's named replacement.
- **Replies no longer cut short**: the Advanced parameters sheet and Expert Mode saved every default with any
  edit, `maxTokens` 2048 included, so changing only temperature capped replies at 2,048 tokens. Cohere and
  Perplexity sent 2,048 even with nothing set (live check 2026-10-23: sonar-pro answered in 2,799 tokens with no
  limit), and voice debates gave every model 1,536, which models that reason first usually exceed. Now no limit is
  sent unless the user sets one (Claude, which requires one, gets the model's maximum when streamed and 16K
  otherwise), models that reason first get the 6,144 text ceiling in voice debates and as podcast host, and a
  one-time migration removes the old 2,048 from saved AI selections, chats and snapshots.
- **Under the hood**: the Expo SDK 57 patch set (expo 57.0.31), React Navigation 7.5, and Metro 0.84.5 everywhere.
  Clears Dependabot alerts for decode-uri-component and image-size; the braces and sprintf-js advisories were
  withdrawn. Not described further: no visible change.
- Not mentioned: K3.1's fixed sampling. The app already sends Kimi temperature 1, and its default top_p, 0.95, is
  the only value Kimi accepts.

# Store copy — v2.5.0

"What's new" text and App Review notes for the **v2.5.0** submission (marketing and runtime version 2.5.0).
Scope is every mobile change merged after the 2.4.1 build (`7363789e`). In that range only `aa80a614` touches the
mobile app's `src/` (a new account's user document gets the `freeAnalyzesRemaining` counter, as on the web), with no
user-visible effect; everything below comes from the 2.5.0 release branch.

| File | Where it goes | Limit | Count |
|------|---------------|-------|-------|
| `ios-whats-new.txt` | App Store **What's New in This Version** | 4000 | 811 |
| `android-whats-new.txt` | Google Play **What's new** (release notes) | 500 | 349 |
| `app-review-notes.txt` | App Store Connect **App Review Information → Notes** | 4000 | 872 |

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
- **Under the hood**: the Expo SDK 57 patch set (expo 57.0.31), React Navigation 7.5, and Metro 0.84.5 everywhere.
  Clears Dependabot alerts for decode-uri-component and image-size; the braces and sprintf-js advisories were
  withdrawn. Not described further: no visible change.
- Not mentioned: K3.1's fixed sampling. The app already sends Kimi temperature 1, and its default top_p, 0.95, is
  the only value Kimi accepts.

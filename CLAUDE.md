# Claude Code Instructions

## Translations

- `shared/locales/*.json` is the only source of truth for translated UI text.
- Do not edit `phone/assets/locales/*.json` directly.
- Web imports translations from `@live-translate/shared/locales`, so web text changes should be made in `shared/locales`.
- After changing any translation key or value, run `npm run locales:sync` from the repository root to regenerate the Flutter phone copies.
- If adding, renaming, or removing a translation key, update every language file in `shared/locales` in the same change.
- Before finishing translation work, run `npm run locales:check` to confirm `phone/assets/locales` matches `shared/locales`.

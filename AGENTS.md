# Agent Instructions

## Translations

- `shared/locales/*.json` is the only source of truth for translated UI text.
- Put all user-visible app text in `shared/locales`, including validation errors, empty states, snackbars/toasts, dialog copy, button labels, placeholders, aria labels, and fallback messages.
- Do not hardcode user-visible strings directly in web or phone code. Use translation keys from `shared/locales` instead.
- Validation libraries should return stable error codes such as `required` or `tooLong`; render those codes through i18n keys like `settings.error.required`.
- Do not edit `phone/assets/locales/*.json` directly.
- Web imports translations from `@live-translate/shared/locales`, so web text changes should be made in `shared/locales`.
- After changing any translation key or value, run `npm run locales:sync` from the repository root to regenerate the Flutter phone copies.
- If adding, renaming, or removing a translation key, update every language file in `shared/locales` in the same change.
- Before finishing translation work, run `npm run locales:check` to confirm `phone/assets/locales` matches `shared/locales`.

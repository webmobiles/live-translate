// Curated set of selectable countries (ISO 3166-1 alpha-2). The DB stores the
// code; the visible name is resolved through i18n: t('countries.' + code).
// Keep this in sync with the `countries` namespace in shared/locales/*.json.
export const COUNTRY_CODES: string[] = [
  'AR', 'AU', 'AT', 'BE', 'BR', 'CA', 'CL', 'CN', 'CO', 'CZ',
  'DK', 'EG', 'FI', 'FR', 'DE', 'GR', 'IN', 'ID', 'IE', 'IT',
  'JP', 'MX', 'MA', 'NL', 'NO', 'PE', 'PL', 'PT', 'RO', 'RU',
  'SA', 'KR', 'ES', 'SE', 'CH', 'TR', 'UA', 'AE', 'GB', 'US',
]

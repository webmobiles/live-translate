// System-wide password policy — mirror of the server rule in
// server/src/auth/routes.ts (passwordError): at least 8 characters and one
// uppercase letter. Returns an i18n error code (rendered under *.error.*) or
// null when the password is acceptable.
export function passwordError(password: string): string | null {
  if (password.length < 8) return 'password_too_short'
  if (!/[A-Z]/.test(password)) return 'password_no_uppercase'
  return null
}

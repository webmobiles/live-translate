/// System-wide password policy — mirror of the web/server rule
/// (server/src/auth/routes.ts passwordError): at least 8 characters and one
/// uppercase letter. Returns an i18n error code (rendered via s.t under
/// *.error.*) or null when the password is acceptable.
String? passwordErrorCode(String password) {
  if (password.length < 8) return 'password_too_short';
  if (!RegExp(r'[A-Z]').hasMatch(password)) return 'password_no_uppercase';
  return null;
}

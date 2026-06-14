/// App-wide configuration.
///
/// Defaults to the production server. Override at build/run time for local dev:
///   flutter run --dart-define=SERVER_URL=http://10.0.2.2:4000   # Android emulator → Mac localhost
///   flutter run --dart-define=SERVER_URL=http://192.168.x.x:4000 # physical device → LAN IP
///
/// (`10.0.2.2` is the Android emulator's alias for the host machine's localhost.)
const String kServerUrl = String.fromEnvironment(
  'SERVER_URL',
  defaultValue: 'https://translate.hellovia.app',
);

/// When false, the Google sign-in gate on the home screen is bypassed
/// (handy for local development without OAuth configured).
///
/// Toggle via .env (`REQUIRE_AUTH=false`) + `--dart-define-from-file=.env`,
/// or directly: `--dart-define=REQUIRE_AUTH=false`.
const bool kRequireAuth =
    bool.fromEnvironment('REQUIRE_AUTH', defaultValue: true);

/// Deep-link scheme used for the OAuth callback. Must match:
///   - the `scheme` in app config
///   - `appAuthRedirectScheme` in android/app/build.gradle
const String kAuthCallbackScheme = 'hellovia-translate';
const String kAuthCallbackUrl = '$kAuthCallbackScheme://auth-callback';

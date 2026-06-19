/// App-wide configuration.
///
/// Defaults to the production server. Override at build/run time for local dev:
///   flutter run --dart-define=SERVER_URL=http://10.0.2.2:4000   # Android emulator → Mac localhost
///   flutter run --dart-define=SERVER_URL=http://192.168.x.x:4000 # physical device → LAN IP
///
/// (`10.0.2.2` is the Android emulator's alias for the host machine's localhost.)
const String kServerUrl = String.fromEnvironment(
  'SERVER_URL',
  defaultValue: 'https://livetranslate.hellovia.app',
);

/// When true, solo rooms use Socket.IO like the web app's
/// `WEB_SOLOROOM_SOCKET=yes` mode. Default stays HTTP for compatibility.
///
/// Toggle via:
///   flutter run --dart-define=PHONE_SOLOROOM_SOCKET=yes
/// or:
///   flutter run --dart-define=PHONE_SOLOROOM_SOCKET=true
const String kPhoneSoloRoomSocketValue =
    String.fromEnvironment('PHONE_SOLOROOM_SOCKET', defaultValue: '');
const bool kPhoneSoloRoomSocket = kPhoneSoloRoomSocketValue == 'yes' ||
    kPhoneSoloRoomSocketValue == 'true';

/// Deep-link scheme used for the OAuth callback. Must match:
///   - the `scheme` in app config
///   - `appAuthRedirectScheme` in android/app/build.gradle
const String kAuthCallbackScheme = 'hellovia-translate';
const String kAuthCallbackUrl = '$kAuthCallbackScheme://auth-callback';

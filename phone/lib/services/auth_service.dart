import 'dart:convert';
import 'dart:io';

import 'package:flutter_web_auth_2/flutter_web_auth_2.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../config.dart';

/// Port of the Google-sign-in flow in mobile/app/index.tsx.
/// Opens `$SERVER_URL/auth/google` in a web session and waits for the
/// app to be re-opened via the `hellovia-translate://auth-callback` deep link.
class AuthService {
  static const _signedInKey = 'auth.googleSignedIn';

  static Future<bool> isSignedIn() async {
    final sp = await SharedPreferences.getInstance();
    return sp.getString(_signedInKey) == 'true';
  }

  static Future<void> _setSignedIn(bool value) async {
    final sp = await SharedPreferences.getInstance();
    await sp.setString(_signedInKey, value ? 'true' : 'false');
  }

  /// Returns an [AuthResult] describing the outcome.
  static Future<AuthResult> signInWithGoogle() async {
    final authUrl =
        '$kServerUrl/auth/google?returnTo=${Uri.encodeComponent(kAuthCallbackUrl)}';

    try {
      final resultUrl = await FlutterWebAuth2.authenticate(
        url: authUrl,
        callbackUrlScheme: kAuthCallbackScheme,
      );

      final uri = Uri.parse(resultUrl);
      final error = uri.queryParameters['error'];
      if (error != null) {
        return AuthResult(success: false, error: error);
      }

      await _setSignedIn(true);
      final needsOnboarding = uri.queryParameters['onboarding'] == '1';
      return AuthResult(success: true, needsOnboarding: needsOnboarding);
    } catch (_) {
      // User cancelled or the web session failed.
      return const AuthResult(success: false, error: 'oauth_failed');
    }
  }

  static Future<AuthResult> signInWithEmail({
    required String email,
    required String password,
  }) =>
      _authenticateWithEmail(
        path: '/auth/email/login',
        email: email,
        password: password,
      );

  static Future<AuthResult> createAccountWithEmail({
    required String email,
    required String password,
    String? name,
  }) =>
      _authenticateWithEmail(
        path: '/auth/email/signup',
        email: email,
        password: password,
        name: name,
      );

  static Future<AuthResult> _authenticateWithEmail({
    required String path,
    required String email,
    required String password,
    String? name,
  }) async {
    try {
      final client = HttpClient();
      final uri = Uri.parse('$kServerUrl$path');
      final req = await client.postUrl(uri);
      req.headers.contentType = ContentType.json;
      req.write(jsonEncode({
        'email': email,
        'password': password,
        if (name != null && name.trim().isNotEmpty) 'name': name.trim(),
      }));
      final res = await req.close();
      final body = await utf8.decoder.bind(res).join();
      final decoded = body.isNotEmpty ? jsonDecode(body) : null;
      client.close(force: true);

      if (res.statusCode < 200 || res.statusCode >= 300) {
        final error = decoded is Map ? decoded['error']?.toString() : null;
        return AuthResult(success: false, error: error ?? 'auth_failed');
      }

      await _setSignedIn(true);
      final needsOnboarding =
          decoded is Map && decoded['needsOnboarding'] == true;
      return AuthResult(success: true, needsOnboarding: needsOnboarding);
    } catch (_) {
      return const AuthResult(success: false, error: 'network');
    }
  }

  static Future<void> signOut() => _setSignedIn(false);
}

class AuthResult {
  final bool success;
  final String? error;
  final bool needsOnboarding;

  const AuthResult({
    required this.success,
    this.error,
    this.needsOnboarding = false,
  });
}

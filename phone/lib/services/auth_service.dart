import 'dart:convert';
import 'dart:io';

import 'package:flutter_web_auth_2/flutter_web_auth_2.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../config.dart';
import 'client_log_service.dart';

/// Port of the Google-sign-in flow in mobile/app/index.tsx.
/// Opens `$SERVER_URL/auth/google` in a web session and waits for the
/// app to be re-opened via the `hellovia-translate://auth-callback` deep link.
class AuthService {
  static const _signedInKey = 'auth.googleSignedIn';
  static const _tokenKey = 'auth.apiToken';

  static Future<bool> isSignedIn() async {
    final sp = await SharedPreferences.getInstance();
    return sp.getString(_signedInKey) == 'true';
  }

  static Future<void> _setSignedIn(bool value) async {
    final sp = await SharedPreferences.getInstance();
    await sp.setString(_signedInKey, value ? 'true' : 'false');
  }

  /// Bearer token used to authenticate API calls from the app (the phone has no
  /// cookie jar, so the server hands us this token on sign-in).
  static Future<String?> getToken() async {
    final sp = await SharedPreferences.getInstance();
    final t = sp.getString(_tokenKey);
    return (t != null && t.isNotEmpty) ? t : null;
  }

  static Future<void> _setToken(String? value) async {
    final sp = await SharedPreferences.getInstance();
    if (value == null || value.isEmpty) {
      await sp.remove(_tokenKey);
    } else {
      await sp.setString(_tokenKey, value);
    }
  }

  /// Returns an [AuthResult] describing the outcome.
  static Future<AuthResult> signInWithGoogle() async {
    final authUrl =
        '$kServerUrl/auth/google?returnTo=${Uri.encodeComponent(kAuthCallbackUrl)}';
    ClientLogService.info('client.auth.google.start', {
      'url': '$kServerUrl/auth/google',
      'returnToScheme': kAuthCallbackScheme,
    });

    try {
      final startedAt = DateTime.now();
      final resultUrl = await FlutterWebAuth2.authenticate(
        url: authUrl,
        callbackUrlScheme: kAuthCallbackScheme,
      );
      final durationMs = DateTime.now().difference(startedAt).inMilliseconds;

      final uri = Uri.parse(resultUrl);
      final error = uri.queryParameters['error'];
      if (error != null) {
        ClientLogService.warn('client.auth.google.failed', {
          'error': error,
          'durationMs': durationMs,
        });
        return AuthResult(success: false, error: error);
      }

      await _setSignedIn(true);
      await _setToken(uri.queryParameters['token']);
      final needsOnboarding = uri.queryParameters['onboarding'] == '1';
      ClientLogService.info('client.auth.google.ok', {
        'needsOnboarding': needsOnboarding,
        'durationMs': durationMs,
      });
      return AuthResult(success: true, needsOnboarding: needsOnboarding);
    } catch (err) {
      // User cancelled or the web session failed.
      ClientLogService.warn('client.auth.google.exception', {
        'error': err.toString(),
      });
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
    final startedAt = DateTime.now();
    final uri = Uri.parse('$kServerUrl$path');
    ClientLogService.info('client.http.request', {
      'method': 'POST',
      'url': uri.toString(),
      'path': path,
    });

    try {
      final client = HttpClient();
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
      final durationMs = DateTime.now().difference(startedAt).inMilliseconds;

      ClientLogService.info('client.http.response', {
        'method': 'POST',
        'url': uri.toString(),
        'path': path,
        'statusCode': res.statusCode,
        'durationMs': durationMs,
        'error': decoded is Map ? decoded['error']?.toString() : null,
      });

      if (res.statusCode < 200 || res.statusCode >= 300) {
        final error = decoded is Map ? decoded['error']?.toString() : null;
        return AuthResult(success: false, error: error ?? 'auth_failed');
      }

      await _setSignedIn(true);
      await _setToken(decoded is Map ? decoded['token']?.toString() : null);
      final needsOnboarding =
          decoded is Map && decoded['needsOnboarding'] == true;
      return AuthResult(success: true, needsOnboarding: needsOnboarding);
    } catch (err) {
      ClientLogService.error('client.http.exception', {
        'method': 'POST',
        'url': uri.toString(),
        'path': path,
        'durationMs': DateTime.now().difference(startedAt).inMilliseconds,
        'error': err.toString(),
      });
      return const AuthResult(success: false, error: 'network');
    }
  }

  static Future<void> signOut() async {
    await _setSignedIn(false);
    await _setToken(null);
    await ClientLogService.flush();
  }

  /// Fetches the signed-in user's profile from the server. Returns the decoded
  /// JSON (`/auth/me` shape) or null when unauthenticated / on error.
  static Future<Map<String, dynamic>?> fetchMe() async {
    final token = await getToken();
    if (token == null) return null;
    final uri = Uri.parse('$kServerUrl/auth/me');
    try {
      final client = HttpClient();
      final req = await client.getUrl(uri);
      req.headers.set(HttpHeaders.authorizationHeader, 'Bearer $token');
      final res = await req.close();
      final body = await utf8.decoder.bind(res).join();
      client.close(force: true);
      if (res.statusCode < 200 || res.statusCode >= 300) return null;
      final decoded = body.isNotEmpty ? jsonDecode(body) : null;
      return decoded is Map<String, dynamic> ? decoded : null;
    } catch (err) {
      ClientLogService.warn('client.profile.fetchMe.exception', {
        'error': err.toString(),
      });
      return null;
    }
  }

  /// Persists the profile to the server (`PATCH /auth/profile`). Returns the
  /// updated user JSON on success; throws with the server error code otherwise.
  static Future<Map<String, dynamic>> saveProfile({
    required String nickname,
    String? firstName,
    String? lastName,
    String? country,
    required String motherLanguage,
    required String targetLanguage,
  }) async {
    final token = await getToken();
    if (token == null) throw Exception('unauthenticated');
    final uri = Uri.parse('$kServerUrl/auth/profile');
    final client = HttpClient();
    final req = await client.patchUrl(uri);
    req.headers.contentType = ContentType.json;
    req.headers.set(HttpHeaders.authorizationHeader, 'Bearer $token');
    // first/last/country omitted when null → the server keeps the prior value
    // (onboarding saves only nickname + languages).
    req.write(jsonEncode({
      'nickname': nickname,
      if (firstName != null) 'firstName': firstName,
      if (lastName != null) 'lastName': lastName,
      if (country != null) 'country': country,
      'motherLanguage': motherLanguage,
      'targetLanguage': targetLanguage,
    }));
    final res = await req.close();
    final body = await utf8.decoder.bind(res).join();
    client.close(force: true);
    final decoded = body.isNotEmpty ? jsonDecode(body) : null;
    if (res.statusCode < 200 || res.statusCode >= 300) {
      final error = decoded is Map ? decoded['error']?.toString() : null;
      throw Exception(error ?? 'save_failed');
    }
    return decoded is Map<String, dynamic> ? decoded : <String, dynamic>{};
  }
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

import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/foundation.dart';

import '../config.dart';

class ClientLogService {
  static final String _sessionId =
      '${DateTime.now().millisecondsSinceEpoch}-${Random().nextInt(1 << 32)}';
  static final List<Map<String, dynamic>> _pending = [];
  static Timer? _flushTimer;
  static bool _flushing = false;

  static void info(String event, Map<String, Object?> data) =>
      log('info', event, data);

  static void warn(String event, Map<String, Object?> data) =>
      log('warn', event, data);

  static void error(String event, Map<String, Object?> data) =>
      log('error', event, data);

  static void log(String level, String event, Map<String, Object?> data) {
    final entry = <String, dynamic>{
      'level': level,
      'event': event,
      'time': DateTime.now().toUtc().toIso8601String(),
      ..._redact(data),
    };

    debugPrint('[client-log] $event ${jsonEncode(entry)}');
    _pending.add(entry);
    if (_pending.length > 200) _pending.removeRange(0, _pending.length - 200);

    _flushTimer ??= Timer(const Duration(milliseconds: 750), () {
      _flushTimer = null;
      unawaited(flush());
    });
  }

  static Future<void> flush() async {
    if (_flushing || _pending.isEmpty) return;
    _flushing = true;
    final batch = List<Map<String, dynamic>>.from(_pending.take(50));
    _pending.removeRange(0, batch.length);

    try {
      final uri = Uri.parse('$kServerUrl/client/logs');
      final client = HttpClient()..connectionTimeout = const Duration(seconds: 5);
      final req = await client.postUrl(uri).timeout(const Duration(seconds: 5));
      req.headers.contentType = ContentType.json;
      req.write(jsonEncode({
        'app': 'phone',
        'platform': Platform.operatingSystem,
        'sessionId': _sessionId,
        'logs': batch,
      }));
      final res = await req.close().timeout(const Duration(seconds: 5));
      await res.drain<void>();
      client.close(force: true);
      if (res.statusCode < 200 || res.statusCode >= 300) {
        _pending.insertAll(0, batch);
      }
    } catch (err) {
      _pending.insertAll(0, batch);
      debugPrint('[client-log] flush failed $err');
    } finally {
      _flushing = false;
    }
  }

  static Map<String, Object?> _redact(Map<String, Object?> data) {
    final out = <String, Object?>{};
    for (final entry in data.entries) {
      final key = entry.key.toLowerCase();
      if (key.contains('password') ||
          key.contains('token') ||
          key.contains('authorization') ||
          key.contains('audiobase64')) {
        out[entry.key] = '[redacted]';
      } else {
        out[entry.key] = entry.value;
      }
    }
    return out;
  }
}

import 'dart:convert';
import 'dart:io';
import 'dart:math';

import '../config.dart';
import '../models/message.dart';
import '../models/room_config.dart';

/// HTTP client for solo ("Solo / Duo") rooms.
///
/// Solo rooms have a single user on one device, so there's no need for a live
/// Socket.IO connection — every action is a plain request/response. This mirrors
/// the web app, which calls the same `/api/solo/rooms/*` endpoints. No auth/
/// session cookie is required: the server looks rooms up by code.
class SoloApi {
  static Future<Map<String, dynamic>> _post(
    String path,
    Map<String, dynamic> body,
  ) async {
    final client = HttpClient();
    try {
      final uri = Uri.parse('$kServerUrl$path');
      final req = await client.postUrl(uri);
      req.headers.contentType = ContentType.json;
      req.write(jsonEncode(body));
      final res = await req.close();
      final text = await utf8.decoder.bind(res).join();
      final decoded = text.isNotEmpty
          ? jsonDecode(text) as Map<String, dynamic>
          : <String, dynamic>{};
      if (res.statusCode < 200 ||
          res.statusCode >= 300 ||
          decoded['ok'] != true) {
        throw SoloApiException(
          decoded['error']?.toString() ?? 'Request failed (${res.statusCode})',
        );
      }
      return decoded;
    } finally {
      client.close(force: true);
    }
  }

  /// `POST /api/solo/rooms` — create a solo room. Returns its code + name.
  static Future<SoloRoom> createRoom({
    String? name,
    required RoomConfig config,
  }) async {
    final res = await _post('/api/solo/rooms', {
      if (name != null && name.trim().isNotEmpty) 'name': name.trim(),
      'config': config.toJson(),
    });
    final room = res['room'] as Map?;
    final code = res['code'] as String;
    return SoloRoom(code: code, name: (room?['name'] as String?) ?? code);
  }

  /// `POST /api/solo/rooms/:code/text` — translate a typed message.
  static Future<Message> sendText({
    required String code,
    required String text,
    required String clientMsgId,
    required String sender,
    required String senderLang,
    required String targetLang,
  }) async {
    final res = await _post('/api/solo/rooms/${Uri.encodeComponent(code)}/text', {
      'text': text,
      'clientMsgId': clientMsgId,
      'sender': sender,
      'senderLang': senderLang,
      'targetLang': targetLang,
    });
    return Message.fromJson(Map<String, dynamic>.from(res['message'] as Map));
  }

  /// `POST /api/solo/rooms/:code/audio` — transcribe + translate a voice clip.
  static Future<Message> sendAudio({
    required String code,
    required String audioBase64,
    required String mimeType,
    required int durationMs,
    required String sender,
    required String senderLang,
    required String targetLang,
  }) async {
    final res =
        await _post('/api/solo/rooms/${Uri.encodeComponent(code)}/audio', {
      'audioBase64': audioBase64,
      'mimeType': mimeType,
      'durationMs': durationMs,
      'sender': sender,
      'senderLang': senderLang,
      'targetLang': targetLang,
    });
    return Message.fromJson(Map<String, dynamic>.from(res['message'] as Map));
  }

  /// UUID v4 — used as `clientMsgId` so the server reuses the same id for the
  /// returned message (lets us replace the optimistic bubble in place).
  static String newId() {
    final r = Random();
    final b = List<int>.generate(16, (_) => r.nextInt(256));
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant 1
    String h(int x) => x.toRadixString(16).padLeft(2, '0');
    final s = b.map(h).join();
    return '${s.substring(0, 8)}-${s.substring(8, 12)}-${s.substring(12, 16)}'
        '-${s.substring(16, 20)}-${s.substring(20)}';
  }
}

class SoloRoom {
  final String code;
  final String name;
  const SoloRoom({required this.code, required this.name});
}

class SoloApiException implements Exception {
  final String message;
  const SoloApiException(this.message);
  @override
  String toString() => message;
}

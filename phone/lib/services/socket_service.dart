import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../config.dart';
import 'client_log_service.dart';

/// Port of mobile/src/lib/socket.ts — a lazily-created singleton Socket.IO
/// client with manual connect/disconnect.
class SocketService {
  static io.Socket? _socket;

  static io.Socket getSocket() {
    if (_socket != null) return _socket!;

    final socket = io.io(
      kServerUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .enableReconnection()
          .setReconnectionAttempts(5)
          .setReconnectionDelay(1000)
          .build(),
    );

    // Diagnostic logging — visible in `flutter run` console and `adb logcat`.
    socket.onConnect((_) {
      debugPrint('[socket] ✓ CONNECTED to $kServerUrl  (id=${socket.id})');
      ClientLogService.info('client.socket.connected', {
        'url': kServerUrl,
        'socketId': socket.id,
      });
    });
    socket.onConnectError((e) {
      debugPrint('[socket] ✗ CONNECT_ERROR to $kServerUrl  →  $e');
      ClientLogService.warn('client.socket.connect_error', {
        'url': kServerUrl,
        'error': e.toString(),
      });
    });
    socket.onError((e) {
      debugPrint('[socket] ✗ ERROR  →  $e');
      ClientLogService.error('client.socket.error', {
        'url': kServerUrl,
        'error': e.toString(),
      });
    });
    socket.onDisconnect((reason) {
      debugPrint('[socket] – disconnected');
      ClientLogService.info('client.socket.disconnected', {
        'url': kServerUrl,
        'reason': reason?.toString(),
      });
    });

    _socket = socket;
    return socket;
  }

  static io.Socket connect() {
    final s = getSocket();
    if (!s.connected) {
      ClientLogService.info('client.socket.connect_start', {'url': kServerUrl});
      s.connect();
    }
    return s;
  }

  static void emitWithAckLogged(
    String event,
    Map<String, dynamic> payload, {
    required void Function(dynamic data) ack,
  }) {
    final socket = connect();
    final startedAt = DateTime.now();
    ClientLogService.info('client.socket.emit', {
      'url': kServerUrl,
      'eventName': event,
      'payloadKeys': payload.keys.join(','),
      'connected': socket.connected,
    });

    socket.emitWithAck(
      event,
      payload,
      ack: (data) {
        final durationMs = DateTime.now().difference(startedAt).inMilliseconds;
        final res = unwrapAck(data);
        ClientLogService.info('client.socket.ack', {
          'url': kServerUrl,
          'eventName': event,
          'durationMs': durationMs,
          'ok': res['ok'],
          'error': res['error'],
          'responseKeys': res.keys.join(','),
        });
        ack(data);
      },
    );
  }

  static void disconnect() {
    _socket?.disconnect();
    _socket = null;
  }

  /// socket.io-dart sometimes delivers the ack payload wrapped in a List.
  /// Normalise it to a single Map so callers can read `res['ok']` etc.
  static Map<String, dynamic> unwrapAck(dynamic ack) {
    final value = (ack is List && ack.isNotEmpty) ? ack.first : ack;
    if (value is Map) return Map<String, dynamic>.from(value);
    return <String, dynamic>{};
  }
}

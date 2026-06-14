import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../config.dart';

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
    socket.onConnect((_) =>
        debugPrint('[socket] ✓ CONNECTED to $kServerUrl  (id=${socket.id})'));
    socket.onConnectError((e) =>
        debugPrint('[socket] ✗ CONNECT_ERROR to $kServerUrl  →  $e'));
    socket.onError((e) => debugPrint('[socket] ✗ ERROR  →  $e'));
    socket.onDisconnect((_) => debugPrint('[socket] – disconnected'));

    _socket = socket;
    return socket;
  }

  static io.Socket connect() {
    final s = getSocket();
    if (!s.connected) s.connect();
    return s;
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

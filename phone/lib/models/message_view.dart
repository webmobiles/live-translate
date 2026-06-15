import 'message.dart';

/// Emitter / receiver roles for a message — see README "Emitter and receiver roles".
///
/// Every message has an emitter half (`senderLang` + original) and a receiver
/// half (`receiverLang` + translation), in BOTH solo and normal rooms. Roles are
/// per-message, not per-person: every emitter is also a receiver. This is the
/// Dart mirror of the web's `messageView` helper in `web/src/routes/room.$code.tsx`.
class MessageView {
  /// Language the message was spoken/written in.
  final String emitterLang;

  /// Language of the translation the receiver consumes.
  final String receiverLang;

  /// Is the viewing user the emitter of this message? (Always false in solo,
  /// where the one device represents both roles.)
  final bool viewerIsEmitter;

  /// May the viewer recover the original recording? (the emitter, a same-language
  /// listener, or solo — where the device holds both halves).
  final bool canRecoverOriginal;

  const MessageView({
    required this.emitterLang,
    required this.receiverLang,
    required this.viewerIsEmitter,
    required this.canRecoverOriginal,
  });

  factory MessageView.of(
    Message message, {
    required bool isSolo,
    List<String>? soloLanguages,
  }) {
    final emitterLang = message.senderLang;
    // Solo: the receiver is the other toggle side. Normal: the translation
    // target (which equals the viewer's current, changeable language).
    final receiverLang =
        isSolo && soloLanguages != null && soloLanguages.length >= 2
            ? (emitterLang == soloLanguages[0]
                ? soloLanguages[1]
                : soloLanguages[0])
            : message.targetLang;
    final viewerIsEmitter = !isSolo && message.isMine;
    final canRecoverOriginal =
        isSolo || viewerIsEmitter || emitterLang == receiverLang;
    return MessageView(
      emitterLang: emitterLang,
      receiverLang: receiverLang,
      viewerIsEmitter: viewerIsEmitter,
      canRecoverOriginal: canRecoverOriginal,
    );
  }
}

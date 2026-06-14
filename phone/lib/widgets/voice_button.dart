import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme.dart';

/// Port of mobile/src/components/VoiceButton.tsx — press-and-hold mic button
/// with a pulse animation while recording.
class VoiceButton extends StatefulWidget {
  final bool isRecording;
  final VoidCallback onPressIn;
  final VoidCallback onPressOut;
  final bool disabled;

  const VoiceButton({
    super.key,
    required this.isRecording,
    required this.onPressIn,
    required this.onPressOut,
    this.disabled = false,
  });

  @override
  State<VoiceButton> createState() => _VoiceButtonState();
}

class _VoiceButtonState extends State<VoiceButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 500),
      lowerBound: 1.0,
      upperBound: 1.25,
    );
  }

  @override
  void didUpdateWidget(VoiceButton old) {
    super.didUpdateWidget(old);
    if (widget.isRecording && !_ctrl.isAnimating) {
      _ctrl.repeat(reverse: true);
    } else if (!widget.isRecording) {
      _ctrl.stop();
      _ctrl.animateTo(1.0, duration: const Duration(milliseconds: 150));
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _down(_) {
    if (widget.disabled) return;
    HapticFeedback.mediumImpact();
    widget.onPressIn();
  }

  void _up(_) {
    if (widget.disabled) return;
    HapticFeedback.lightImpact();
    widget.onPressOut();
  }

  @override
  Widget build(BuildContext context) {
    return Listener(
      onPointerDown: _down,
      onPointerUp: _up,
      onPointerCancel: _up,
      child: ScaleTransition(
        scale: _ctrl,
        child: Opacity(
          opacity: widget.disabled ? 0.5 : 1,
          child: Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: widget.isRecording ? AppColors.danger : AppColors.primary,
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: Text(
              widget.isRecording ? '⏹' : '🎤',
              style: const TextStyle(fontSize: 20),
            ),
          ),
        ),
      ),
    );
  }
}

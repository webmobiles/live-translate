import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme.dart';

/// Port of mobile/src/components/VoiceButton.tsx — press-and-hold mic button
/// with a pulse animation while recording.
///
/// WhatsApp-style cancel: while held, a 40×40 trash target floats above the
/// button. Drag the pressed finger up onto it and release to discard the
/// recording (via [onCancel]) instead of sending it.
class VoiceButton extends StatefulWidget {
  final bool isRecording;
  final VoidCallback onPressIn;
  final VoidCallback onPressOut;

  /// Called instead of [onPressOut] when the finger is released over the trash
  /// target. When null, the drag-to-cancel affordance is not shown.
  final VoidCallback? onCancel;
  final bool disabled;

  const VoiceButton({
    super.key,
    required this.isRecording,
    required this.onPressIn,
    required this.onPressOut,
    this.onCancel,
    this.disabled = false,
  });

  @override
  State<VoiceButton> createState() => _VoiceButtonState();
}

class _VoiceButtonState extends State<VoiceButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  // ── Drag-to-cancel ──────────────────────────────────────────────────────────
  static const double _trashSize = 120;
  // Distance from the button's top edge up to the trash centre.
  static const double _trashGap = 100;
  // How close (px) the finger must get to the trash centre to arm cancel.
  static const double _armRadius = 66;

  Offset? _trashCenter; // global coords, captured on press
  bool _cancelArmed = false;
  OverlayEntry? _trashOverlay;

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
      // If the parent stopped recording on its own, make sure the trash goes
      // away too.
      _removeTrash();
    }
  }

  @override
  void dispose() {
    _trashOverlay?.remove();
    _trashOverlay = null;
    _ctrl.dispose();
    super.dispose();
  }

  bool get _cancellable => widget.onCancel != null;

  void _down(PointerDownEvent e) {
    if (widget.disabled) return;
    HapticFeedback.mediumImpact();
    if (_cancellable) _showTrash();
    widget.onPressIn();
  }

  void _move(PointerMoveEvent e) {
    if (widget.disabled || _trashCenter == null) return;
    final armed = (e.position - _trashCenter!).distance <= _armRadius;
    if (armed != _cancelArmed) {
      if (armed) HapticFeedback.selectionClick();
      setState(() => _cancelArmed = armed);
      _trashOverlay?.markNeedsBuild();
    }
  }

  void _up(PointerEvent e) {
    if (widget.disabled) return;
    final cancel = _cancelArmed && _cancellable;
    _removeTrash();
    if (cancel) {
      HapticFeedback.heavyImpact();
      widget.onCancel!.call();
    } else {
      HapticFeedback.lightImpact();
      widget.onPressOut();
    }
  }

  void _showTrash() {
    final box = context.findRenderObject() as RenderBox?;
    final overlay = Overlay.maybeOf(context);
    if (box == null || overlay == null) return;
    final topCenter = box.localToGlobal(Offset(box.size.width / 2, 0));
    _trashCenter = topCenter.translate(0, -_trashGap);
    _trashOverlay?.remove();
    _trashOverlay = OverlayEntry(builder: (_) => _buildTrash());
    overlay.insert(_trashOverlay!);
  }

  void _removeTrash() {
    if (_cancelArmed) setState(() => _cancelArmed = false);
    _trashOverlay?.remove();
    _trashOverlay = null;
    _trashCenter = null;
  }

  Widget _buildTrash() {
    final c = _trashCenter;
    if (c == null) return const SizedBox.shrink();
    final armed = _cancelArmed;
    return Positioned(
      left: c.dx - _trashSize / 2,
      top: c.dy - _trashSize / 2,
      child: IgnorePointer(
        child: AnimatedScale(
          scale: armed ? 1.25 : 1.0,
          duration: const Duration(milliseconds: 120),
          child: Container(
            width: _trashSize,
            height: _trashSize,
            decoration: BoxDecoration(
              color: armed ? AppColors.danger : AppColors.card,
              shape: BoxShape.circle,
              border: Border.all(
                color: armed ? AppColors.danger : AppColors.border,
                width: 2,
              ),
            ),
            alignment: Alignment.center,
            child: Icon(
              armed ? Icons.delete : Icons.delete_outline,
              size: 66,
              color: armed ? Colors.white : AppColors.danger,
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final armed = _cancelArmed;
    return Listener(
      onPointerDown: _down,
      onPointerMove: _move,
      onPointerUp: _up,
      onPointerCancel: _up,
      child: ScaleTransition(
        scale: _ctrl,
        child: Opacity(
          opacity: widget.disabled ? 0.5 : (armed ? 0.55 : 1),
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
              style: TextStyle(fontSize: 20),
            ),
          ),
        ),
      ),
    );
  }
}

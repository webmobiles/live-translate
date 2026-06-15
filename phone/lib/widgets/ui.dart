import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme.dart';

enum AppButtonVariant { primary, outline, secondary, ghost }

enum AppButtonSize { normal, large, icon }

/// Port of mobile/src/components/ui/button.tsx
class AppButton extends StatelessWidget {
  final VoidCallback? onPressed;
  final String? label;
  final Widget? child;
  final AppButtonVariant variant;
  final AppButtonSize size;
  final bool loading;
  final bool disabled;
  final Color? labelColor;
  final EdgeInsetsGeometry? margin;

  const AppButton({
    super.key,
    this.onPressed,
    this.label,
    this.child,
    this.variant = AppButtonVariant.primary,
    this.size = AppButtonSize.normal,
    this.loading = false,
    this.disabled = false,
    this.labelColor,
    this.margin,
  });

  @override
  Widget build(BuildContext context) {
    final isDisabled = disabled || loading || onPressed == null;

    Color bg;
    Border? border;
    switch (variant) {
      case AppButtonVariant.primary:
        bg = AppColors.primary;
        break;
      case AppButtonVariant.outline:
        bg = Colors.transparent;
        border = Border.all(color: AppColors.primary, width: 2);
        break;
      case AppButtonVariant.secondary:
        bg = AppColors.card;
        border = Border.all(color: AppColors.border);
        break;
      case AppButtonVariant.ghost:
        bg = Colors.transparent;
        break;
    }

    final isIcon = size == AppButtonSize.icon;
    final vPad = size == AppButtonSize.large ? 18.0 : 14.0;

    final content = loading
        ? const SizedBox(
            height: 22,
            width: 22,
            child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.text),
          )
        : child ??
            Text(
              label ?? '',
              style: TextStyle(
                color: labelColor ?? _defaultLabelColor(),
                fontSize: size == AppButtonSize.large ? 18 : 16,
                fontWeight: FontWeight.bold,
              ),
            );

    final button = Opacity(
      opacity: isDisabled ? 0.5 : 1,
      child: Material(
        color: bg,
        borderRadius: BorderRadius.circular(isIcon ? 999 : 16),
        child: InkWell(
          borderRadius: BorderRadius.circular(isIcon ? 999 : 16),
          onTap: isDisabled ? null : onPressed,
          child: Container(
            padding: isIcon
                ? const EdgeInsets.all(8)
                : EdgeInsets.symmetric(vertical: vPad, horizontal: 20),
            decoration: BoxDecoration(
              border: border,
              borderRadius: BorderRadius.circular(isIcon ? 999 : 16),
            ),
            alignment: Alignment.center,
            child: content,
          ),
        ),
      ),
    );

    final wrapped = isIcon ? button : SizedBox(width: double.infinity, child: button);
    return margin != null ? Padding(padding: margin!, child: wrapped) : wrapped;
  }

  Color _defaultLabelColor() {
    switch (variant) {
      case AppButtonVariant.primary:
        return AppColors.text;
      case AppButtonVariant.outline:
        return AppColors.primary;
      default:
        return AppColors.text;
    }
  }
}

/// Port of mobile/src/components/ui/card.tsx
class AppCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color? color;
  final Color? borderColor;

  const AppCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.color,
    this.borderColor,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: color ?? AppColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: borderColor ?? AppColors.border),
      ),
      child: child,
    );
  }
}

/// Port of mobile/src/components/ui/input.tsx
class AppInput extends StatefulWidget {
  final String? label;
  final String? hint;
  final TextEditingController controller;
  final ValueChanged<String>? onChanged;
  final int? maxLength;
  final bool autofocus;
  final TextAlign textAlign;
  final TextCapitalization textCapitalization;
  final TextStyle? textStyle;
  final List<TextInputFormatter>? inputFormatters;
  final bool obscureText;
  final TextInputType? keyboardType;

  const AppInput({
    super.key,
    this.label,
    this.hint,
    required this.controller,
    this.onChanged,
    this.maxLength,
    this.autofocus = false,
    this.textAlign = TextAlign.start,
    this.textCapitalization = TextCapitalization.none,
    this.textStyle,
    this.inputFormatters,
    this.obscureText = false,
    this.keyboardType,
  });

  @override
  State<AppInput> createState() => _AppInputState();
}

class _AppInputState extends State<AppInput> {
  late bool _obscured = widget.obscureText;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (widget.label != null) ...[
          Text(
            widget.label!.toUpperCase(),
            style: TextStyle(
              color: AppColors.muted,
              fontSize: 12,
              fontWeight: FontWeight.w500,
              letterSpacing: 1,
            ),
          ),
          const SizedBox(height: 6),
        ],
        TextField(
          controller: widget.controller,
          onChanged: widget.onChanged,
          autofocus: widget.autofocus,
          textAlign: widget.textAlign,
          textCapitalization: widget.textCapitalization,
          inputFormatters: widget.inputFormatters,
          obscureText: _obscured,
          keyboardType: widget.keyboardType,
          maxLength: widget.maxLength,
          maxLines: 1,
          style: widget.textStyle ??
              TextStyle(color: AppColors.text, fontSize: 16),
          cursorColor: AppColors.primary,
          decoration: InputDecoration(
            counterText: '',
            hintText: widget.hint,
            hintStyle: TextStyle(color: AppColors.muted),
            filled: true,
            fillColor: AppColors.card,
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            // Reveal toggle, shown only for obscured (password) fields.
            suffixIcon: widget.obscureText
                ? IconButton(
                    icon: Icon(
                      _obscured ? Icons.visibility_off : Icons.visibility,
                      color: AppColors.muted,
                      size: 20,
                    ),
                    splashRadius: 20,
                    tooltip: _obscured ? 'Show password' : 'Hide password',
                    onPressed: () => setState(() => _obscured = !_obscured),
                  )
                : null,
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: AppColors.border),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: AppColors.primary),
            ),
          ),
        ),
      ],
    );
  }
}

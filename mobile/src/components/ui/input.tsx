import React from 'react';
import { TextInput, View, Text, type TextInputProps } from 'react-native';
import { cn } from '@/lib/utils';

interface InputProps extends TextInputProps {
  label?: string
  error?: string
  className?: string
  containerClassName?: string
}

export function Input({
  label,
  error,
  className,
  containerClassName,
  ...props
}: InputProps) {
  return (
    <View className={cn('gap-1.5', containerClassName)}>
      {label && (
        <Text className="text-muted text-xs font-medium uppercase tracking-wider">
          {label}
        </Text>
      )}
      <TextInput
        placeholderTextColor="#8A8AA3"
        className={cn(
          'bg-card border border-border rounded-xl px-4 py-3.5',
          'text-white text-base',
          'focus:border-primary',
          error && 'border-danger',
          className,
        )}
        {...props}
      />
      {error && (
        <Text className="text-danger text-xs">{error}</Text>
      )}
    </View>
  )
}

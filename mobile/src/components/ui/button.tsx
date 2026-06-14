import React from 'react';
import { Pressable, Text, ActivityIndicator, type PressableProps } from 'react-native';
import { cn } from '@/lib/utils';

type ButtonVariant = 'default' | 'secondary' | 'ghost' | 'destructive' | 'outline'
type ButtonSize   = 'default' | 'sm' | 'lg' | 'icon'

const ROOT: Record<ButtonVariant, string> = {
  default:     'bg-primary',
  secondary:   'bg-card border border-border',
  ghost:       'bg-transparent',
  destructive: 'bg-danger',
  outline:     'bg-transparent border border-border',
}

const LABEL: Record<ButtonVariant, string> = {
  default:     'text-white font-bold',
  secondary:   'text-muted font-medium',
  ghost:       'text-muted font-medium',
  destructive: 'text-white font-bold',
  outline:     'text-white font-medium',
}

const SIZE: Record<ButtonSize, string> = {
  default: 'rounded-2xl py-4 px-6',
  sm:      'rounded-xl py-2.5 px-4',
  lg:      'rounded-2xl py-5 px-8',
  icon:    'rounded-full p-3',
}

const LABEL_SIZE: Record<ButtonSize, string> = {
  default: 'text-base',
  sm:      'text-sm',
  lg:      'text-lg',
  icon:    'text-base',
}

interface ButtonProps extends PressableProps {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  label?: string
  className?: string
  labelClassName?: string
  children?: React.ReactNode
}

export function Button({
  variant = 'default',
  size    = 'default',
  loading,
  label,
  className,
  labelClassName,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading

  return (
    <Pressable
      disabled={isDisabled}
      className={cn(
        'items-center justify-center flex-row gap-2 active:opacity-75',
        ROOT[variant],
        SIZE[size],
        isDisabled && 'opacity-50',
        className,
      )}
      {...props}
    >
      {loading && <ActivityIndicator size="small" color="white" />}
      {children ?? (
        <Text className={cn(LABEL[variant], LABEL_SIZE[size], labelClassName)}>
          {label}
        </Text>
      )}
    </Pressable>
  )
}

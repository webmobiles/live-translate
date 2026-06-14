import React from 'react';
import { Text as RNText, type TextProps } from 'react-native';
import { cn } from '@/lib/utils';

type TextVariant = 'default' | 'muted' | 'accent' | 'danger' | 'primary'
type TextSize    = 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl'

const VARIANT: Record<TextVariant, string> = {
  default: 'text-white',
  muted:   'text-muted',
  accent:  'text-accent',
  danger:  'text-danger',
  primary: 'text-primary',
}

const SIZE: Record<TextSize, string> = {
  xs:   'text-xs',
  sm:   'text-sm',
  base: 'text-base',
  lg:   'text-lg',
  xl:   'text-xl',
  '2xl':'text-2xl',
  '3xl':'text-3xl',
  '4xl':'text-4xl',
}

interface UITextProps extends TextProps {
  variant?:  TextVariant
  size?:     TextSize
  bold?:     boolean
  semibold?: boolean
  className?: string
  children?: React.ReactNode
}

export function UIText({
  variant  = 'default',
  size     = 'base',
  bold,
  semibold,
  className,
  children,
  ...props
}: UITextProps) {
  return (
    <RNText
      className={cn(
        VARIANT[variant],
        SIZE[size],
        bold     && 'font-bold',
        semibold && 'font-semibold',
        className,
      )}
      {...props}
    >
      {children}
    </RNText>
  )
}

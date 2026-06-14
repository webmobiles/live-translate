import React from 'react';
import { View, type ViewProps } from 'react-native';
import { cn } from '@/lib/utils';

interface CardProps extends ViewProps {
  className?: string
  children: React.ReactNode
}

export function Card({ className, children, ...props }: CardProps) {
  return (
    <View
      className={cn('bg-card border border-border rounded-2xl', className)}
      {...props}
    >
      {children}
    </View>
  )
}

export function CardContent({ className, children, ...props }: CardProps) {
  return (
    <View className={cn('p-5', className)} {...props}>
      {children}
    </View>
  )
}

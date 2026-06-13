import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'

import { cn } from '@/lib/utils'

const alertVariants = cva(
  'relative grid w-full grid-cols-[0_1fr] gap-x-3 rounded-lg border px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] [&>svg]:size-4 [&>svg]:translate-y-0.5',
  {
    variants: {
      variant: {
        default: 'border-lt-border bg-lt-card text-white',
        destructive: 'border-lt-danger/40 bg-lt-danger/10 text-white [&>svg]:text-lt-danger',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      role="alert"
      data-slot="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-title"
      className={cn('col-start-2 font-medium leading-none tracking-normal', className)}
      {...props}
    />
  )
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn('col-start-2 mt-1 text-lt-muted text-sm', className)}
      {...props}
    />
  )
}

export { Alert, AlertDescription, AlertTitle }

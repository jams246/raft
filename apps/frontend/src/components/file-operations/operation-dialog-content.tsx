'use client'

import type { ComponentProps, ReactNode } from 'react'
import { DialogContent } from '@/components/ui/dialog'

interface OperationDialogContentProps extends Omit<ComponentProps<typeof DialogContent>, 'onCloseAutoFocus' | 'onEscapeKeyDown' | 'onInteractOutside'> {
  children: ReactNode
  isSubmitting: boolean
  onReturnFocus: () => void
}

export function OperationDialogContent({ children, isSubmitting, onReturnFocus, onOpenAutoFocus, ...props }: OperationDialogContentProps) {
  return (
    <DialogContent
      {...props}
      onCloseAutoFocus={(event) => {
        event.preventDefault()
        onReturnFocus()
      }}
      onEscapeKeyDown={(event) => {
        if (isSubmitting) event.preventDefault()
      }}
      onInteractOutside={(event) => event.preventDefault()}
      onOpenAutoFocus={onOpenAutoFocus}
    >
      {children}
    </DialogContent>
  )
}

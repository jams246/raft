'use client'

import { useCallback } from 'react'

export function useOperationDialogOpenChange(isSubmitting: boolean, onOpenChange: (open: boolean) => void, reset: () => void) {
  return useCallback(
    (open: boolean) => {
      if (!open && isSubmitting) return
      if (!open) reset()
      onOpenChange(open)
    },
    [isSubmitting, onOpenChange, reset]
  )
}

'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Progress as ProgressPrimitive } from 'radix-ui'

const PERCENTAGE_TOTAL = 100

function Progress({ className, value, ...props }: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root data-slot="progress" className={cn('relative h-2 w-full overflow-hidden bg-primary/20', className)} value={value} {...props}>
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="h-full w-full flex-1 bg-primary data-[state=indeterminate]:w-1/3 data-[state=indeterminate]:animate-[progress-indeterminate_1.5s_ease-in-out_infinite]"
        style={value == null ? undefined : { transform: `translateX(-${PERCENTAGE_TOTAL - value}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }

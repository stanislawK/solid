import type { ComponentProps } from "react"
import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

function Switch({
  className,
  children,
  ...props
}: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-muted shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[checked]:bg-primary",
        className
      )}
      {...props}
    >
      {children ?? <SwitchThumb />}
    </SwitchPrimitive.Root>
  )
}

function SwitchThumb({
  className,
  ...props
}: ComponentProps<typeof SwitchPrimitive.Thumb>) {
  return (
    <SwitchPrimitive.Thumb
      data-slot="switch-thumb"
      className={cn(
        "pointer-events-none block size-5 translate-x-0.5 rounded-full bg-background shadow-sm ring-0 transition-transform data-[checked]:translate-x-5",
        className
      )}
      {...props}
    />
  )
}

export { Switch, SwitchThumb }
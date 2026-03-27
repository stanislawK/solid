import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function PlantPreviewSkeleton() {
  return (
    <Card className="overflow-hidden flex h-full flex-col bg-card">
      <Skeleton className="h-48 w-full rounded-none" />
      <CardContent className="flex flex-1 flex-col p-5">
        <div className="mb-3 space-y-2">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>

        <div className="mb-4 flex-1 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-border/50 pt-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-14" />
          </div>
          <div className="space-y-2 text-right">
            <Skeleton className="ml-auto h-4 w-24" />
            <Skeleton className="ml-auto h-4 w-14" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
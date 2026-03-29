import { Check, Sparkles, Trash2, WandSparkles } from 'lucide-react'

import { PlantPreviewCard } from '@/components/plant-preview-card'
import { PlantPreviewSkeleton } from '@/components/plant-preview-skeleton'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { Plant } from '@/lib/plants'

interface DraftPreviewStepProps {
  selectedTitle: string | null
  isCreatingPlant: boolean
  creationError: string | null
  draftPlant: Plant | null
  isDeletingDraft: boolean
  onRetrySearch: () => void
  onBackToSearch: () => void
  onEdit: () => void
  onFinish: () => void
}

export function DraftPreviewStep({
  selectedTitle,
  isCreatingPlant,
  creationError,
  draftPlant,
  isDeletingDraft,
  onRetrySearch,
  onBackToSearch,
  onEdit,
  onFinish,
}: DraftPreviewStepProps) {
  return (
    <Card className="border-border/60 bg-card/95 shadow-sm">
      <CardHeader className="gap-3 border-b border-border/60 pb-5">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <WandSparkles className="size-5" />
          </div>
          <div>
            <CardTitle>Generowanie szkicu rośliny</CardTitle>
            <CardDescription>
              {selectedTitle ? `Źródło: ${selectedTitle}` : 'Przygotowujemy dane na podstawie wybranego artykułu.'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 p-6">
        {isCreatingPlant && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
            <PlantPreviewSkeleton />
            <Card className="border-border/60 bg-background/70">
              <CardContent className="space-y-4 p-6">
                <div className="space-y-2">
                  <Skeleton className="h-6 w-1/2" />
                  <Skeleton className="h-4 w-4/5" />
                </div>
                <Skeleton className="h-20 w-full rounded-2xl" />
                <div className="grid gap-3 md:grid-cols-3">
                  <Skeleton className="h-10 rounded-xl" />
                  <Skeleton className="h-10 rounded-xl" />
                  <Skeleton className="h-10 rounded-xl" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {!isCreatingPlant && creationError && (
          <div className="space-y-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
            <p className="text-sm text-destructive">{creationError}</p>
            <Button variant="outline" onClick={onRetrySearch}>
              Wróć do wyszukiwania
            </Button>
          </div>
        )}

        {!isCreatingPlant && draftPlant && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
            <PlantPreviewCard plant={draftPlant} />

            <Card className="border-border/60 bg-background/70">
              <CardContent className="space-y-5 p-6">
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold tracking-tight">Szkic gotowy</h2>
                  <p className="text-muted-foreground">
                    Możesz odrzucić tę wersję i wrócić do wyszukiwania, poprawić dane w kolejnym kroku albo od razu zakończyć dodawanie.
                  </p>
                </div>

                <div className="rounded-2xl border border-border/60 bg-card px-4 py-3 text-sm text-muted-foreground">
                  Po powrocie do wyszukiwania ten szkic zostanie usunięty z backendu, żeby nie zostawiać pustych wpisów.
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <Button variant="outline" onClick={onBackToSearch} disabled={isDeletingDraft}>
                    <Trash2 className="size-4" />
                    {isDeletingDraft ? 'Usuwanie...' : 'Wróć do wyszukiwania'}
                  </Button>
                  <Button variant="secondary" onClick={onEdit}>
                    <Sparkles className="size-4" />
                    Edytuj roślinę
                  </Button>
                  <Button onClick={onFinish}>
                    <Check className="size-4" />
                    Zakończ
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
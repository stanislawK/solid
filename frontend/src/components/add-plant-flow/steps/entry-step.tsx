import { Camera, Search, WandSparkles } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

import type { FlowMode } from '../model'

interface EntryStepProps {
  onChooseFlow: (mode: FlowMode) => void
}

export function EntryStep({ onChooseFlow }: EntryStepProps) {
  return (
    <Card className="border-border/60 bg-card/95 shadow-sm">
      <CardHeader className="gap-3 border-b border-border/60 pb-5">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <WandSparkles className="size-5" />
          </div>
          <div>
            <CardTitle>Jak chcesz dodać roślinę?</CardTitle>
            <CardDescription>
              Możesz skorzystać z obecnego wyszukiwania Wikipedii albo zacząć od rozpoznania rośliny na zdjęciu.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 p-6 md:grid-cols-2">
        <button
          type="button"
          onClick={() => onChooseFlow('wikipedia')}
          className="rounded-3xl border border-border/60 bg-background/80 p-6 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
        >
          <div className="mb-4 inline-flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Search className="size-5" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight">Wyszukaj w Wikipedii</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Wpisz nazwę rośliny, wybierz najlepszy artykuł i wygeneruj szkic dokładnie tak jak w obecnym przepływie.
          </p>
        </button>

        <button
          type="button"
          onClick={() => onChooseFlow('identify')}
          className="rounded-3xl border border-border/60 bg-background/80 p-6 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
        >
          <div className="mb-4 inline-flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Camera className="size-5" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight">Rozpoznaj ze zdjęcia</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Wgraj zdjęcie z dysku albo zrób je aparatem. Gemini przygotuje propozycje, które od razu sprawdzisz w Wikipedii.
          </p>
        </button>
      </CardContent>
    </Card>
  )
}
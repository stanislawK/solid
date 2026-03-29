import { ArrowLeft, Camera, Image as ImageIcon, Search, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { AiPlantIdentificationResponse } from '@/lib/plants'

interface IdentifyProposalsStepProps {
  identificationResult: AiPlantIdentificationResponse | null
  identifyPreviewUrl?: string
  identifyError: string | null
  selectedProposalIndex: number | null
  onBackToUpload: () => void
  onOpenCamera: () => void
  onSelectProposal: (proposalIndex: number) => void
}

export function IdentifyProposalsStep({
  identificationResult,
  identifyPreviewUrl,
  identifyError,
  selectedProposalIndex,
  onBackToUpload,
  onOpenCamera,
  onSelectProposal,
}: IdentifyProposalsStepProps) {
  return (
    <Card className="border-border/60 bg-card/95 shadow-sm">
      <CardHeader className="gap-3 border-b border-border/60 pb-5">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Sparkles className="size-5" />
          </div>
          <div>
            <CardTitle>Wybierz propozycję Gemini</CardTitle>
            <CardDescription>
              Propozycje są zapisane w tej sesji. Możesz wracać i zmieniać wybór bez ponownego wysyłania zdjęcia.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 p-6">
        {!identificationResult ? (
          <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-5 py-8 text-center text-sm text-muted-foreground">
            Najpierw wgraj zdjęcie rośliny, aby zobaczyć propozycje identyfikacji.
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
            <Card className="overflow-hidden border-border/60 bg-background/70">
              <div className="relative h-72 w-full overflow-hidden bg-muted">
                {identifyPreviewUrl ? (
                  <img src={identifyPreviewUrl} alt="Rozpoznawana roślina" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <ImageIcon className="size-12 text-muted-foreground/50" />
                  </div>
                )}
              </div>
              <CardContent className="space-y-3 p-5 text-sm text-muted-foreground">
                <p>
                  To zdjęcie zostanie przypisane do szkicu po wybraniu artykułu Wikipedii i utworzeniu rośliny.
                </p>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button variant="outline" onClick={onBackToUpload}>
                    <ArrowLeft className="size-4" />
                    Wgraj inne zdjęcie
                  </Button>
                  <Button variant="secondary" onClick={onOpenCamera}>
                    <Camera className="size-4" />
                    Zrób nowe zdjęcie
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              {identifyError && (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {identifyError}
                </div>
              )}

              {identificationResult.proposals.map((proposal, index) => {
                const isSelected = index === selectedProposalIndex

                return (
                  <button
                    key={`${proposal.name}-${proposal.latin_name ?? index}`}
                    type="button"
                    onClick={() => onSelectProposal(index)}
                    className={[
                      'w-full rounded-2xl border p-5 text-left transition-colors',
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-border/60 bg-background/80 hover:border-primary/50 hover:bg-primary/5',
                    ].join(' ')}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
                          Propozycja {index + 1}
                        </p>
                        <h3 className="mt-2 text-xl font-semibold tracking-tight">{proposal.name}</h3>
                        {proposal.latin_name && (
                          <p className="mt-1 text-sm italic text-muted-foreground">{proposal.latin_name}</p>
                        )}
                        <p className="mt-3 text-sm text-muted-foreground">
                          Po kliknięciu od razu wyszukamy pasujące artykuły Wikipedii i pokażemy je w kolejnym kroku.
                        </p>
                      </div>
                      <div className="inline-flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Search className="size-4" />
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
import { ArrowLeft, Image as ImageIcon, Search, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { getPlantImageUrl } from '@/lib/plants'

import type { FlowMode, WikipediaSearchResult } from '../model'

interface WikiSearchStepProps {
  flowMode: FlowMode | null
  hasIdentificationResult: boolean
  selectedProposalName: string | null
  selectedProposalLatinName: string | null
  searchTerm: string
  debouncedSearchTerm: string
  searchResults: WikipediaSearchResult[]
  isSearching: boolean
  isCreatingPlant: boolean
  searchError: string | null
  onSearchTermChange: (value: string) => void
  onBack: () => void
  onCreatePlant: (title: string) => void
  onCreatePlantWithAi: () => void
}

function getPlainTextSnippet(snippet: string) {
  const normalizedSnippet = snippet.trim()

  if (normalizedSnippet.length === 0) {
    return ''
  }

  if (typeof window === 'undefined') {
    return normalizedSnippet.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }

  const parsedDocument = new DOMParser().parseFromString(normalizedSnippet, 'text/html')
  return parsedDocument.body.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

export function WikiSearchStep({
  flowMode,
  hasIdentificationResult,
  selectedProposalName,
  selectedProposalLatinName,
  searchTerm,
  debouncedSearchTerm,
  searchResults,
  isSearching,
  isCreatingPlant,
  searchError,
  onSearchTermChange,
  onBack,
  onCreatePlant,
  onCreatePlantWithAi,
}: WikiSearchStepProps) {
  const shouldShowAiTile = !isSearching && debouncedSearchTerm.length >= 2 && !searchError

  return (
    <Card className="border-border/60 bg-card/95 shadow-sm">
      <CardHeader className="gap-3 border-b border-border/60 pb-5">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Search className="size-5" />
          </div>
          <div>
            <CardTitle>Wyszukaj artykuł Wikipedii</CardTitle>
            <CardDescription>
              Zacznij pisać nazwę rośliny. Po krótkiej chwili pokażemy najlepiej dopasowane tytuły.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {flowMode === 'identify'
              ? 'Wracasz do wyszukiwania Wikipedii z wybranej propozycji Gemini. Możesz też wrócić do propozycji i wybrać inną.'
              : 'Jeśli chcesz, możesz wrócić i wybrać inny sposób rozpoczęcia dodawania.'}
          </p>
          <Button variant="outline" onClick={onBack} disabled={isSearching || isCreatingPlant}>
            <ArrowLeft className="size-4" />
            {flowMode === 'identify' && hasIdentificationResult ? 'Wróć do propozycji' : 'Zmień sposób startu'}
          </Button>
        </div>

        {flowMode === 'identify' && selectedProposalName && (
          <div className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3 text-sm text-muted-foreground">
            Wyniki dla propozycji: <span className="font-medium text-foreground">{selectedProposalName}</span>
            {selectedProposalLatinName && <span> ({selectedProposalLatinName})</span>}
          </div>
        )}

        <div className="space-y-3">
          <label htmlFor="wiki-search" className="text-sm font-medium">
            Szukana roślina
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="wiki-search"
              value={searchTerm}
              onChange={(event) => onSearchTermChange(event.target.value)}
              placeholder="Np. Monstera deliciosa"
              className="h-11 pl-9"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Wybierz dokładny tytuł artykułu, z którego backend przygotuje pierwszy szkic rośliny.
          </p>
        </div>

        {searchError && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {searchError}
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Wyniki wyszukiwania
            </h2>
            {isSearching && <span className="text-sm text-muted-foreground">Szukam...</span>}
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {isSearching &&
              Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-32 rounded-2xl" />)}

            {!isSearching && debouncedSearchTerm.length < 2 && (
              <div className="col-span-full rounded-2xl border border-dashed border-border/70 bg-muted/30 px-5 py-8 text-center text-sm text-muted-foreground">
                Wpisz co najmniej 2 znaki, aby rozpocząć wyszukiwanie.
              </div>
            )}

            {!isSearching && debouncedSearchTerm.length >= 2 && searchResults.length === 0 && !searchError && (
              <div className="col-span-full rounded-2xl border border-dashed border-border/70 bg-muted/30 px-5 py-8 text-center text-sm text-muted-foreground">
                Nie znaleziono pasujących artykułów. Możesz spróbować innej nazwy albo skorzystać z kafelka AI poniżej.
              </div>
            )}

            {!isSearching &&
              searchResults.map((result) => {
                const thumbnailUrl = getPlantImageUrl(result.thumbnail)

                return (
                  <button
                    key={result.title}
                    type="button"
                    onClick={() => onCreatePlant(result.title)}
                    className="group overflow-hidden rounded-2xl border border-border/60 bg-background/80 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:pointer-events-none disabled:opacity-50"
                    disabled={isCreatingPlant}
                  >
                    <div className="flex min-h-32">
                      <div className="flex w-28 shrink-0 items-center justify-center bg-muted/60">
                        {thumbnailUrl ? (
                          <img src={thumbnailUrl} alt={result.title} className="h-full w-full object-cover" />
                        ) : (
                          <ImageIcon className="size-8 text-muted-foreground/50" />
                        )}
                      </div>

                      <div className="flex flex-1 flex-col p-4">
                        <div className="mb-3 inline-flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                          <Sparkles className="size-4" />
                        </div>
                        <p className="font-medium leading-relaxed">{result.title}</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {getPlainTextSnippet(result.snippet) || 'Brak podglądu opisu dla tego wyniku.'}
                        </p>
                      </div>
                    </div>
                  </button>
                )
              })}

            {shouldShowAiTile && (
              <button
                type="button"
                onClick={onCreatePlantWithAi}
                className="group overflow-hidden rounded-2xl border border-border/60 bg-background/80 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:pointer-events-none disabled:opacity-50"
                disabled={isCreatingPlant}
              >
                <div className="flex min-h-32">
                  <div className="flex w-28 shrink-0 items-center justify-center bg-primary/10 text-primary">
                    <Sparkles className="size-8" />
                  </div>

                  <div className="flex flex-1 flex-col p-4">
                    <div className="mb-3 inline-flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <Sparkles className="size-4" />
                    </div>
                    <p className="font-medium leading-relaxed">Utwórz przy użyciu AI</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {flowMode === 'identify'
                        ? 'Wygenerujemy szkic na podstawie nazwy i zachowamy przesłane zdjęcie zamiast pobierać obraz z Wikipedii lub Wikimedia Commons.'
                        : 'Wygenerujemy szkic na podstawie nazwy rośliny, nawet jeśli chcesz pominąć dostępne artykuły Wikipedii.'}
                    </p>
                  </div>
                </div>
              </button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
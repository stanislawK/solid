import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Camera, Check, Image as ImageIcon, Search, Sparkles, Trash2, WandSparkles } from 'lucide-react'

import { useAuth } from '@/components/auth-provider'
import { PlantPreviewCard } from '@/components/plant-preview-card'
import { PlantPreviewSkeleton } from '@/components/plant-preview-skeleton'
import { Button } from '@/components/ui/button'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from '@/components/ui/carousel'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { getPlantImageUrl, type Plant, type PlantUpdatePayload } from '@/lib/plants'

type Step = 0 | 1 | 2

interface AddPlantFlowProps {
  onClose: () => void
  closeRequestKey?: number
}

interface WikipediaSearchResult {
  title: string
  snippet: string
  thumbnail?: string | null
}

interface WikipediaSearchResponse {
  search_term: string
  results: WikipediaSearchResult[]
}

interface EditFormState {
  name: string
  latin_name: string
  description: string
  watering: number
  light: number
}

const TOTAL_STEPS = 3
const SEARCH_DEBOUNCE_MS = 450

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

function createEditForm(plant: Plant): EditFormState {
  return {
    name: plant.name,
    latin_name: plant.latin_name ?? '',
    description: plant.description ?? '',
    watering: plant.watering,
    light: plant.light,
  }
}

function normalizeOptionalString(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function buildUpdatePayload(editForm: EditFormState): PlantUpdatePayload {
  return {
    name: editForm.name.trim(),
    latin_name: normalizeOptionalString(editForm.latin_name),
    description: normalizeOptionalString(editForm.description),
    watering: editForm.watering,
    light: editForm.light,
  }
}

export function AddPlantFlow({ onClose, closeRequestKey = 0 }: AddPlantFlowProps) {
  const { token } = useAuth()
  const [carouselApi, setCarouselApi] = useState<CarouselApi>()
  const [step, setStep] = useState<Step>(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<WikipediaSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null)
  const [draftPlant, setDraftPlant] = useState<Plant | null>(null)
  const [isCreatingPlant, setIsCreatingPlant] = useState(false)
  const [creationError, setCreationError] = useState<string | null>(null)
  const [cleanupError, setCleanupError] = useState<string | null>(null)
  const [isDeletingDraft, setIsDeletingDraft] = useState(false)
  const [isSavingEdits, setIsSavingEdits] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [imageUploadError, setImageUploadError] = useState<string | null>(null)
  const [isClosingFlow, setIsClosingFlow] = useState(false)
  const [editForm, setEditForm] = useState<EditFormState>({
    name: '',
    latin_name: '',
    description: '',
    watering: 5,
    light: 5,
  })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const closeRequestRef = useRef(closeRequestKey)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim())
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [searchTerm])

  useEffect(() => {
    carouselApi?.scrollTo(step)
  }, [carouselApi, step])

  useEffect(() => {
    if (closeRequestKey === closeRequestRef.current) {
      return
    }

    closeRequestRef.current = closeRequestKey
    void handleClose()
  }, [closeRequestKey])

  useEffect(() => {
    if (!token) {
      setSearchResults([])
      setSearchError('Brak autoryzacji do wyszukiwania artykułów.')
      setIsSearching(false)
      return
    }

    if (debouncedSearchTerm.length < 2) {
      setSearchResults([])
      setSearchError(null)
      setIsSearching(false)
      return
    }

    const controller = new AbortController()
    let isActive = true

    const searchArticles = async () => {
      setIsSearching(true)
      setSearchError(null)

      try {
        const response = await fetch(
          `/api/wiki/get_wikipedia_articles?search_term=${encodeURIComponent(debouncedSearchTerm)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            signal: controller.signal,
          }
        )

        if (!response.ok) {
          throw new Error('Nie udało się pobrać wyników wyszukiwania.')
        }

        const data = (await response.json()) as WikipediaSearchResponse

        if (isActive) {
          setSearchResults(
            Array.isArray(data.results)
              ? data.results.filter(
                  (result): result is WikipediaSearchResult =>
                    typeof result?.title === 'string' &&
                    typeof result?.snippet === 'string' &&
                    (typeof result?.thumbnail === 'string' || result?.thumbnail == null)
                )
              : []
          )
        }
      } catch (error) {
        if (controller.signal.aborted || !isActive) {
          return
        }

        console.error('Failed to search Wikipedia titles', error)
        setSearchResults([])
        setSearchError('Nie udało się pobrać wyników. Spróbuj ponownie za chwilę.')
      } finally {
        if (isActive) {
          setIsSearching(false)
        }
      }
    }

    void searchArticles()

    return () => {
      isActive = false
      controller.abort()
    }
  }, [debouncedSearchTerm, token])

  const isEditDirty = useMemo(() => {
    if (!draftPlant) {
      return false
    }

    const currentPayload = buildUpdatePayload(editForm)
    const originalPayload = buildUpdatePayload(createEditForm(draftPlant))
    return JSON.stringify(currentPayload) !== JSON.stringify(originalPayload)
  }, [draftPlant, editForm])

  const resetDraftFlow = () => {
    setStep(0)
    setSelectedTitle(null)
    setDraftPlant(null)
    setCreationError(null)
    setCleanupError(null)
    setEditError(null)
    setImageUploadError(null)
    setEditForm({
      name: '',
      latin_name: '',
      description: '',
      watering: 5,
      light: 5,
    })
  }

  const deleteDraft = async (plantId: number) => {
    if (!token) {
      setCleanupError('Brak autoryzacji do usunięcia roboczej rośliny.')
      return false
    }

    setIsDeletingDraft(true)
    setCleanupError(null)

    try {
      const response = await fetch(`/api/plants/${plantId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Nie udało się usunąć rośliny roboczej.')
      }

      return true
    } catch (error) {
      console.error('Failed to delete draft plant', error)
      setCleanupError('Nie udało się usunąć roboczej rośliny. Spróbuj ponownie.')
      return false
    } finally {
      setIsDeletingDraft(false)
    }
  }

  const goBackToSearch = async () => {
    if (!draftPlant) {
      resetDraftFlow()
      return
    }

    const deleted = await deleteDraft(draftPlant.id)

    if (!deleted) {
      return
    }

    resetDraftFlow()
  }

  const handleClose = async () => {
    if (!draftPlant) {
      onClose()
      return
    }

    setIsClosingFlow(true)
    const deleted = await deleteDraft(draftPlant.id)
    setIsClosingFlow(false)

    if (deleted) {
      resetDraftFlow()
      onClose()
    }
  }

  const createPlantFromWikipedia = async (articleTitle: string) => {
    if (!token) {
      setCreationError('Brak autoryzacji do utworzenia rośliny.')
      return
    }

    setSelectedTitle(articleTitle)
    setStep(1)
    setCreationError(null)
    setCleanupError(null)
    setEditError(null)
    setImageUploadError(null)
    setIsCreatingPlant(true)

    try {
      const response = await fetch('/api/plants/wiki', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ article_title: articleTitle }),
      })

      if (!response.ok) {
        throw new Error('Nie udało się utworzyć rośliny na podstawie Wikipedii.')
      }

      const plant = (await response.json()) as Plant
      setDraftPlant(plant)
      setEditForm(createEditForm(plant))
    } catch (error) {
      console.error('Failed to create plant from Wikipedia', error)
      setCreationError('Nie udało się przygotować rośliny z wybranego artykułu. Wróć do wyszukiwania i spróbuj ponownie.')
    } finally {
      setIsCreatingPlant(false)
    }
  }

  const saveEdits = async () => {
    if (!draftPlant || !token) {
      return false
    }

    setIsSavingEdits(true)
    setEditError(null)

    try {
      const response = await fetch(`/api/plants/${draftPlant.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(buildUpdatePayload(editForm)),
      })

      if (!response.ok) {
        throw new Error('Nie udało się zapisać zmian.')
      }

      const updatedPlant = (await response.json()) as Plant
      setDraftPlant(updatedPlant)
      setEditForm(createEditForm(updatedPlant))
      return true
    } catch (error) {
      console.error('Failed to save plant edits', error)
      setEditError('Nie udało się zapisać zmian. Sprawdź pola i spróbuj ponownie.')
      return false
    } finally {
      setIsSavingEdits(false)
    }
  }

  const handleFinish = async () => {
    if (step === 2 && isEditDirty) {
      const saved = await saveEdits()
      if (!saved) {
        return
      }
    }

    resetDraftFlow()
    onClose()
  }

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!draftPlant || !token || !event.target.files?.length) {
      return
    }

    const file = event.target.files[0]
    const formData = new FormData()
    formData.append('file', file)
    setIsUploadingImage(true)
    setImageUploadError(null)

    try {
      const response = await fetch(`/api/plants/${draftPlant.id}/image`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Nie udało się zaktualizować zdjęcia.')
      }

      const updatedPlant = (await response.json()) as Plant
      setDraftPlant(updatedPlant)
      setEditForm(createEditForm(updatedPlant))
    } catch (error) {
      console.error('Failed to upload image', error)
      setImageUploadError('Nie udało się wgrać zdjęcia. Spróbuj ponownie innym plikiem.')
    } finally {
      setIsUploadingImage(false)
      event.target.value = ''
    }
  }

  const imageUrl = getPlantImageUrl(draftPlant?.image_url)

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8">
      <div className="flex flex-col gap-4 rounded-[calc(var(--radius)*1.5)] border border-border/60 bg-card/90 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
              <WandSparkles className="size-3.5 text-primary" />
              Kreator rośliny
            </div>
            <div className="space-y-1">
              <h1 className="text-4xl font-bold tracking-tight">Dodaj nową roślinę</h1>
              <p className="max-w-2xl text-base text-muted-foreground md:text-lg">
                Zacznij od wyszukania artykułu Wikipedii, wygeneruj szkic rośliny i dopracuj go przed zapisaniem na swojej liście.
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            className="self-start"
            onClick={() => {
              void handleClose()
            }}
            disabled={isDeletingDraft || isClosingFlow || isCreatingPlant || isSavingEdits || isUploadingImage}
          >
            <ArrowLeft className="size-4" />
            Wróć do kolekcji
          </Button>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-border/50 bg-background/70 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium">Krok {step + 1} z {TOTAL_STEPS}</p>
            <p className="text-sm text-muted-foreground">
              {step === 0 && 'Znajdź właściwy artykuł Wikipedii dla swojej rośliny.'}
              {step === 1 && 'Poczekaj na wygenerowanie szkicu i zdecyduj, co chcesz zrobić dalej.'}
              {step === 2 && 'Popraw szczegóły rośliny i zakończ dodawanie.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {Array.from({ length: TOTAL_STEPS }).map((_, index) => (
              <span
                key={index}
                className={[
                  'h-2.5 rounded-full transition-all',
                  index === step ? 'w-10 bg-primary' : 'w-2.5 bg-border',
                ].join(' ')}
              />
            ))}
          </div>
        </div>
      </div>

      {cleanupError && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex items-center justify-between gap-3 p-4 text-sm text-destructive">
            <span>{cleanupError}</span>
            {draftPlant && (
              <Button variant="destructive" size="sm" onClick={() => void goBackToSearch()} disabled={isDeletingDraft}>
                Ponów usuwanie draftu
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Carousel
        setApi={setCarouselApi}
        opts={{ align: 'start', watchDrag: false }}
        className="w-full"
      >
        <CarouselContent>
          <CarouselItem>
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
                <div className="space-y-3">
                  <label htmlFor="wiki-search" className="text-sm font-medium">
                    Szukana roślina
                  </label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="wiki-search"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
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
                      Array.from({ length: 6 }).map((_, index) => (
                        <Skeleton key={index} className="h-32 rounded-2xl" />
                      ))}

                    {!isSearching && debouncedSearchTerm.length < 2 && (
                      <div className="col-span-full rounded-2xl border border-dashed border-border/70 bg-muted/30 px-5 py-8 text-center text-sm text-muted-foreground">
                        Wpisz co najmniej 2 znaki, aby rozpocząć wyszukiwanie.
                      </div>
                    )}

                    {!isSearching && debouncedSearchTerm.length >= 2 && searchResults.length === 0 && !searchError && (
                      <div className="col-span-full rounded-2xl border border-dashed border-border/70 bg-muted/30 px-5 py-8 text-center text-sm text-muted-foreground">
                        Nie znaleziono pasujących artykułów. Spróbuj innej nazwy lub doprecyzuj zapytanie.
                      </div>
                    )}

                    {!isSearching &&
                      searchResults.map((result) => {
                        const thumbnailUrl = getPlantImageUrl(result.thumbnail)

                        return (
                          <button
                            key={result.title}
                            type="button"
                            onClick={() => {
                              void createPlantFromWikipedia(result.title)
                            }}
                            className="group overflow-hidden rounded-2xl border border-border/60 bg-background/80 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:pointer-events-none disabled:opacity-50"
                            disabled={isCreatingPlant}
                          >
                            <div className="flex min-h-32">
                              <div className="flex w-28 shrink-0 items-center justify-center bg-muted/60">
                                {thumbnailUrl ? (
                                  <img
                                    src={thumbnailUrl}
                                    alt={result.title}
                                    className="h-full w-full object-cover"
                                  />
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
                  </div>
                </div>
              </CardContent>
            </Card>
          </CarouselItem>

          <CarouselItem>
            <Card className="border-border/60 bg-card/95 shadow-sm">
              <CardHeader className="gap-3 border-b border-border/60 pb-5">
                <div className="flex items-center gap-3">
                  <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <WandSparkles className="size-5" />
                  </div>
                  <div>
                    <CardTitle>Generowanie szkicu rośliny</CardTitle>
                    <CardDescription>
                      {selectedTitle
                        ? `Źródło: ${selectedTitle}`
                        : 'Przygotowujemy dane na podstawie wybranego artykułu.'}
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
                    <Button variant="outline" onClick={() => resetDraftFlow()}>
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
                          <Button
                            variant="outline"
                            onClick={() => {
                              void goBackToSearch()
                            }}
                            disabled={isDeletingDraft}
                          >
                            <Trash2 className="size-4" />
                            {isDeletingDraft ? 'Usuwanie...' : 'Wróć do wyszukiwania'}
                          </Button>
                          <Button variant="secondary" onClick={() => setStep(2)}>
                            <Sparkles className="size-4" />
                            Edytuj roślinę
                          </Button>
                          <Button onClick={() => void handleFinish()}>
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
          </CarouselItem>

          <CarouselItem>
            <Card className="border-border/60 bg-card/95 shadow-sm">
              <CardHeader className="gap-3 border-b border-border/60 pb-5">
                <div className="flex items-center gap-3">
                  <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <ImageIcon className="size-5" />
                  </div>
                  <div>
                    <CardTitle>Dopracuj szczegóły rośliny</CardTitle>
                    <CardDescription>
                      Uzupełnij opis, popraw oceny i wgraj własne zdjęcie przed zakończeniem.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 p-6">
                {!draftPlant ? (
                  <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-5 py-8 text-center text-sm text-muted-foreground">
                    Najpierw wybierz artykuł i wygeneruj szkic rośliny.
                  </div>
                ) : (
                  <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
                    <div className="space-y-4">
                      <PlantPreviewCard plant={draftPlant} />
                      <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium">Zdjęcie rośliny</p>
                            <p className="text-sm text-muted-foreground">PNG, JPG lub inny obsługiwany format obrazu.</p>
                          </div>
                          <Button
                            variant="outline"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploadingImage}
                          >
                            <Camera className="size-4" />
                            {isUploadingImage ? 'Wgrywanie...' : 'Zmień zdjęcie'}
                          </Button>
                        </div>
                        <input
                          ref={fileInputRef}
                          type="file"
                          className="hidden"
                          accept="image/*"
                          onChange={(event) => {
                            void handleImageUpload(event)
                          }}
                        />
                        {imageUploadError && (
                          <p className="mt-3 text-sm text-destructive">{imageUploadError}</p>
                        )}
                        {imageUrl && !imageUploadError && (
                          <p className="mt-3 text-sm text-muted-foreground">Aktualne zdjęcie zostało już zapisane w szkicu.</p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-5">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2 sm:col-span-2">
                          <label htmlFor="plant-name" className="text-sm font-medium">
                            Nazwa rośliny
                          </label>
                          <Input
                            id="plant-name"
                            value={editForm.name}
                            onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))}
                            placeholder="Nazwa rośliny"
                          />
                        </div>

                        <div className="space-y-2 sm:col-span-2">
                          <label htmlFor="plant-latin-name" className="text-sm font-medium">
                            Nazwa łacińska
                          </label>
                          <Input
                            id="plant-latin-name"
                            value={editForm.latin_name}
                            onChange={(event) => setEditForm((current) => ({ ...current, latin_name: event.target.value }))}
                            placeholder="Opcjonalnie"
                          />
                        </div>

                        <div className="space-y-2 sm:col-span-2">
                          <label htmlFor="plant-description" className="text-sm font-medium">
                            Opis
                          </label>
                          <Textarea
                            id="plant-description"
                            value={editForm.description}
                            onChange={(event) => setEditForm((current) => ({ ...current, description: event.target.value }))}
                            placeholder="Dodaj opis rośliny"
                            className="min-h-[150px]"
                          />
                        </div>

                        <div className="space-y-2">
                          <label htmlFor="plant-watering" className="text-sm font-medium">
                            Podlewanie
                          </label>
                          <Input
                            id="plant-watering"
                            type="number"
                            min="1"
                            max="10"
                            value={editForm.watering}
                            onChange={(event) =>
                              setEditForm((current) => ({
                                ...current,
                                watering: Math.min(10, Math.max(1, Number(event.target.value) || 1)),
                              }))
                            }
                          />
                        </div>

                        <div className="space-y-2">
                          <label htmlFor="plant-light" className="text-sm font-medium">
                            Naświetlenie
                          </label>
                          <Input
                            id="plant-light"
                            type="number"
                            min="1"
                            max="10"
                            value={editForm.light}
                            onChange={(event) =>
                              setEditForm((current) => ({
                                ...current,
                                light: Math.min(10, Math.max(1, Number(event.target.value) || 1)),
                              }))
                            }
                          />
                        </div>
                      </div>

                      {editError && (
                        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                          {editError}
                        </div>
                      )}

                      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                        <Button variant="outline" onClick={() => setStep(1)} disabled={isSavingEdits || isUploadingImage}>
                          <ArrowLeft className="size-4" />
                          Wróć do podglądu
                        </Button>
                        <div className="flex flex-col gap-3 sm:flex-row">
                          <Button variant="secondary" onClick={() => void saveEdits()} disabled={!isEditDirty || isSavingEdits || isUploadingImage}>
                            <Check className="size-4" />
                            {isSavingEdits ? 'Zapisywanie...' : 'Zapisz zmiany'}
                          </Button>
                          <Button onClick={() => void handleFinish()} disabled={isSavingEdits || isUploadingImage}>
                            <Check className="size-4" />
                            Zakończ
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </CarouselItem>
        </CarouselContent>
      </Carousel>
    </div>
  )
}
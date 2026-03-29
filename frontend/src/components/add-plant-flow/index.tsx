import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, WandSparkles } from 'lucide-react'

import { DraftEditStep } from '@/components/add-plant-flow/steps/draft-edit-step'
import { DraftPreviewStep } from '@/components/add-plant-flow/steps/draft-preview-step'
import { EntryStep } from '@/components/add-plant-flow/steps/entry-step'
import { IdentifyProposalsStep } from '@/components/add-plant-flow/steps/identify-proposals-step'
import { IdentifyUploadStep } from '@/components/add-plant-flow/steps/identify-upload-step'
import { WikiSearchStep } from '@/components/add-plant-flow/steps/wiki-search-step'
import { useAuth } from '@/components/auth-provider'
import {
  DEFAULT_PLANT_EDIT_FORM,
  buildPlantUpdatePayload,
  createPlantEditForm,
} from '@/components/plants/plant-form'
import { Button } from '@/components/ui/button'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from '@/components/ui/carousel'
import { Card, CardContent } from '@/components/ui/card'
import {
  getPlantImageUrl,
  getWikipediaQueryFromProposal,
  type AiPlantIdentificationResponse,
  type Plant,
} from '@/lib/plants'
import {
  getStepCopy,
  IDENTIFY_STEPS,
  SEARCH_DEBOUNCE_MS,
  STEP_ORDER,
  type AddPlantFlowProps,
  type FlowMode,
  type Step,
  type WikipediaSearchResult,
  type WikipediaSearchResponse,
  WIKIPEDIA_STEPS,
} from './model'

// Orchestrates the existing add-plant state machine while delegating step rendering to focused modules.
export function AddPlantFlow({ onClose, closeRequestKey = 0 }: AddPlantFlowProps) {
  const { token } = useAuth()
  const [carouselApi, setCarouselApi] = useState<CarouselApi>()
  const [step, setStep] = useState<Step>('entry')
  const [flowMode, setFlowMode] = useState<FlowMode | null>(null)
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
  const [isIdentifying, setIsIdentifying] = useState(false)
  const [identifyError, setIdentifyError] = useState<string | null>(null)
  const [identificationResult, setIdentificationResult] = useState<AiPlantIdentificationResponse | null>(null)
  const [selectedProposalIndex, setSelectedProposalIndex] = useState<number | null>(null)
  const [identificationFile, setIdentificationFile] = useState<File | null>(null)
  const [isClosingFlow, setIsClosingFlow] = useState(false)
  const [editForm, setEditForm] = useState(DEFAULT_PLANT_EDIT_FORM)
  const editImageInputRef = useRef<HTMLInputElement>(null)
  const identifyFileInputRef = useRef<HTMLInputElement>(null)
  const identifyCameraInputRef = useRef<HTMLInputElement>(null)
  const closeRequestRef = useRef(closeRequestKey)

  const branchSteps = flowMode === 'identify' ? IDENTIFY_STEPS : flowMode === 'wikipedia' ? WIKIPEDIA_STEPS : ['entry']
  const progressStep = Math.max(1, branchSteps.indexOf(step) + 1)
  const identifyPreviewUrl = getPlantImageUrl(identificationResult?.image_url)
  const imageUrl = getPlantImageUrl(draftPlant?.image_url)
  const selectedProposal = selectedProposalIndex == null ? null : identificationResult?.proposals[selectedProposalIndex] ?? null
  const isBusy = isDeletingDraft || isClosingFlow || isCreatingPlant || isSavingEdits || isUploadingImage || isIdentifying

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim())
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [searchTerm])

  useEffect(() => {
    carouselApi?.scrollTo(STEP_ORDER.indexOf(step))
  }, [carouselApi, step])

  useEffect(() => {
    if (closeRequestKey === closeRequestRef.current) {
      return
    }

    closeRequestRef.current = closeRequestKey
    void handleClose()
  }, [closeRequestKey])

  useEffect(() => {
    if (step !== 'wiki-search') {
      setIsSearching(false)
      return
    }

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
  }, [debouncedSearchTerm, step, token])

  const isEditDirty = useMemo(() => {
    if (!draftPlant) {
      return false
    }

    const currentPayload = buildPlantUpdatePayload(editForm)
    const originalPayload = buildPlantUpdatePayload(createPlantEditForm(draftPlant))
    return JSON.stringify(currentPayload) !== JSON.stringify(originalPayload)
  }, [draftPlant, editForm])

  const clearSearchState = () => {
    setSearchTerm('')
    setDebouncedSearchTerm('')
    setSearchResults([])
    setSearchError(null)
  }

  const clearIdentificationState = () => {
    setIdentificationResult(null)
    setSelectedProposalIndex(null)
    setIdentificationFile(null)
    setIdentifyError(null)
  }

  const resetDraftState = () => {
    setSelectedTitle(null)
    setDraftPlant(null)
    setCreationError(null)
    setCleanupError(null)
    setEditError(null)
    setImageUploadError(null)
    setEditForm(DEFAULT_PLANT_EDIT_FORM)
  }

  const resetFlowState = () => {
    setStep('entry')
    setFlowMode(null)
    clearSearchState()
    clearIdentificationState()
    resetDraftState()
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
      setStep(flowMode === 'identify' && identificationResult ? 'identify-proposals' : flowMode === 'wikipedia' ? 'wiki-search' : 'entry')
      return
    }

    const deleted = await deleteDraft(draftPlant.id)

    if (!deleted) {
      return
    }

    resetDraftState()
    setStep('wiki-search')
  }

  const handleClose = async () => {
    if (!draftPlant) {
      resetFlowState()
      onClose()
      return
    }

    setIsClosingFlow(true)
    const deleted = await deleteDraft(draftPlant.id)
    setIsClosingFlow(false)

    if (deleted) {
      resetFlowState()
      onClose()
    }
  }

  const uploadPlantImageFile = async (plantId: number, file: File) => {
    if (!token) {
      throw new Error('Brak autoryzacji do aktualizacji zdjęcia.')
    }

    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch(`/api/plants/${plantId}/image`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    })

    if (!response.ok) {
      throw new Error('Nie udało się zaktualizować zdjęcia.')
    }

    return (await response.json()) as Plant
  }

  const handleChooseFlow = (mode: FlowMode) => {
    resetDraftState()
    setFlowMode(mode)

    if (mode === 'wikipedia') {
      clearIdentificationState()
      clearSearchState()
      setStep('wiki-search')
      return
    }

    clearSearchState()
    setStep('identify-upload')
  }

  const createPlantFromWikipedia = async (articleTitle: string) => {
    if (!token) {
      setCreationError('Brak autoryzacji do utworzenia rośliny.')
      return
    }

    setSelectedTitle(articleTitle)
  setStep('draft-preview')
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

      let plant = (await response.json()) as Plant

      if (flowMode === 'identify' && identificationFile) {
        try {
          plant = await uploadPlantImageFile(plant.id, identificationFile)
        } catch (error) {
          console.error('Failed to apply identification image to draft plant', error)
          setImageUploadError('Nie udało się przypisać przesłanego zdjęcia do szkicu. Możesz wgrać je ponownie w edycji.')
        }
      }

      setDraftPlant(plant)
      setEditForm(createPlantEditForm(plant))
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
        body: JSON.stringify(buildPlantUpdatePayload(editForm)),
      })

      if (!response.ok) {
        throw new Error('Nie udało się zapisać zmian.')
      }

      const updatedPlant = (await response.json()) as Plant
      setDraftPlant(updatedPlant)
      setEditForm(createPlantEditForm(updatedPlant))
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
    if (step === 'draft-edit' && isEditDirty) {
      const saved = await saveEdits()
      if (!saved) {
        return
      }
    }

    resetDraftFlow()
    onClose()
  }

  const runWikipediaSearchForProposal = (proposalIndex: number) => {
    if (!identificationResult) {
      return
    }

    const proposal = identificationResult.proposals[proposalIndex]
    const query = getWikipediaQueryFromProposal(proposal)

    if (!query) {
      setIdentifyError('Wybrana propozycja nie zawiera poprawnej nazwy do wyszukania w Wikipedii.')
      return
    }

    setSelectedProposalIndex(proposalIndex)
    setIdentifyError(null)
    setSelectedTitle(null)
    setDraftPlant(null)
    setCreationError(null)
    setSearchResults([])
    setSearchError(null)
    setSearchTerm(query)
    setDebouncedSearchTerm(query)
    setStep('wiki-search')
  }

  const handleIdentifyFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    if (!token) {
      setIdentifyError('Brak autoryzacji do rozpoznawania roślin.')
      event.target.value = ''
      return
    }

    setFlowMode('identify')
    setIdentificationFile(file)
    setIdentificationResult(null)
    setSelectedProposalIndex(null)
    setIdentifyError(null)
    setCreationError(null)
    clearSearchState()
    resetDraftState()
    setIsIdentifying(true)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/plants/identify', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Nie udało się rozpoznać rośliny na zdjęciu.')
      }

      const data = (await response.json()) as AiPlantIdentificationResponse

      if (!Array.isArray(data.proposals) || data.proposals.length === 0) {
        throw new Error('Nie udało się wygenerować propozycji roślin.')
      }

      setIdentificationResult(data)
      setStep('identify-proposals')
    } catch (error) {
      console.error('Failed to identify plant from image', error)
      setIdentifyError('Nie udało się rozpoznać rośliny na zdjęciu. Spróbuj ponownie innym ujęciem.')
    } finally {
      setIsIdentifying(false)
      event.target.value = ''
    }
  }

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!draftPlant || !token || !event.target.files?.length) {
      return
    }

    const file = event.target.files[0]
    setIsUploadingImage(true)
    setImageUploadError(null)

    try {
      const updatedPlant = await uploadPlantImageFile(draftPlant.id, file)
      setDraftPlant(updatedPlant)
      setEditForm(createPlantEditForm(updatedPlant))
    } catch (error) {
      console.error('Failed to upload image', error)
      setImageUploadError('Nie udało się wgrać zdjęcia. Spróbuj ponownie innym plikiem.')
    } finally {
      setIsUploadingImage(false)
      event.target.value = ''
    }
  }

  const resetDraftFlow = () => {
    resetFlowState()
  }

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
                Zacznij od wyszukania artykułu Wikipedii albo od zdjęcia rośliny, wygeneruj szkic i dopracuj go przed zapisaniem na swojej liście.
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            className="self-start"
            onClick={() => {
              void handleClose()
            }}
            disabled={isBusy}
          >
            <ArrowLeft className="size-4" />
            Wróć do kolekcji
          </Button>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-border/50 bg-background/70 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium">Krok {progressStep} z {branchSteps.length}</p>
            <p className="text-sm text-muted-foreground">
              {getStepCopy(step, flowMode)}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {branchSteps.map((branchStep) => (
              <span
                key={branchStep}
                className={[
                  'h-2.5 rounded-full transition-all',
                  branchStep === step ? 'w-10 bg-primary' : 'w-2.5 bg-border',
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
            <EntryStep onChooseFlow={handleChooseFlow} />
          </CarouselItem>

          <CarouselItem>
            <WikiSearchStep
              flowMode={flowMode}
              hasIdentificationResult={Boolean(identificationResult)}
              selectedProposalName={selectedProposal?.name ?? null}
              selectedProposalLatinName={selectedProposal?.latin_name ?? null}
              searchTerm={searchTerm}
              debouncedSearchTerm={debouncedSearchTerm}
              searchResults={searchResults}
              isSearching={isSearching}
              isCreatingPlant={isCreatingPlant}
              searchError={searchError}
              onSearchTermChange={setSearchTerm}
              onBack={() => setStep(flowMode === 'identify' && identificationResult ? 'identify-proposals' : 'entry')}
              onCreatePlant={(title) => {
                void createPlantFromWikipedia(title)
              }}
            />
          </CarouselItem>

          <CarouselItem>
            <IdentifyUploadStep
              isIdentifying={isIdentifying}
              identifyError={identifyError}
              identificationFileName={identificationFile?.name ?? null}
              fileInputRef={identifyFileInputRef}
              cameraInputRef={identifyCameraInputRef}
              onFileSelected={(event) => {
                void handleIdentifyFileSelected(event)
              }}
              onBack={() => setStep('entry')}
            />
          </CarouselItem>

          <CarouselItem>
            <IdentifyProposalsStep
              identificationResult={identificationResult}
              identifyPreviewUrl={identifyPreviewUrl}
              identifyError={identifyError}
              selectedProposalIndex={selectedProposalIndex}
              onBackToUpload={() => setStep('identify-upload')}
              onOpenCamera={() => identifyCameraInputRef.current?.click()}
              onSelectProposal={runWikipediaSearchForProposal}
            />
          </CarouselItem>

          <CarouselItem>
            <DraftPreviewStep
              selectedTitle={selectedTitle}
              isCreatingPlant={isCreatingPlant}
              creationError={creationError}
              draftPlant={draftPlant}
              isDeletingDraft={isDeletingDraft}
              onRetrySearch={() => {
                resetDraftState()
                setStep('wiki-search')
              }}
              onBackToSearch={() => {
                void goBackToSearch()
              }}
              onEdit={() => setStep('draft-edit')}
              onFinish={() => {
                void handleFinish()
              }}
            />
          </CarouselItem>

          <CarouselItem>
            <DraftEditStep
              draftPlant={draftPlant}
              imageUrl={imageUrl}
              isUploadingImage={isUploadingImage}
              imageUploadError={imageUploadError}
              editError={editError}
              isSavingEdits={isSavingEdits}
              isEditDirty={isEditDirty}
              editForm={editForm}
              imageInputRef={editImageInputRef}
              onImageUpload={(event) => {
                void handleImageUpload(event)
              }}
              onEditFormChange={setEditForm}
              onBack={() => setStep('draft-preview')}
              onSave={() => {
                void saveEdits()
              }}
              onFinish={() => {
                void handleFinish()
              }}
            />
          </CarouselItem>
        </CarouselContent>
      </Carousel>
    </div>
  )
}
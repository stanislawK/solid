export type FlowMode = 'wikipedia' | 'identify'

export type Step =
  | 'entry'
  | 'wiki-search'
  | 'identify-upload'
  | 'identify-proposals'
  | 'draft-preview'
  | 'draft-edit'

export interface AddPlantFlowProps {
  onClose: () => void
  closeRequestKey?: number
}

export interface WikipediaSearchResult {
  title: string
  snippet: string
  thumbnail?: string | null
}

export interface WikipediaSearchResponse {
  search_term: string
  results: WikipediaSearchResult[]
}

export const SEARCH_DEBOUNCE_MS = 450

export const STEP_ORDER: Step[] = [
  'entry',
  'wiki-search',
  'identify-upload',
  'identify-proposals',
  'draft-preview',
  'draft-edit',
]

export const WIKIPEDIA_STEPS: Step[] = ['entry', 'wiki-search', 'draft-preview', 'draft-edit']

export const IDENTIFY_STEPS: Step[] = ['entry', 'identify-upload', 'identify-proposals', 'wiki-search', 'draft-preview', 'draft-edit']

export function getStepCopy(step: Step, flowMode: FlowMode | null) {
  switch (step) {
    case 'entry':
      return 'Wybierz, czy chcesz zacząć od artykułu Wikipedii, czy od rozpoznania rośliny na zdjęciu.'
    case 'wiki-search':
      return flowMode === 'identify'
        ? 'Sprawdź wyniki Wikipedii dla wybranej propozycji albo wpisz dokładniejsze hasło.'
        : 'Znajdź właściwy artykuł Wikipedii dla swojej rośliny.'
    case 'identify-upload':
      return 'Wgraj zdjęcie z dysku albo zrób je aparatem, aby pobrać propozycje od Gemini.'
    case 'identify-proposals':
      return 'Wybierz jedną z propozycji Gemini. Potem od razu pokażemy pasujące wyniki Wikipedii.'
    case 'draft-preview':
      return 'Poczekaj na wygenerowanie szkicu i zdecyduj, co chcesz zrobić dalej.'
    case 'draft-edit':
      return 'Popraw szczegóły rośliny i zakończ dodawanie.'
  }
}
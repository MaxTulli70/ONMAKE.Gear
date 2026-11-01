export type Riga = { liv: string; nome: string; tipo: string; dir: string; model: string; tok: number; fine: boolean; stato: string; ago: number; desc: string }
export type Sessione = { id: string; nome: string }
export type Passo = { model: string; effort: string }
export type Dati = {
  chat: string
  perliv?: Record<string, [number, number]>; stok?: number; sel?: number; sag?: number; tokmod: [string, number][]
  compito: string
  livello: string | null
  dir: string
  agenti: number
  fini: number
  lavorano: number
  fermi: number
  completi: number
  interrotti: number
  attivi: { liv: string; tipo: string; nome: string; desc: string; model: string }[]
  tok: number
  cr: number
  reale: number
  opus: number
  risp: number | null
  perc: number | null
  fatti: number
  tot: number
  el: number
  eta: number | null
  righe: Riga[]
}

declare module 'claude-code' {
  interface PluginState {
    'onmake-gear': { passo: Passo | null; dati: Dati | null; aperta: boolean; sessioni: Sessione[]; scelta: string; comando: string; vista: string; reset: string }
  }
}

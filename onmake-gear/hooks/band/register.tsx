import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Attivo, Dati, Passo, Sessione } from '../../types'

// Model colours from the gear schema, darkened to read as text.
const colMod = (m: string, eff = '') => /haiku/i.test(m) ? '#5f9a6c' : /sonnet/i.test(m) ? (/high|max/.test(eff) ? '#8a78b0' : '#5c82a8') : /opus/i.test(m) ? '#c0714f' : undefined
const COL: Record<string, string> = { light: '#7bb8e8', medium: '#6fc08a', high: '#e8b64a', opus: '#a78bd0', max: '#d9694f' }
// Same as plugin.json: the engine does not hand the version to the module.
const VERSIONE = '0.6.195'
const DATA = '03/11/2026' // date of this version, shown next to it
const GRIGIO = '#9a9aa5'
const dati = atom({ plugin: 'onmake-gear', key: 'dati' } as const, null)
// Model and effort of the main chat's last model request, as the engine sends it.
const passo = atom({ plugin: 'onmake-gear', key: 'passo' } as const, null as Passo | null)
const aperta = atom({ plugin: 'onmake-gear', key: 'aperta' } as const, false)
const sessioni = atom({ plugin: 'onmake-gear', key: 'sessioni' } as const, [] as Sessione[])
const scelta = atom({ plugin: 'onmake-gear', key: 'scelta' } as const, '')
const vista = atom({ plugin: 'onmake-gear', key: 'vista' } as const, 'tot')
const reset = atom({ plugin: 'onmake-gear', key: 'reset' } as const, '')
const attivo = atom({ plugin: 'onmake-gear', key: 'attivo' } as const, null as Attivo | null)
const storia = atom({ plugin: 'onmake-gear', key: 'storia' } as const, [] as Attivo[]) // last 5 actions of this turn
const lingua = atom({ plugin: 'onmake-gear', key: 'lingua' } as const, 'it')
const guida = atom({ plugin: 'onmake-gear', key: 'guida' } as const, false)
const comando = atom({ plugin: 'onmake-gear', key: 'comando' } as const, '')
const tic = atom({ plugin: 'onmake-gear', key: 'tic' } as const, 0) // once a second while working: makes the band redraw

// 'claude-opus-5-5' or 'opus-5-5' -> 'Opus 5.5'
const nomeModello = (m: string) => { const [f, ...v] = m.replace(/^claude-/, '').split('-'); return f ? `${f.charAt(0).toUpperCase()}${f.slice(1)} ${v.join('.')}`.trim() : m }
const kt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")
const dur = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m` : `${s}s`)

async function home($: EngineInterface) {
  return (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
}

// Runs the script on this session's transcript; the answer is a few hundred bytes of JSON.
let giro = 0 // a slow older read must not overwrite the numbers of a newer one (e.g. right after a reset)
async function ricarica($: EngineInterface) {
  const mio = ++giro
  const script = `${$.plugin.root}/scripts/pannello.py`
  // Workflow view: only what came after the partial reset (or after the start, if never reset).
  const vv = await read($, vista).catch(() => 'tot')
  const rs = vv === 'wf' ? await read($, reset).catch(() => '') : '' // live starts at the last message: the script finds it in the transcript
  CARTELLA = await $.session.cwd()
  const r = await $.process.run(['python3', script, '--cartella', CARTELLA, '--sessione', await $.session.id(), '--json', '--vista', vv === 'wf' || vv === 'live' ? vv : 'tot', ...(rs ? ['--reset', rs] : [])])
  if (r.exitCode !== 0) return undefined
  const d = JSON.parse(r.stdout) as Dati
  if (mio !== giro) return d
  carLetto = car
  await update($, dati, () => d)
  return d
}

// Small bar of 5 cells, 20% each; the share is a real ratio, never a made-up one.
const bar = (f: number) => '▰'.repeat(Math.round(f * 5)) + '▱'.repeat(5 - Math.round(f * 5))
const pct = (d: Dati) => (d.perc === null ? '' : `${Math.round(d.perc * 100)}% ${d.fatti}/${d.tot}`)
const ag = (d: Dati) => `▶${d.lavorano} ⏸${d.fermi} ✓${d.completi}${d.interrotti > 0 ? ` ✗${d.interrotti}` : ''}`
// Name shown for a gear: LIGHT is called HAIKU and MEDIUM is called SONNET.
const nomeMarcia = (k: string) => (k === 'medium' ? 'SONNET' : k === 'light' ? 'HAIKU' : k.toUpperCase())
const lev = (d: Dati) => `⚙ ${d.livello ? nomeMarcia(d.livello) : '-'}${d.dir === '▲' || d.dir === '▼' ? ' ' + d.dir : ''}`

// Plain text for the status line (position below); the bar above draws the same parts in color.
function riga(d: Dati, compact: boolean) {
  const parts = [lev(d), `${kt(d.tok)} ${tr('token')}`]
  if (!compact) parts.push(ag(d), pct(d), dur(d.el) + (d.eta ? `/${dur(d.el + d.eta)}` : ''))
  return parts.filter(x => x !== '').join(' · ')
}

// Desktop: the bar is drawn as SVG, so the type is small and even, every cell is the same size and the level is a pill.
// shortcut: text widths are estimated (7.4 px per character at 13 px), so a very long label may sit a little loose.
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
// Width per character at 14 px: capitals and digits are wider than lower case, spaces narrower.
const largo = (t: string) => Math.ceil([...t].reduce((w, ch) => w + (ch === ' ' ? 3.5 : /[A-Z0-9%]/.test(ch) ? 8.2 : /[▶⏸✓✗↓↑]/.test(ch) ? 10.3 : 6.7), 0))
const STILE = '<style>text{font:400 12px -apple-system,system-ui,sans-serif;fill:#55554f}.sm{font-size:10px;letter-spacing:.3px}.mu{fill:#8a8a84}.v{fill:#d6d6cf}@media(prefers-color-scheme:dark){text{fill:#c9c9d1}.mu{fill:#8d8d97}.v{fill:#3a3a42}}</style>'

// Optimization index 0-100: how low the work ran. Weight per token: Haiku 1, Sonnet 2 (high 3), Opus 5; 0 = all Opus, 100 = all Haiku.
function indiceOtt(d: Dati) {
  const W: Record<string, number> = { light: 1, medium: 2, high: 3, opus: 5, max: 5 }
  const pesoChat = /haiku/.test(d.chat) ? 1 : /sonnet/.test(d.chat) ? 2 : 5
  const tot = d.stok || d.tok
  if (!tot) return null
  const ag = ['light', 'medium', 'high', 'opus', 'max'].reduce((a, k) => a + (d.perliv?.[k]?.[1] ?? 0), 0)
  const pesato = ['light', 'medium', 'high', 'opus', 'max'].reduce((a, k) => a + (d.perliv?.[k]?.[1] ?? 0) * W[k], 0) + Math.max(0, tot - ag) * pesoChat
  return Math.max(0, Math.min(100, Math.round((1 - pesato / (tot * 5)) / 0.8 * 100)))
}

const ANIM = '<style>@keyframes gs{0%{transform:translateX(-14px)}100%{transform:translateX(44px)}}.gs{animation:gs 1.1s linear infinite}@keyframes gp{50%{opacity:.3}}.gp{animation:gp 1s ease-in-out infinite}</style>'

const TR: Record<string, Record<string, string>> = {
  en: {
    'lavora': 'working',
    'nessuna marcia': 'no gear',
    'pronto': 'ready',
    'Tabella agenti': 'Agents table',
    'medio': 'medium',
    'extra': 'extra',
    'lavoro': 'work',
    'resta': 'left',
    'velocità': 'speed',
    'tk ag.': 'ag. tk',
    'risp.': 'sav.',
    'in attesa': 'idle',
    'Marce': 'Levels',
    'basso': 'low',
    'alto': 'high',
    'max': 'max',
    'effort': 'effort',
    'pensa…': 'thinking…',
    'chat': 'chat',
    'indice': 'index',
    '↑ salita': '↑ up',
    '↓ scesa': '↓ down',
    'lavora su un server': 'works on a server',
    'sincronizza con GitHub': 'syncs with GitHub',
    'usa git': 'uses git',
    'esegue le prove': 'runs the tests',
    'compila': 'builds',
    'installa pacchetti': 'installs packages',
    'scarica o chiama un indirizzo web': 'fetches or calls a web address',
    'cerca file': 'searches files',
    'legge file': 'reads files',
    'esegue uno script Python': 'runs a Python script',
    'aggiorna i plugin': 'updates plugins',
    'gestisce un servizio': 'manages a service',
    'legge': 'reads',
    'modifica': 'edits',
    'scrive': 'writes',
    'cerca nel codice': 'searches the code',
    'legge una pagina web': 'reads a web page',
    'cerca sul web': 'searches the web',
    'avvia un agente': 'starts an agent',
    'aggiorna i passi': 'updates the steps',
    'esegue un comando': 'runs a command',
    'usa ': 'uses ',
    'agente: ': 'agent: ',
    'live': 'live',
    'workflow': 'workflow',
    'workflow da': 'workflow from',
    'totale chat': 'chat total',
    '↺ nuovo workflow': '↺ new workflow',
    'azzerare il workflow da adesso?': 'reset the workflow from now?',
    'Chiudi ▴': 'Close ▴',
    'Dettagli ▾': 'Details ▾',
    'Pannello ↗': 'Panel ↗',
    'interrotti (mai finiti, fermi da oltre 1h)': 'interrupted (never finished, idle for over 1h)',
    'OK': 'OK',
    'annulla': 'cancel',
    '? guida': '? guide',
    '× guida': '× guide',
    'lavoro attivo da': 'working for',
    'token': 'tokens',
    'agenti': 'agents',
    'passi': 'steps',
    'di': 'of',
    'Nessun agente: lavora solo la chat.': 'No agents: only the chat is working.',
    'attiva': 'active',
    'indice ottimizzazione': 'optimization index',
    'risparmio': 'saved',
    'sotto Opus': 'below Opus',
    'su modelli sotto Opus': 'on models below Opus',
    'meno dello 0,1': 'less than 0.1',
    '<0,1': '<0.1',
    'chi ha usato i token': 'who used the tokens',
    'modello': 'model',
    'token/min': 'tokens/min',
    'ferma': 'stopped',
    'in corso da': 'running for',
    'agenti al lavoro': 'agents working',
    'fermo da': 'idle for',
    'restano ~': 'left ~',
    'passi)': 'steps)',
    'scrive…': 'writing…',
    'pensa': 'thinking',
    'Gear: sessioni non lette': 'Gear: sessions not read',
    'Gear: scrivi un comando': 'Gear: type a command',
    'Gear: fermata': 'Gear: stopped',
    'Gear: annullato': 'Gear: cancelled',
    'Gear: inviato': 'Gear: sent',
    'Gear: non riuscito': 'Gear: failed',
    'Gear: sito non aperto': 'Gear: site not opened',
    'Gear: pannello non aperto': 'Gear: panel not opened',
    'Gear: workflow azzerato da adesso': 'Gear: workflow reset from now',
  },
  de: {
    'lavora': 'arbeitet',
    'nessuna marcia': 'kein Gang',
    'pronto': 'bereit',
    'Tabella agenti': 'Agenten-Tabelle',
    'medio': 'mittel',
    'extra': 'extra',
    'lavoro': 'Arbeit',
    'resta': 'Rest',
    'velocità': 'Tempo',
    'tk ag.': 'Ag.-Tk',
    'risp.': 'Ersp.',
    'in attesa': 'Ruhe',
    'Marce': 'Gänge',
    'basso': 'niedrig',
    'alto': 'hoch',
    'max': 'max',
    'effort': 'Aufwand',
    'pensa…': 'denkt…',
    'chat': 'Chat',
    'indice': 'Index',
    '↑ salita': '↑ hoch',
    '↓ scesa': '↓ runter',
    'lavora su un server': 'arbeitet auf einem Server',
    'sincronizza con GitHub': 'synchronisiert mit GitHub',
    'usa git': 'nutzt git',
    'esegue le prove': 'führt die Tests aus',
    'compila': 'baut',
    'installa pacchetti': 'installiert Pakete',
    'scarica o chiama un indirizzo web': 'ruft eine Webadresse ab',
    'cerca file': 'sucht Dateien',
    'legge file': 'liest Dateien',
    'esegue uno script Python': 'führt ein Python-Skript aus',
    'aggiorna i plugin': 'aktualisiert Plugins',
    'gestisce un servizio': 'verwaltet einen Dienst',
    'legge': 'liest',
    'modifica': 'ändert',
    'scrive': 'schreibt',
    'cerca nel codice': 'sucht im Code',
    'legge una pagina web': 'liest eine Webseite',
    'cerca sul web': 'sucht im Web',
    'avvia un agente': 'startet einen Agenten',
    'aggiorna i passi': 'aktualisiert die Schritte',
    'esegue un comando': 'führt einen Befehl aus',
    'usa ': 'nutzt ',
    'agente: ': 'Agent: ',
    'live': 'live',
    'workflow': 'Workflow',
    'workflow da': 'Workflow ab',
    'totale chat': 'Chat gesamt',
    '↺ nuovo workflow': '↺ neuer Workflow',
    'azzerare il workflow da adesso?': 'Workflow ab jetzt zurücksetzen?',
    'Chiudi ▴': 'Schließen ▴',
    'Dettagli ▾': 'Details ▾',
    'Pannello ↗': 'Panel ↗',
    'interrotti (mai finiti, fermi da oltre 1h)': 'abgebrochen (nie beendet, über 1 Std. inaktiv)',
    'OK': 'OK',
    'annulla': 'abbrechen',
    '? guida': '? Hilfe',
    '× guida': '× Hilfe',
    'lavoro attivo da': 'arbeitet seit',
    'token': 'Tokens',
    'agenti': 'Agenten',
    'passi': 'Schr.',
    'di': 'von',
    'Nessun agente: lavora solo la chat.': 'Keine Agenten: nur der Chat arbeitet.',
    'attiva': 'aktiv',
    'indice ottimizzazione': 'Optimierungsindex',
    'risparmio': 'gespart',
    'sotto Opus': 'unter Opus',
    'su modelli sotto Opus': 'mit Modellen unter Opus',
    'meno dello 0,1': 'weniger als 0,1',
    '<0,1': '<0,1',
    'chi ha usato i token': 'wer die Tokens verbraucht hat',
    'modello': 'Modell',
    'token/min': 'Tokens/Min',
    'ferma': 'steht',
    'in corso da': 'läuft seit',
    'agenti al lavoro': 'Agenten arbeiten',
    'fermo da': 'steht seit',
    'restano ~': 'noch ~',
    'passi)': 'Schritte)',
    'scrive…': 'schreibt…',
    'pensa': 'denkt',
    'Gear: sessioni non lette': 'Gear: Sitzungen nicht gelesen',
    'Gear: scrivi un comando': 'Gear: Befehl eingeben',
    'Gear: fermata': 'Gear: gestoppt',
    'Gear: annullato': 'Gear: abgebrochen',
    'Gear: inviato': 'Gear: gesendet',
    'Gear: non riuscito': 'Gear: fehlgeschlagen',
    'Gear: sito non aperto': 'Gear: Seite nicht geöffnet',
    'Gear: pannello non aperto': 'Gear: Panel nicht geöffnet',
    'Gear: workflow azzerato da adesso': 'Gear: Workflow ab jetzt zurückgesetzt',
  },
  fr: {
    'lavora': 'travaille',
    'nessuna marcia': 'pas de vitesse',
    'pronto': 'prêt',
    'Tabella agenti': 'Tableau des agents',
    'medio': 'moyen',
    'extra': 'extra',
    'lavoro': 'travail',
    'resta': 'reste',
    'velocità': 'vitesse',
    'tk ag.': 'tk ag.',
    'risp.': 'écon.',
    'in attesa': 'repos',
    'Marce': 'Vitesses',
    'basso': 'bas',
    'alto': 'haut',
    'max': 'max',
    'effort': 'effort',
    'pensa…': 'réfléchit…',
    'chat': 'chat',
    'indice': 'indice',
    '↑ salita': '↑ montée',
    '↓ scesa': '↓ descente',
    'lavora su un server': 'travaille sur un serveur',
    'sincronizza con GitHub': 'synchronise avec GitHub',
    'usa git': 'utilise git',
    'esegue le prove': 'lance les tests',
    'compila': 'compile',
    'installa pacchetti': 'installe des paquets',
    'scarica o chiama un indirizzo web': 'appelle une adresse web',
    'cerca file': 'cherche des fichiers',
    'legge file': 'lit des fichiers',
    'esegue uno script Python': 'lance un script Python',
    'aggiorna i plugin': 'met à jour les plugins',
    'gestisce un servizio': 'gère un service',
    'legge': 'lit',
    'modifica': 'modifie',
    'scrive': 'écrit',
    'cerca nel codice': 'cherche dans le code',
    'legge una pagina web': 'lit une page web',
    'cerca sul web': 'cherche sur le web',
    'avvia un agente': 'lance un agent',
    'aggiorna i passi': 'met à jour les étapes',
    'esegue un comando': 'exécute une commande',
    'usa ': 'utilise ',
    'agente: ': 'agent : ',
    'live': 'live',
    'workflow': 'workflow',
    'workflow da': 'workflow depuis',
    'totale chat': 'total chat',
    '↺ nuovo workflow': '↺ nouveau workflow',
    'azzerare il workflow da adesso?': 'réinitialiser le workflow dès maintenant ?',
    'Chiudi ▴': 'Fermer ▴',
    'Dettagli ▾': 'Détails ▾',
    'Pannello ↗': 'Panneau ↗',
    'interrotti (mai finiti, fermi da oltre 1h)': 'interrompus (jamais terminés, inactifs depuis plus d\'1 h)',
    'OK': 'OK',
    'annulla': 'annuler',
    '? guida': '? guide',
    '× guida': '× guide',
    'lavoro attivo da': 'au travail depuis',
    'token': 'tokens',
    'agenti': 'agents',
    'passi': 'étapes',
    'di': 'sur',
    'Nessun agente: lavora solo la chat.': 'Aucun agent : seul le chat travaille.',
    'attiva': 'actif',
    'indice ottimizzazione': 'indice d\'optimisation',
    'risparmio': 'économie',
    'sotto Opus': 'sous Opus',
    'su modelli sotto Opus': 'sur des modèles sous Opus',
    'meno dello 0,1': 'moins de 0,1',
    '<0,1': '<0,1',
    'chi ha usato i token': 'qui a utilisé les tokens',
    'modello': 'modèle',
    'token/min': 'tokens/min',
    'ferma': 'arrêt',
    'in corso da': 'en cours depuis',
    'agenti al lavoro': 'agents au travail',
    'fermo da': 'arrêté depuis',
    'restano ~': 'reste ~',
    'passi)': 'étapes)',
    'scrive…': 'écrit…',
    'pensa': 'réfléchit',
    'Gear: sessioni non lette': 'Gear: sessions non lues',
    'Gear: scrivi un comando': 'Gear: écris une commande',
    'Gear: fermata': 'Gear: arrêté',
    'Gear: annullato': 'Gear: annulé',
    'Gear: inviato': 'Gear: envoyé',
    'Gear: non riuscito': 'Gear: échec',
    'Gear: sito non aperto': 'Gear: site non ouvert',
    'Gear: pannello non aperto': 'Gear: panneau non ouvert',
    'Gear: workflow azzerato da adesso': 'Gear: workflow réinitialisé dès maintenant',
  },
  es: {
    'lavora': 'trabaja',
    'nessuna marcia': 'sin marcha',
    'pronto': 'listo',
    'Tabella agenti': 'Tabla de agentes',
    'medio': 'medio',
    'extra': 'extra',
    'lavoro': 'trabajo',
    'resta': 'resta',
    'velocità': 'velocidad',
    'tk ag.': 'tk ag.',
    'risp.': 'ahor.',
    'in attesa': 'reposo',
    'Marce': 'Marchas',
    'basso': 'bajo',
    'alto': 'alto',
    'max': 'max',
    'effort': 'esfuerzo',
    'pensa…': 'piensa…',
    'chat': 'chat',
    'indice': 'índice',
    '↑ salita': '↑ sube',
    '↓ scesa': '↓ baja',
    'lavora su un server': 'trabaja en un servidor',
    'sincronizza con GitHub': 'sincroniza con GitHub',
    'usa git': 'usa git',
    'esegue le prove': 'ejecuta las pruebas',
    'compila': 'compila',
    'installa pacchetti': 'instala paquetes',
    'scarica o chiama un indirizzo web': 'llama a una dirección web',
    'cerca file': 'busca archivos',
    'legge file': 'lee archivos',
    'esegue uno script Python': 'ejecuta un script Python',
    'aggiorna i plugin': 'actualiza los plugins',
    'gestisce un servizio': 'gestiona un servicio',
    'legge': 'lee',
    'modifica': 'modifica',
    'scrive': 'escribe',
    'cerca nel codice': 'busca en el código',
    'legge una pagina web': 'lee una página web',
    'cerca sul web': 'busca en la web',
    'avvia un agente': 'inicia un agente',
    'aggiorna i passi': 'actualiza los pasos',
    'esegue un comando': 'ejecuta un comando',
    'usa ': 'usa ',
    'agente: ': 'agente: ',
    'live': 'live',
    'workflow': 'workflow',
    'workflow da': 'workflow desde',
    'totale chat': 'total chat',
    '↺ nuovo workflow': '↺ nuevo workflow',
    'azzerare il workflow da adesso?': '¿reiniciar el workflow desde ahora?',
    'Chiudi ▴': 'Cerrar ▴',
    'Dettagli ▾': 'Detalles ▾',
    'Pannello ↗': 'Panel ↗',
    'interrotti (mai finiti, fermi da oltre 1h)': 'interrumpidos (nunca terminados, parados más de 1 h)',
    'OK': 'OK',
    'annulla': 'cancelar',
    '? guida': '? guía',
    '× guida': '× guía',
    'lavoro attivo da': 'trabajando desde',
    'token': 'tokens',
    'agenti': 'agentes',
    'passi': 'pasos',
    'di': 'de',
    'Nessun agente: lavora solo la chat.': 'Ningún agente: trabaja solo el chat.',
    'attiva': 'activo',
    'indice ottimizzazione': 'índice de optimización',
    'risparmio': 'ahorro',
    'sotto Opus': 'bajo Opus',
    'su modelli sotto Opus': 'en modelos bajo Opus',
    'meno dello 0,1': 'menos de 0,1',
    '<0,1': '<0,1',
    'chi ha usato i token': 'quién usó los tokens',
    'modello': 'modelo',
    'token/min': 'tokens/min',
    'ferma': 'parado',
    'in corso da': 'en curso desde',
    'agenti al lavoro': 'agentes trabajando',
    'fermo da': 'parado desde',
    'restano ~': 'quedan ~',
    'passi)': 'pasos)',
    'scrive…': 'escribe…',
    'pensa': 'piensa',
    'Gear: sessioni non lette': 'Gear: sesiones no leídas',
    'Gear: scrivi un comando': 'Gear: escribe un comando',
    'Gear: fermata': 'Gear: detenido',
    'Gear: annullato': 'Gear: cancelado',
    'Gear: inviato': 'Gear: enviado',
    'Gear: non riuscito': 'Gear: fallo',
    'Gear: sito non aperto': 'Gear: sitio no abierto',
    'Gear: pannello non aperto': 'Gear: panel no abierto',
    'Gear: workflow azzerato da adesso': 'Gear: workflow reiniciado desde ahora',
  },
}
let LG = 'it'
const tr = (s: string) => TR[LG]?.[s] ?? s

// Plain words for what a tool is doing, instead of the raw command.
const SPIEGA: [RegExp, string][] = [
  [/^(ssh|scp|rsync)\b/, 'lavora su un server'], [/^git (push|pull|fetch)/, 'sincronizza con GitHub'], [/^git /, 'usa git'],
  [/^(npm|npx|pnpm|yarn|bun) (test|run test)|pytest|plugin test/, 'esegue le prove'], [/^(npm|pnpm|yarn|bun) (run )?build/, 'compila'],
  [/^(npm|pnpm|yarn) (i|install)|pip install/, 'installa pacchetti'], [/^(curl|wget)\b/, 'scarica o chiama un indirizzo web'],
  [/^(grep|rg|find|ls)\b/, 'cerca file'], [/^(cat|head|tail|sed -n)\b/, 'legge file'], [/^python3?\b/, 'esegue uno script Python'],
  [/^claude plugin/, 'aggiorna i plugin'], [/^(docker|systemctl)\b/, 'gestisce un servizio'],
]
const STRUMENTI: Record<string, string> = { Read: 'legge', Edit: 'modifica', Write: 'scrive', Grep: 'cerca nel codice', Glob: 'cerca file', WebFetch: 'legge una pagina web', WebSearch: 'cerca sul web', Agent: 'avvia un agente', TodoWrite: 'aggiorna i passi' }
function spiega(ora: Attivo) {
  const base = ora.tool.replace(/^agente: /, '')
  const chi = ora.tool.startsWith('agente: ') ? tr('agente: ') : ''
  if (base === 'Bash') { const m = SPIEGA.find(([re]) => re.test(ora.cosa.trim())); return { cosa: chi + (m ? tr(m[1]) : tr('esegue un comando')), dove: '' } }
  if (base.startsWith('mcp__')) return { cosa: chi + tr('usa ') + base.split('__')[1], dove: '' }
  return { cosa: chi + (STRUMENTI[base] ? tr(STRUMENTI[base]) : base), dove: ora.cosa }
}

// Short guide shown by the '? guida' button.
// Language buttons are flags: real text, so the focus box is exactly the button.
const BANDIERA: Record<string, string> = { it: '🇮🇹', en: '🇺🇸', de: '🇩🇪', fr: '🇫🇷', es: '🇪🇸' }
const GUIDA: Record<string, string[]> = {
  it: ['BARRA', 'scala a sinistra e tachimetro: marcia 1 HAIKU, 2 SONNET, 3 HIGH, 4 OPUS, 5 MAX', '▶ lavora · ⏸ agente fermo · ■ a riposo', 'lavoro: cosa fa adesso e da quanto tempo', 'passi, resta: passi fatti della lista e tempo che manca', 'agenti: ▶ lavorano · ⏸ fermi · ✓ finiti · ✗ interrotti', 'tk ag.: token degli agenti · velocità: token al minuto', 'ultracode: compare solo se è acceso', 'Sonnet: modello e token della chat', 'risp.: token di agenti Haiku e Sonnet sul totale', 'Opt.: 0 tutto Opus, 100 tutto Haiku (verde ≥50)', 'PANNELLO', 'live: turno in corso · workflow: dal reset · totale: chat', 'tachimetro: ago su marcia ed effort (5 tacche per marcia)', 'tabella agenti: agenti e token di ogni marcia (non la chat)', 'bandiere: lingua del pannello', '↗ apre la pagina nel browser: 3 viste, si aggiorna ogni 5 s', 'la tabella agenti ha numero, durata e orario di ognuno'],
  en: ['BAR', 'left scale and speedometer: gear 1 HAIKU, 2 SONNET, 3 HIGH, 4 OPUS, 5 MAX', '▶ working · ⏸ agent stopped · ■ idle', 'work: what it does now and for how long', 'steps, left: steps done of the list and time to go', 'agents: ▶ working · ⏸ stopped · ✓ done · ✗ interrupted', 'ag. tk: agent tokens · speed: tokens per minute', 'ultracode: shown only when it is on', 'Sonnet: the chat model and its tokens', 'sav.: tokens by Haiku and Sonnet agents over the total', 'Opt.: 0 all Opus, 100 all Haiku (green ≥50)', 'PANEL', 'live: current turn · workflow: since reset · total: chat', 'speedometer: needle on gear and effort (5 steps per gear)', 'agents table: agents and tokens of each gear (not the chat)', 'flags: language of the panel', '↗ opens the page in the browser: 3 views, updates every 5 s', 'the agents table has number, duration and time of each'],
  de: ['LEISTE', 'Skala links und Tacho: Gang 1 HAIKU, 2 SONNET, 3 HIGH, 4 OPUS, 5 MAX', '▶ arbeitet · ⏸ Agent gestoppt · ■ Ruhe', 'Arbeit: was jetzt läuft und seit wann', 'Schritte, Rest: erledigte Schritte und verbleibende Zeit', 'Agenten: ▶ arbeiten · ⏸ gestoppt · ✓ fertig · ✗ abgebrochen', 'Ag.-Tk: Token der Agenten · Tempo: Token pro Minute', 'ultracode: nur sichtbar, wenn aktiv', 'Sonnet: Modell des Chats und seine Token', 'Ersp.: Token von Haiku- und Sonnet-Agenten am Gesamten', 'Opt.: 0 alles Opus, 100 alles Haiku (grün ≥50)', 'PANEL', 'live: aktueller Durchgang · Workflow: seit Reset · gesamt: Chat', 'Tacho: Nadel auf Gang und Aufwand (5 Stufen je Gang)', 'Agenten-Tabelle: Agenten und Token jedes Gangs (nicht der Chat)', 'Flaggen: Sprache des Panels', '↗ öffnet die Seite im Browser: 3 Ansichten, Update alle 5 s', 'die Agententabelle zeigt Nummer, Dauer und Uhrzeit'],
  fr: ['BARRE', 'échelle à gauche et compteur : vitesse 1 HAIKU, 2 SONNET, 3 HIGH, 4 OPUS, 5 MAX', '▶ travaille · ⏸ agent arrêté · ■ repos', 'travail : ce qu\'il fait et depuis quand', 'étapes, reste : étapes faites de la liste et temps restant', 'agents : ▶ au travail · ⏸ arrêtés · ✓ finis · ✗ interrompus', 'tk ag. : tokens des agents · vitesse : tokens par minute', 'ultracode : visible seulement s\'il est actif', 'Sonnet : modèle du chat et ses tokens', 'écon. : tokens des agents Haiku et Sonnet sur le total', 'Opt. : 0 tout Opus, 100 tout Haiku (vert ≥50)', 'PANNEAU', 'live : tour en cours · workflow : depuis le reset · total : chat', 'compteur : aiguille sur vitesse et effort (5 crans par vitesse)', 'tableau des agents : agents et tokens de chaque vitesse (pas le chat)', 'drapeaux : langue du panneau', '↗ ouvre la page dans le navigateur : 3 vues, mise à jour toutes les 5 s', 'le tableau des agents a numéro, durée et heure'],
  es: ['BARRA', 'escala a la izquierda y velocímetro: marcha 1 HAIKU, 2 SONNET, 3 HIGH, 4 OPUS, 5 MAX', '▶ trabaja · ⏸ agente parado · ■ reposo', 'trabajo: qué hace ahora y desde cuándo', 'pasos, resta: pasos hechos de la lista y tiempo que falta', 'agentes: ▶ trabajan · ⏸ parados · ✓ acabados · ✗ interrumpidos', 'tk ag.: tokens de los agentes · velocidad: tokens por minuto', 'ultracode: solo se ve si está activo', 'Sonnet: modelo del chat y sus tokens', 'ahor.: tokens de agentes Haiku y Sonnet sobre el total', 'Opt.: 0 todo Opus, 100 todo Haiku (verde ≥50)', 'PANEL', 'live: turno en curso · workflow: desde el reset · total: chat', 'velocímetro: aguja sobre marcha y esfuerzo (5 pasos por marcha)', 'tabla de agentes: agentes y tokens de cada marcha (no el chat)', 'banderas: idioma del panel', '↗ abre la página en el navegador: 3 vistas, se actualiza cada 5 s', 'la tabla de agentes tiene número, duración y hora'],
}

// Ignition: true in the first second of a turn; the drawings then play their start-up animations once.
let ACC = false
let ADESSO = 0
// Numbers that count up to the new value in about one second instead of jumping.
const CONTA: Record<string, { da: number; a: number; t0: number }> = {}
let contando = false
function conta(k: string, v: number) {
  const c = CONTA[k]
  if (!c) { CONTA[k] = { da: v, a: v, t0: 0 }; return v }
  if (c.a !== v) { const ora = c.t0 ? c.da + (c.a - c.da) * Math.min(1, (ADESSO - c.t0) / 1000) : c.a; CONTA[k] = { da: ora, a: v, t0: ADESSO } }
  const x = CONTA[k], f = x.t0 ? Math.min(1, (ADESSO - x.t0) / 1000) : 1
  if (f < 1) contando = true
  return Math.round(x.da + (x.a - x.da) * f)
}

function svgRiga(d: Dati, tinta: boolean, compact: boolean, p: Passo | null, lavora = false, ora: Attivo | null = null, adesso = 0, vivoTok = 0, gruppo = false) {
  const out: string[] = lavora ? [ANIM] : []
  let x = 0
  const H = 26, Y = 18
  const t = (s: string, cls = '', col?: string) => {
    out.push(`<text x="${x}" y="${Y}"${cls ? ` class="${cls}"` : ''}${col ? ` style="fill:${col}"` : ''}>${esc(s)}</text>`)
    x += largo(s)
  }
  const sp = (n = 8) => { x += n }
  // From a million up the count is shortened (165,2M) so the right block keeps its width.
  const ktc = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')}M` : kt(n))
  // Model and its tokens as two small lines, name above and count under it, centred in one column.
  const colonna = (nome: string, col: string | undefined, num: string) => {
    const w = 54 // fixed slot: the block never changes width with the numbers
    out.push(`<text x="${x + w / 2}" y="9" text-anchor="middle" class="sm"${col ? ` style="fill:${col}"` : ''}>${esc(nome)}</text><text x="${x + w / 2}" y="21" text-anchor="middle" class="mu" style="font-size:10px">${esc(num)}</text>`)
    x += w
  }
  const sep = () => { sp(14) }
  const celle = (f: number, col: string) => {
    const n = Math.max(0, Math.min(5, Math.round(f * 5)))
    for (let i = 0; i < 5; i++) out.push(`<rect x="${x + i * 10}" y="6.5" width="8" height="11" rx="1.8"${i < n ? ` style="fill:${tinta ? col : '#8a8a84'}"` : ' class="v"'}/>`)
    x += 50 + 4
  }
  // Metrics cells, then model, saving and Opt. bars: one block next to the arrows.
  const corto = (s: string, n: number) => s.slice(0, n) // cut at the slot edge, never with dots
  const tokAg = d.righe.reduce((a, r) => a + (r.tok || 0), 0)
  // Fixed cells (shared by the left block and the right block): every datum has its own slot (small label above, value below, colour or bar), so nothing moves while it is read.
  const secV = adesso && inizioTurno ? Math.round((adesso - Date.parse(inizioTurno)) / 1000) : 0
  const vel = lavora && vivoTok > 0 && secV > 5 ? `${kt(Math.round(vivoTok / (secV / 60)))}/min` : '–'
  const cella = (w: number, et: string, val: string, col?: string, fr?: number, raw?: string, fs = 10) => {
    const mx = Math.max(3, Math.floor((w - 4) / (fs * 0.55))), cc = tinta && col ? col : ''
    out.push(`<text x="${x}" y="9" class="sm mu">${esc(et)}</text><text x="${x}" y="21" class="sm" style="font-size:${fs}px${cc ? `;fill:${cc}` : ''}">${raw ?? esc(corto(val, mx))}</text>`)
    if (fr !== undefined) out.push(`<rect x="${x}" y="23" width="${w - 8}" height="3" rx="1.5" class="v"/><rect x="${x}" y="23" width="${Math.max(1, Math.round((w - 8) * Math.min(1, Math.max(0, fr))))}" height="3" rx="1.5" style="fill:${cc || '#8a8a84'}"/>`)
    x += w
  }
  const ag = ([[d.lavorano, '▶', COL.medium], [d.fermi, '⏸', COL.high], [d.completi, '✓', '#8a8a84'], [d.interrotti, '✗', '#c0714f']] as [number, string, string][]).map(([k, g, c]) => `<tspan${tinta ? ` style="fill:${c}"` : ''}>${g}${k}</tspan>`).join(' ')

  // Model + tokens and the score bar, drawn as their own small image next to the arrows.
  if (gruppo) {
  if (!compact) {
  if (d.ultra) cella(46, 'ultracode', 'ON', COL.max) // leftmost: when it appears the other cells stay where they are
  cella(38, tr('passi'), d.perc !== null ? `${d.fatti}/${d.tot}` : '–', COL.medium, d.perc ?? 0)
  cella(42, tr('resta'), d.eta !== null ? `~${dur(d.eta)}` : '–', COL.high, d.eta !== null ? d.el / (d.el + d.eta) : 0)
  cella(76, tr('agenti'), '', undefined, undefined, ag)
  cella(38, tr('tk ag.'), tokAg > 0 ? (tokAg >= 1e4 && tokAg < 1e6 ? `${Math.round(tokAg / 1000)}k` : ktc(tokAg)) : '–')
  cella(70, tr('velocità'), vel)
  sp(4)
  }
  // The model the chat is using now, e.g. 'opus-5-5' -> 'Opus 5.5'.
  // Model and effort the chat is using now, then the tokens of the current job per model.
  const mod = p?.model || d.chat
  // One fixed slot: the model in use and its tokens (the live job while it works, else the model's tokens in this view).
  { const nomeM = nomeModello(mod || d.chat).split(' ')[0], tkM = lavora && vivoTok > 0 ? conta('vivo', vivoTok) : ((d.tokmod ?? []).find(([m]) => m === mod)?.[1] ?? d.stok ?? d.tok ?? 0)
    colonna(nomeM, tinta ? colMod(mod || d.chat) : undefined, `${ktc(tkM)}tk`) }
  // Saving bar, same drawing as the Opt. bar, after the model, before the Opt. bar.
  sp(x > 0 ? 2 : 0)
  { const bassi = ['light', 'medium', 'high'].reduce((a, k) => a + (d.perliv?.[k]?.[1] ?? 0), 0), pr = d.stok ? Math.round(bassi / d.stok * 100) : 0
    const ci = tinta ? (pr >= 50 ? COL.medium : pr >= 20 ? COL.high : '#c0714f') : '#8a8a84'
    out.push(`<rect x="${x + 6}" y="3" width="32" height="7" rx="3" class="v"/><rect x="${x + 6}" y="3" width="${Math.max(2, pr * 0.32)}" height="7" rx="3" style="fill:${ci}"/><text x="${x + 22}" y="21" text-anchor="middle" style="font-size:10px${tinta ? `;fill:${ci}` : ''}">${tr('risp.')} ${d.stok ? pr + '%' : '–'}</text>`)
    x += 50 }
  // Whole session: all tokens so far and how many agents it has used.
  const io = indiceOtt(d)
  { sp(6) // always drawn, empty track when there is no index yet: the slot never disappears
    const v = io ?? 0, ci = tinta && io !== null ? (v >= 50 ? COL.medium : v >= 20 ? COL.high : '#c0714f') : '#8a8a84'
    // Small bar filled to the index, so the number reads as a score out of 100 without the word.
    out.push(`<rect x="${x}" y="3" width="32" height="7" rx="3" class="v"/><rect x="${x}" y="3" width="${io === null ? 0 : Math.max(2, v * 0.32)}" height="7" rx="3" style="fill:${ci}"/><text x="${x + 16}" y="21" text-anchor="middle" style="font-size:10px${tinta ? `;fill:${ci}` : ''}">Opt. ${io === null ? '–' : v + '%'}</text>`)
    x += 44 }
    const w = Math.ceil(x + 2)
    return { source: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${H}" viewBox="0 0 ${w} ${H}">${STILE}${out.join('')}</svg>`, width: w }
  }
  // Gear ladder: five steps rising from LIGHT to MAX, filled up to the current gear, each in its own color; then the name and the step.
  const MARCE = ['light', 'medium', 'high', 'opus', 'max']
  // The gear now: the agent working at this moment, else the model the chat is using; the last agent's gear only as a fallback.
  const liv = (d.attivi[0] ? livChat(d.attivi[0].model || '') : null) || livChat(d.chat || '') || livChat(p?.model || '') || d.livello
  // The five steps follow the effort the chat is using (Basso, Medio, Alto, Extra, Max), as in the app's menu; without an effort they follow the gear.
  const EFF = ['low', 'medium', 'high', 'xhigh', 'max'], NOMI_EFF = ['BASSO', 'MEDIO', 'ALTO', 'EXTRA', 'MAX']
  const ke = -1 // the ladder shows the gear (model + effort), same as the speedometer and the table
  const k = ke >= 0 ? ke : liv ? MARCE.indexOf(liv) : -1
  // The name sits under the ladder, both centred in one block as wide as the wider of the two.
  const nome = ke >= 0 ? NOMI_EFF[ke] : liv ? nomeMarcia(liv) : ''
  const Wb = 40 // fixed: the symbol and the work cell never move when the gear name changes
  const ox = (Wb - 22) / 2
  MARCE.forEach((m, i) => {
    const h = 2.5 + i * 1.8
    // while working the active step glows: a soft halo behind it and a slow pulse
    if (lavora && i === k) out.push(`<rect x="${ox + i * 4.5 - 1.2}" y="${14.5 - h}" width="5.6" height="${h + 3}" rx="2.5" class="gp" style="fill:${tinta ? COL[m] : '#55554f'};opacity:.35;filter:blur(1.5px)"/>`)
    const acc = ACC ? `<animate attributeName="opacity" values="0;0;1" keyTimes="0;${(i * 0.15).toFixed(2)};1" dur="${(0.3 + i * 0.15).toFixed(2)}s" fill="freeze"/>` : ''
    out.push(`<rect x="${ox + i * 4.5}" y="${14 - h}" width="3.2" height="${h}" rx="1"${lavora && i === k ? ' class="gp"' : ''}${i <= k ? ` style="fill:${tinta ? COL[m] : '#55554f'}"` : ' class="v"'}>${acc}</rect>`)
  })
  x = Wb + 3
  if (k >= 0) {
    out.push(`<text x="${Wb / 2}" y="21" text-anchor="middle" style="font-size:8px;letter-spacing:.1px${tinta ? `;fill:${COL[MARCE[k]]}` : ''}">${esc(nome)}</text>`)
    if (d.dir === '▲' || d.dir === '▼') { t(d.dir === '▲' ? '↑' : '↓', 'sm', tinta ? (d.dir === '▲' ? COL.high : COL.medium) : undefined); sp(2) }
  } else t(tr('nessuna marcia'), 'mu')
  // As in Max's mock-up: the state word next to the ladder, then two lines, each 'text | other data':
  // 1) the work (agent and its task, or the chat's) | time, steps, time left
  // 2) where it works (file, command, else the folder) | who does it, agents, their tokens
  const a0 = d.attivi[0]
  let stato = tr('pronto'), cosa = '', tempo = '', dove = ''
  if (lavora && ora) {
    const sp2 = spiega(ora), sec = adesso && ora.t0 ? Math.max(0, Math.round((adesso - ora.t0) / 1000)) : 0
    stato = tr('lavora'); cosa = sp2.cosa; tempo = sec ? dur(sec) : ''; dove = sp2.dove || ora.cosa.trim()
  } else if (lavora) {
    const s0 = adesso && inizioTurno ? Math.max(0, Math.round((adesso - Date.parse(inizioTurno)) / 1000)) : 0
    stato = tr('pensa…'); tempo = s0 ? dur(s0) : ''
  }
  // State as a symbol: play while it works, pause when an agent is stopped, stop when idle.
  const [sim, colS] = lavora ? ['▶', COL.medium] : d.fermi > 0 ? ['⏸', COL.high] : ['■', '#8a8a84']
  out.push(`<text x="${x}" y="21" style="font-size:14px${tinta ? `;fill:${colS}` : ''}">${sim}</text>`); x += 18
  const lavoro = a0 ? `${a0.nome}: ${a0.desc}` : d.compito ? `${tr('chat')}: ${d.compito}` : ''
  if (!compact) { // always both lines, as in Max's base
    cella(150, `${tr('lavoro')}${tempo || d.el ? ' ' + (tempo || dur(d.el)) : ''}`, lavoro || cosa || (lavora ? tr('pensa…') : tr('in attesa')), lavora ? COL.medium : undefined, undefined, undefined)
  }
  const w = Math.ceil(x + 2)
  return { source: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${H}" viewBox="0 0 ${w} ${H}">${STILE}${out.join('')}</svg>`, width: w }
}

// ONMAKE logo (assets/onmake-logo.svg) with its link to the site inside the SVG.
let ultimoGrp: { source: string; width: number } = { source: '', width: 0 }
const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="32" height="34" viewBox="0 -5 100 114"><a href="https://www.onmake.it" xlink:href="https://www.onmake.it" target="_blank" rel="noopener"><title>onmake.it</title><defs> <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"> <stop offset="0" stop-color="#8fbc7c"/><stop offset="0.45" stop-color="#6aa057"/><stop offset="1" stop-color="#5f9a4e"/> </linearGradient> <linearGradient id="f" x1="0" y1="0" x2="1" y2="1"> <stop offset="0" stop-color="#4a4a48"/><stop offset="1" stop-color="#2f2f2e"/> </linearGradient> </defs> <path d="M50 3 L92.4 27.5 Q94 28.4 94 30.3 L94 73.7 Q94 75.6 92.4 76.5 L50 101 L7.6 76.5 Q6 75.6 6 73.7 L6 30.3 Q6 28.4 7.6 27.5 Z" fill="url(#f)"/> <path d="M50 12.5 L85.5 33 L85.5 71 L50 91.5 L14.5 71 L14.5 33 Z" fill="url(#g)" stroke="#6b6b69" stroke-width="0.8"/> <path d="M14.5 33 L50 12.5 L85.5 33 L85.5 40 Q50 32 14.5 66 Z" fill="#ffffff" opacity="0.12"/> <text x="50" y="58" text-anchor="middle" font-family="Futura, 'Avenir Next', 'Century Gothic', system-ui, sans-serif" font-weight="600" font-size="15.5" textLength="66" lengthAdjust="spacingAndGlyphs" fill="#363634">ONMAKE</text></a></svg>`
const SITO = 'https://www.onmake.it'

// One agent row of the dropdown, drawn like the bar so both share size and weight.
function svgAgente(x: { stato: string; liv: string; nome: string; dir: string; model: string; tok: number; ago: number; desc: string }, tinta: boolean) {
  const out: string[] = []
  let px = 0
  const t = (s: string, cls = '', col?: string) => {
    out.push(`<text x="${px}" y="17"${cls ? ` class="${cls}"` : ''}${col ? ` style="fill:${col}"` : ''}>${esc(s)}</text>`)
    px += largo(s)
  }
  const ic = x.stato === 'lavora' ? '▶' : x.stato === 'fermo' ? '⏸' : '✓'
  const col = x.stato === 'fermo' ? COL.high : COL[x.liv] ?? GRIGIO
  t(`${ic} ${x.nome}${x.dir === '▲' || x.dir === '▼' ? ' ' + x.dir : ''}`, x.stato === 'completato' ? 'mu' : '', tinta && x.stato !== 'completato' ? col : undefined)
  px += 10
  if (x.stato === 'fermo') { t(`${tr('fermo da')} ${dur(x.ago)}`, '', tinta ? COL.high : undefined); px += 10 }
  t(nomeModello(x.model), 'mu'); px += 10
  t(`${kt(x.tok)} tk`, 'mu'); px += 10
  t(x.desc, x.stato === 'completato' ? 'mu' : '')
  const w = Math.ceil(px + 2)
  return { source: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="24" viewBox="0 0 ${w} 24">${STILE}${out.join('')}</svg>`, width: w }
}

// A plain label drawn like the bar, so it has the bar's text size.
function svgScritta(s: string, col?: string, fisso = 0) {
  // fisso: same width for every info line, so the app scales them all alike and the text stays one size
  const w = fisso || Math.ceil(largo(s) * 1.08 + 8)
  return { source: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="18" viewBox="0 0 ${w} 18">${STILE}<text x="0" y="13"${col ? ` style="fill:${col}"` : ' class="mu"'}>${esc(s)}</text></svg>`, width: w }
}

// Bar of where the session tokens went: main chat and each gear's agents, with the share of each.
function svgBarra(pl: Record<string, [number, number]>, tot: number, tinta: boolean) {
  const W = 380
  const liv = ['light', 'medium', 'high', 'opus', 'max']
  const ag = liv.reduce((a, k) => a + (pl[k]?.[1] ?? 0), 0)
  const parti: [string, number, string][] = [['chat', Math.max(0, tot - ag), '#c0714f'], ...liv.map(k => [nomeMarcia(k), pl[k]?.[1] ?? 0, COL[k]] as [string, number, string])]
  let x = 0, lx = 0
  const out: string[] = [`<text x="0" y="10" class="mu sm">${tr('chi ha usato i token')}</text>`, `<rect x="0" y="16" width="${W}" height="10" rx="3" class="v"/>`]
  for (const [nome, n, col] of parti) {
    if (!tot || !n) continue
    const w = Math.max(2, n / tot * W)
    out.push(`<rect x="${x.toFixed(1)}" y="16" width="${w.toFixed(1)}" height="10" style="fill:${tinta ? col : GRIGIO}"/>`)
    x += w
    const s = `${nome} ${(n / tot * 100).toFixed(1).replace('.', ',')}% · ${n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + 'M' : kt(n)}`
    out.push(`<rect x="${lx}" y="33" width="8" height="8" rx="2" style="fill:${tinta ? col : GRIGIO}"/><text x="${lx + 12}" y="41" class="sm mu">${s}</text>`)
    lx += 12 + largo(s) * 0.9 + 14
  }
  const Wt = Math.max(W, Math.ceil(lx)) // the legend can be wider than the bar
  return { source: `<svg xmlns="http://www.w3.org/2000/svg" width="${Wt}" height="46" viewBox="0 0 ${Wt} 46">${STILE}${out.join('')}</svg>`, width: Wt }
}

// Dashboard gauge: half dial with the 5 gears as coloured sectors, needle on the active one, arrow up/down.
// The gear now: the agent working at this moment, else the model the chat is using; the last agent's gear only as a fallback.
const livAdesso = (d: Dati) => (d.attivi[0] ? livChat(d.attivi[0].model || '') : null) || livChat(d.chat || '') || d.livello
const livChat = (m: string) => (/haiku/.test(m) ? 'light' : /sonnet/.test(m) ? 'medium' : /opus/.test(m) ? 'opus' : null)
// Car speedometer: 240° dial, scale 0..10 thousand token/min with ticks and numbers, gear zones on the rim,
// needle on the real speed of this turn (tokens per minute), digital readout and gear + effort under the hub.
function svgCruscotto(livello: string | null, dir: string, tinta: boolean, lavora: boolean, impegno = '', vel = 0) {
  const M = ['light', 'medium', 'high', 'opus', 'max'], cx = 70, cy = 66, R = 56, MAXV = 0
  const ang = (f: number) => (210 - 240 * f) * Math.PI / 180
  const pt = (a: number, r: number) => [(cx + r * Math.cos(a)).toFixed(1), (cy - r * Math.sin(a)).toFixed(1)]
  const k = livello ? M.indexOf(livello) : -1
  const out: string[] = lavora ? [ANIM] : []
  out.push(`<circle cx="${cx}" cy="${cy}" r="${R + 4}" style="fill:#fafaf7;stroke:#d6d6cf;stroke-width:1.5"/>`)
  M.forEach((m, i) => {
    const [x0, y0] = pt(ang(i / 5) - 0.02, R), [x1, y1] = pt(ang((i + 1) / 5) + 0.02, R)
    out.push(`<path d="M ${x0} ${y0} A ${R} ${R} 0 0 1 ${x1} ${y1}" style="fill:none;stroke:${tinta ? COL[m] : '#8a8a84'};stroke-width:${i === k ? 6 : 3};opacity:${i === k ? 1 : 0.45}"${i === k && lavora ? ' class="gp"' : ''}>${ACC ? `<animate attributeName="stroke-opacity" values="0;0;1" keyTimes="0;${(i / 6).toFixed(2)};1" dur="${(0.25 + i * 0.18).toFixed(2)}s" fill="freeze"/>` : ''}</path>`)
  })
  for (let j = 0; j <= 25; j++) {
    const big = j % 5 === 0, a = ang(j / 25)
    const [x0, y0] = pt(a, R - 4), [x1, y1] = pt(a, R - (big ? 12 : 8))
    out.push(`<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" style="stroke:#55554f;stroke-width:${big ? 1.6 : 0.8}"/>`)
    // number (1-5) of each gear in the middle of its sector: 5 effort steps per gear (as in the app's menu), 25 in all
    if (j % 5 === 2) { const [tx, ty] = pt(a, R - 20); out.push(`<text x="${tx}" y="${(+ty + 3).toFixed(1)}" text-anchor="middle" class="sm"${tinta ? ` style="fill:${COL[M[(j - 2) / 5]]}"` : ''}>${(j - 2) / 5 + 1}</text>`) }
  }
  // needle = gear and effort together: each gear has 5 steps (low, medium, high, xhigh, max)
  const ei = Math.max(0, ['low', 'medium', 'high', 'xhigh', 'max'].indexOf(impegno))
  // inside the gear's sector the needle follows the load: the real speed (15k token/min = end of the sector), never below the effort step
  const p = Math.max((ei + 0.5) / 5, Math.min(1, vel / 15000))
  const f = k >= 0 ? (k + 0.06 + 0.88 * p) / 5 : 0, a = ang(f)
  const [nx, ny] = pt(a, R - 10), [bx, by] = pt(a + Math.PI, 8)
  // ignition: the needle sweeps to the end of the scale and comes back to its place (rotation in screen degrees)
  const gf = 210 - 240 * f
  const vib = ACC ? `<animateTransform attributeName="transform" type="rotate" values="${(gf - 210).toFixed(1)} ${cx} ${cy};${(gf + 30).toFixed(1)} ${cx} ${cy};0 ${cx} ${cy}" keyTimes="0;0.55;1" dur="1.2s" fill="freeze"/>` : ''
  out.push(`<line x1="${bx}" y1="${by}" x2="${nx}" y2="${ny}" style="stroke:#c0392b;stroke-width:2.2;stroke-linecap:round">${vib}</line>`)
  out.push(`<circle cx="${cx}" cy="${cy}" r="5" style="fill:#3a3a36"/>`)
  const nome = k >= 0 ? nomeMarcia(M[k]) : tr('ferma')
  out.push(`<text x="${cx}" y="${cy + 24}" text-anchor="middle" style="font-weight:600${k >= 0 && tinta ? `;fill:${COL[M[k]]}` : ''}">${nome}${dir === '▲' ? ' ↑' : dir === '▼' ? ' ↓' : ''}</text>`)
  if (impegno) out.push(`<text x="${cx}" y="${cy + 38}" text-anchor="middle" class="sm mu">${tr(({ low: 'basso', medium: 'medio', high: 'alto', xhigh: 'extra', max: 'max' } as Record<string, string>)[impegno] ?? impegno)}</text>`)
  return { source: `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="90" viewBox="0 0 140 132">${STILE}${out.join('')}</svg>`, width: 96 }
}

// Grid of the 4 gears: colour, name, agents used and their tokens in this session.
function svgGriglia(pl: Record<string, [number, number]>, tinta: boolean, attuale: string | null) {
  const liv = ['light', 'medium', 'high', 'opus', 'max']
  const mod: Record<string, string> = { light: 'Haiku', medium: 'Sonnet', high: 'Sonnet', opus: 'Opus', max: 'Opus' }
  const eff: Record<string, string> = { light: 'basso', medium: 'basso', high: 'alto', opus: 'alto', max: 'max' }
  const righe = liv.map((k, i) => {
    const [n, tk] = pl[k] ?? [0, 0]
    const y = 42 + i * 16
    const on = attuale === k
    return `<text x="0" y="${y}" class="mu">${i + 1}</text><rect x="12" y="${y - 9}" width="8" height="8" rx="2" style="fill:${tinta ? COL[k] : GRIGIO}"/>`
      + `<text x="26" y="${y}" class="sm"${on ? ` style="fill:${tinta ? COL[k] : GRIGIO}"` : ''}>${nomeMarcia(k)}</text>`
      + `<text x="82" y="${y}" class="mu">${mod[k]}</text><text x="130" y="${y}" class="mu">${tr(eff[k])}</text>`
      + `<text x="208" y="${y}" class="mu" text-anchor="end">${n}</text>`
      + `<text x="288" y="${y}"${n ? '' : ' class="mu"'} text-anchor="end">${kt(tk)}</text>`
  })
  const testa = `<text x="0" y="10" class="sm">${tr('Tabella agenti')}</text><text x="82" y="24" class="mu sm">${tr('modello')}</text><text x="130" y="24" class="mu sm">${tr('effort')}</text><text x="208" y="24" class="mu sm" text-anchor="end">${tr('agenti')}</text><text x="288" y="24" class="mu sm" text-anchor="end">${tr('token')}</text>`
  return { source: `<svg xmlns="http://www.w3.org/2000/svg" width="292" height="114" viewBox="0 0 292 114">${STILE}${testa}${righe.join('')}</svg>`, width: 292 }
}

async function apriSito($: EngineInterface) {
  const windows = (await $.env.get('OS')) === 'Windows_NT'
  const mac = !windows && (await $.process.run(['uname'])).stdout.trim() === 'Darwin'
  await $.process.run(windows ? ['cmd', '/c', 'start', '', SITO] : [mac ? 'open' : 'xdg-open', SITO])
}

async function apriPannello($: EngineInterface) {
  const sid = await $.session.id()
  const file = `${await home($)}/.config/onmake-gear/pannello-${String(sid).replace(/[^A-Za-z0-9]/g, '').slice(0, 12)}.html`
  const script = `${$.plugin.root}/scripts/pannello.py`
  const cwd = await $.session.cwd(), lg = (await read($, lingua).catch(() => 'it')) || 'it', rs = (await read($, reset).catch(() => '')) || ''
  const args = ['--cartella', cwd, '--sessione', sid, '--html', file, '--lingua', lg, ...(rs ? ['--reset', rs] : [])]
  const r = await $.process.run(['python3', script, ...args])
  if (r.exitCode !== 0) return false
  // The page keeps itself up to date: a small background loop rewrites the three views every 5 s while the session is active (one per session).
  const q = (x: string) => `'${x.replace(/'/g, `'\\''`)}'`
  await $.process.run(['sh', '-c', `nohup python3 ${q(script)} ${args.map(q).join(' ')} --segui >/dev/null 2>&1 &`]).catch(() => undefined)
  const windows = (await $.env.get('OS')) === 'Windows_NT'
  const mac = !windows && (await $.process.run(['uname'])).stdout.trim() === 'Darwin'
  await $.process.run(windows ? ['cmd', '/c', 'start', '', file] : [mac ? 'open' : 'xdg-open', file])
  return true
}

// Session control: tools of the desktop app; their answer may be text or an object, so read it defensively.
function testo(r: unknown): string {
  if (typeof r === 'string') return r
  if (r && typeof r === 'object') {
    const o = r as { text?: unknown; result?: unknown; deny?: unknown }
    if (typeof o.deny === 'string') throw new Error(o.deny)
    if (typeof o.text === 'string') return o.text
    if (o.result !== undefined) return typeof o.result === 'string' ? o.result : JSON.stringify(o.result)
  }
  return JSON.stringify(r ?? '')
}

function elenco(r: unknown): Sessione[] {
  const t = testo(r)
  let v: unknown
  try {
    v = JSON.parse(t)
  } catch {
    const i = t.indexOf('['), j = t.lastIndexOf(']')
    v = i >= 0 && j > i ? JSON.parse(t.slice(i, j + 1)) : []
  }
  if (v && !Array.isArray(v) && typeof v === 'object') v = Object.values(v as object).find(Array.isArray) ?? []
  return (v as Record<string, unknown>[])
    .map(x => ({ id: String(x.session_id ?? x.sessionId ?? x.id ?? ''), nome: String(x.title ?? x.name ?? x.session_id ?? x.id ?? '').slice(0, 40), padre: String(x.startedBy ?? ''), fissata: x.pinned === true }))
    .filter(x => x.id !== '')
}

// Like the sidebar: pinned first, then by name; a session started by another sits under it with └.
function albero(l: (Sessione & { padre: string; fissata: boolean })[]): Sessione[] {
  const ids = new Set(l.map(x => x.id))
  const ord = (a: { nome: string; fissata: boolean }, b: { nome: string; fissata: boolean }) => Number(b.fissata) - Number(a.fissata) || a.nome.localeCompare(b.nome, 'it', { sensitivity: 'base' })
  const out: Sessione[] = []
  const giu = (padre: string, liv: number) => l.filter(x => (liv === 0 ? !ids.has(x.padre) : x.padre === padre)).sort(ord).forEach(x => {
    out.push({ id: x.id, nome: (liv ? '\u2003'.repeat(liv - 1) + '└ ' : '') + x.nome })
    if (liv < 4) giu(x.id, liv + 1)
  })
  giu('', 0)
  return out
}

async function caricaSessioni($: EngineInterface) {
  try {
    const r = await $.tool.call({ tool: 'mcp__ccd_session_mgmt__list_sessions', limit: 100 } as never)
    const l = albero(elenco(r))
    await update($, sessioni, () => l)
    if (l.length > 0 && (await read($, scelta)) === '') await update($, scelta, () => l[0].id)
  } catch (err) {
    $.ui.toast(`${tr('Gear: sessioni non lette')} (${String(err).slice(0, 60)})`)
  }
}

// The controls act on the chat this bar sits in: stop the running turn, resume, cancel, or send a command.
let turnoId: string | undefined
async function azione($: EngineInterface, cosa: 'invia' | 'ferma' | 'riprendi' | 'annulla', scritto?: string) {
  const msg = cosa === 'riprendi' ? 'continua da dove eri rimasto'
    : cosa === 'annulla' ? 'Lavoro annullato: non continuare il compito di prima, aspetta le mie istruzioni.'
    : (scritto ?? (await read($, comando))).trim()
  if (cosa === 'invia' && msg === '') return $.ui.toast(tr('Gear: scrivi un comando'))
  try {
    if (cosa === 'ferma' || cosa === 'annulla') {
      if (turnoId) await $.turn.abort({ turnId: turnoId }).catch(() => undefined)
      turnoId = undefined
      if (cosa === 'ferma') return $.ui.toast(tr('Gear: fermata'))
    }
    await $.prompt.submit({ text: msg })
    $.ui.toast(tr(cosa === 'annulla' ? 'Gear: annullato' : 'Gear: inviato'))
    if (cosa === 'invia') await update($, comando, () => '')
  } catch (err) {
    $.ui.toast(`${tr('Gear: non riuscito')} (${String(err).slice(0, 80)})`)
  }
}

async function apriChiudi($: EngineInterface) {
  await update($, aperta, v => !v)
}

let last = 0
let fase = '' // what the model streams now: pensa or scrive (main chat)
let CARTELLA = '' // the session's folder: where the chat works when no tool names a file
let carLetto = 0 // value of car when the transcript was last read
let car = 0 // real tokens of this turn, from the usage the model sends at the end of every step
let inizioTurno = '' // start of the current turn, for the live view
let veloce: { cancel: () => void } | undefined // 100 ms tick while a number counts
let fermaTic: { cancel: () => void } | undefined // stops the 1 s timer

// At most one run every 8 s: a long transcript takes a couple of seconds to read.
async function aggiorna($: EngineInterface, below: boolean, compact: boolean) {
  const now = await $.clock.now()
  if (now - last < 8000) return
  last = now
  const d = await ricarica($).catch(() => undefined)
  if (!d) last = 0 // a failed read retries at the next turn instead of keeping old numbers
  if (below && d) $.ui.status(riga(d, compact))
}

export const register: Register = (on, options) => {
  const below = options.position === 'below'
  const compact = options.compact === true

  on('session.start', async ($, e, next) => {
    await update($, comando, v => v === 'reset?' ? '' : v).catch(() => {})
    await $.command.register({ name: 'gear-pannello', description: 'Open the Gear panel: agents, progress, tokens, saving' })
    void aggiorna($, below, compact)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'gear-pannello' }, async $ => {
    const ok = await apriPannello($).catch(() => false)
    return { text: ok ? 'Gear panel opened in the browser.' : 'Gear panel: could not build the page.' }
  })

  // turn.step streams, so the hook is a generator that passes every chunk through untouched.
  // Every tool call: remember what runs now, for the live part of the main row.
  on('tool.call', async ($, e, next) => {
    const x = e as unknown as { tool: string; command?: string; file_path?: string; pattern?: string; description?: string; agentId?: string }
    const cosa = x.description || x.command || (x.file_path ? x.file_path.split('/').pop() : '') || x.pattern || ''
    const t0 = await $.clock.now().catch(() => 0)
    const nuovo = { tool: x.agentId ? `agente: ${x.tool}` : x.tool, cosa: String(cosa).replace(/\s+/g, ' '), t0 }
    await update($, attivo, () => nuovo).catch(() => undefined)
    await update($, storia, h => [nuovo, ...(h ?? [])].slice(0, 5)).catch(() => undefined)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.start', ($, e, next) => {
    if (e.agentId === undefined) {
      fermaTic?.cancel()
      fermaTic = $.clock.every(1000, () => { void update($, tic, n => n + 1).catch(() => undefined) })
    }
    if (e.agentId === undefined) { void update($, storia, () => []).catch(() => undefined); fase = ''; car = 0; carLetto = 0 }
    if (e.agentId === undefined) { turnoId = e.turnId; void $.clock.now().then(t => { inizioTurno = new Date(t).toISOString() }) }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      const v = { model: e.model, effort: e.effort === undefined ? '' : String(e.effort) }
      const was = await read($, passo).catch(() => null)
      if (!was || was.model !== v.model || was.effort !== v.effort) await update($, passo, () => v).catch(() => undefined)
      // live view: refresh while the turn runs too (still at most every 8 s)
      if ((await read($, vista).catch(() => 'tot')) === 'live') void aggiorna($, below, compact)
    }
    if (e.agentId !== undefined) return yield* next(e)
    for await (const c of next(e)) {
      if (c.kind === 'thinking') fase = 'pensa'; else if (c.kind === 'text') fase = 'scrive'; else if (c.kind === 'tool') fase = ''; else if (c.kind === 'stop' && c.usage) car += c.usage.input_tokens + c.usage.output_tokens + c.usage.cache_creation_input_tokens
      yield c
    }
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) { fermaTic?.cancel(); fermaTic = undefined }
    void aggiorna($, below, compact)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    LG = (await read($, lingua).catch(() => 'it')) || 'it'
    ADESSO = await $.clock.now().catch(() => 0)
    ACC = Boolean(inizioTurno) && ADESSO - new Date(inizioTurno).getTime() < 1000
    if (contando && !veloce) {
      veloce = $.clock.every(100, () => { void update($, tic, n => n + 1).catch(() => undefined) })
      $.clock.after(1200, () => { veloce?.cancel(); veloce = undefined })
    }
    contando = false
    void aggiorna($, below, compact).catch(() => undefined) // numbers stayed old when turn.complete did not reach the mod; at most every 8 s
    await read($, tic).catch(() => 0) // reading it redraws the band at every tick
    const sotto = await next(e).catch(() => undefined)
    const d = await read($, dati)
    if (below || e.props.hasSurvey || d === null) return sotto ?? next(e)

    const open = await read($, aperta)
    const { Box, Text, Button } = $.ui.resolve(e)
    const tinta = options.colors !== false
    const c = (k: string | null | undefined, alt?: string) => (tinta ? (k && COL[k]) || alt : undefined)
    const stack = (mine: JSX.Element) => (sotto ? <Box flexDirection="column">{mine}{sotto}</Box> : mine)
    const sep = <Text dimColor>  ·  </Text>
    // Same glyph for full and empty cells, so every cell has the same size; only the color changes.
    const barra = (f: number, col: string | undefined) => {
      const n = Math.max(0, Math.min(5, Math.round(f * 5)))
      return (
        <Text>
          <Text color={col}>{'▰'.repeat(n)}</Text>
          <Text color={tinta ? '#d4d4cc' : undefined} dimColor={!tinta}>{'▰'.repeat(5 - n)}</Text>
        </Text>
      )
    }

    const desk = e.surface === 'desktop'
    const { Svg } = $.ui.resolve(e) as unknown as { Svg: (p: { source: string; alt: string; width?: number; height?: number; isInteractive?: boolean }) => JSX.Element }
    // Small button on desktop: the word drawn like the bar, a transparent button laid over it (as on the logo).
    const tastino = (k: string, s: string, fn: () => unknown, col?: string, alt = 24) => {
      if (!desk) return tasto(k, s, fn, col)
      const g = svgScritta(s, col, s.length === 1 ? 16 : 0)
      return (
        <Box key={k} position="relative">
          <Svg source={g.source} alt={s} width={g.width} height={alt} />
          <Box position="absolute" top={0} left={0} right={0} bottom={0} justifyContent="center" alignItems="center" overflow="hidden">
            <Button key={k} plain onPress={fn}><Text>{'\u2002'}</Text></Button>
          </Box>
        </Box>
      )
    }
    const tasto = (k: string, s: string, fn: () => unknown, col?: string) => {
      // A Button holds only strings and Text (an Svg inside is refused), so its label is Text on every surface.
      return <Button key={k} plain onPress={fn}><Text color={col} dimColor={!col}>{s}</Text></Button>
    }
    const pa = await read($, passo)
    const grpNuovo = svgRiga(d, tinta, compact, pa, Boolean((e.props as { isWorking?: boolean }).isWorking) || d.lavorano > 0, null, await $.clock.now().catch(() => 0), car, true)
    // At the start of a job the turn's numbers are still zero and the group would vanish: keep the last one that had content.
    if (grpNuovo.width > 4) ultimoGrp = grpNuovo
    const grp1 = grpNuovo.width > 4 ? grpNuovo : ultimoGrp
    const riga1 = svgRiga(d, tinta, compact, pa, Boolean((e.props as { isWorking?: boolean }).isWorking) || d.lavorano > 0, await read($, attivo).catch(() => null), await $.clock.now().catch(() => 0), car)
    // The app did not show the group as a separate image: it is drawn inside the main one, 24 px after the lines.
    // Model, tokens and score bar sit in the right block, next to the arrows and the logo.
    const testaDesk = (
      <Box flexDirection="row" alignItems="center" gap={1} width={e.props.bodyColumns}>
        <Box flexGrow={1} flexShrink={1} overflow="hidden">
          <Box flexShrink={0}>
            <Svg source={riga1.source} alt={riga(d, compact)} width={riga1.width} height={26} />
          </Box>
        </Box>
        <Box flexShrink={0} flexDirection="row" gap={1} alignItems="center">
          {grp1.width > 4 ? <Box flexShrink={0}><Svg source={grp1.source} alt="modello e token" width={grp1.width} height={26} /></Box> : null}
          <Box flexDirection="column" alignItems="center">
          {tastino('tendina', open ? '↓' : '↑', () => apriChiudi($), undefined, 18)}
          {tastino('pannello', '↗', () => apriPannello($).catch(() => $.ui.toast(tr('Gear: pannello non aperto'))), undefined, 18)}
          </Box>
          {/* A button takes only text and the app does not follow a link inside an SVG, so a transparent button lies over the logo and opens the site. */}
          <Box position="relative">
            <Svg source={LOGO} alt="ONMAKE" width={32} height={34} />
            <Box position="absolute" top={0} left={0} right={0} bottom={0} justifyContent="center" alignItems="center">
              <Button key="onmake" plain onPress={() => apriSito($).catch(() => $.ui.toast(tr('Gear: sito non aperto')))}>
                <Text>{'\u2003\u2003'}</Text>
              </Button>
            </Box>
          </Box>
        </Box>
      </Box>
    )
    // One line that never wraps: the text part shrinks and is cut at the end, the two buttons keep their width.
    const testaTesto = (
      <Box flexDirection="row" alignItems="center" gap={2} width={e.props.bodyColumns}>
        <Box flexGrow={1} flexShrink={1} overflow="hidden">
          <Text wrap="truncate-end">
            {d.livello && tinta
              ? <Text backgroundColor={COL[d.livello]} color="#1c1c1a" bold> {lev(d)} </Text>
              : <Text dimColor bold>{lev(d)}</Text>}
            {sep}<Text dimColor>{kt(d.tok)} token</Text>
            {!compact && (
              <Text>
                {sep}
                <Text color={c('medium')}>▶{d.lavorano}</Text>
                <Text color={c('high')}> ⏸{d.fermi}</Text>
                <Text dimColor> ✓{d.completi}</Text>
                {d.interrotti > 0 && <Text color={tinta ? GRIGIO : undefined}> ✗{d.interrotti}</Text>}
                {d.perc !== null && <Text>{sep}{barra(d.perc, c('medium'))}<Text dimColor> {pct(d)}</Text></Text>}
                {sep}
                {d.eta !== null ? <Text>{barra(d.el / (d.el + d.eta), c('high'))}<Text dimColor> {dur(d.el)}/{dur(d.el + d.eta)}</Text></Text> : <Text dimColor>⏱ {dur(d.el)}</Text>}
              </Text>
            )}
          </Text>
        </Box>
        <Box flexShrink={0} flexDirection="row" gap={2}>
          <Button key="tendina" plain onPress={() => apriChiudi($)}>
            <Text dimColor>{open ? tr('Chiudi ▴') : tr('Dettagli ▾')}</Text>
          </Button>
          <Button key="pannello" plain onPress={() => apriPannello($).catch(() => $.ui.toast(tr('Gear: pannello non aperto')))}>
            <Text dimColor>{tr('Pannello ↗')}</Text>
          </Button>
        </Box>
      </Box>
    )
    const testa = desk ? testaDesk : testaTesto
    if (!open) return stack(testa)

    const v = await read($, vista).catch(() => 'tot')
    const rs = await read($, reset).catch(() => '')
    const scritta = (s: string, larg = 300) => <Box flexDirection="column">{s.split('\n').map((x, i) => { const g = svgScritta(x, undefined, larg); return <Svg key={String(i)} source={g.source} alt={x} width={g.width} height={18} /> })}</Box>
    // Facts of the current job (since your last message): time active, tokens split chat/agents, steps.
    const tokAg = d.righe.reduce((a, r) => a + (r.tok || 0), 0)
    const oraJ = await $.clock.now().catch(() => 0)
    // start of this turn: from turn.start, or (after a reload of the mod) from the oldest action seen in this turn
    const at0 = (await read($, attivo).catch(() => null))?.t0 ?? 0
    const h0 = ((await read($, storia).catch(() => [])) as Attivo[]).reduce((m, a) => (a.t0 && (!m || a.t0 < m) ? a.t0 : m), 0)
    const inizio = inizioTurno ? new Date(inizioTurno).getTime() : h0 || at0
    const lav0 = (Boolean((e.props as { isWorking?: boolean }).isWorking) || d.lavorano > 0) && inizio > 0 && oraJ > 0
    const extra = Math.max(0, car - carLetto) // tokens counted live since the last read of the transcript
    const tokJob = d.tok + (lav0 ? extra : 0)
    const parti = [`${tr('lavoro attivo da')} ${lav0 ? dur(Math.round((oraJ - inizio) / 1000)) : dur(d.el)}`, `${kt(conta('job', tokJob))} ${tr('token')}`, `${tr('chat')} ${kt(Math.max(0, tokJob - tokAg))}`, `${tr('agenti')} ${kt(tokAg)}`]
    if (d.tot > 0) parti.push(`${tr('passi')} ${d.fatti} ${tr('di')} ${d.tot}`)
    const r1 = parti.slice(0, 2).join(' · ') + '\n' + parti.slice(2).join(' · ')
    // Whole session, and the cost estimate (same tokens all in Opus as the reference).
    const r3 = [`${tr(v === 'wf' ? 'workflow' : v === 'live' ? 'live' : 'chat')}${d.sel ? ' ' + tr('attiva') + ' ' + dur(d.sel) : ''}`, d.sag ? `${d.sag} ${tr('agenti')}` : ''].filter(Boolean).join(' · ') + (d.stok ? `\n${kt(conta('tot', d.stok + extra))} ${tr('token')}` : '')
    // Saving in tokens, not money: tokens the agents did on models lower than Opus, and their share of the session.
    const bassi = ['light', 'medium', 'high'].reduce((a, k) => a + (d.perliv?.[k]?.[1] ?? 0), 0)
    const r4 = bassi > 0 ? `${tr('risparmio')} ${kt(bassi)} ${tr('token')} ${tr('su modelli sotto Opus')}${d.stok ? ` (${bassi / d.stok < 0.001 ? tr('meno dello 0,1') : (bassi / d.stok * 100).toFixed(1).replace('.', ',')}%)` : ''}` : ''
    const indice = indiceOtt(d)
    const r5 = indice === null ? '' : `${tr('indice ottimizzazione')} ${indice}/100${bassi > 0 ? `\n${tr('risparmio')} ${kt(bassi)} ${tr('token')} ${tr('sotto Opus')}${d.stok ? ` (${bassi / d.stok < 0.001 ? tr('<0,1') : (bassi / d.stok * 100).toFixed(1).replace('.', ',')}%)` : ''}` : ''}`
    const r2 = d.righe.length === 0 && d.interrotti === 0 ? tr('Nessun agente: lavora solo la chat.') : ''
    const icona: Record<string, string> = { lavora: '▶', fermo: '⏸', completato: '✓' }

    const adesso = await $.clock.now().catch(() => 0)
    const hist = (await read($, storia).catch(() => [])) as Attivo[]
    const lavoraOra = Boolean((e.props as { isWorking?: boolean }).isWorking) || d.lavorano > 0
    await read($, tic).catch(() => 0) // ticks the live line
    const p0 = await read($, passo).catch(() => null)
    const secT = inizioTurno ? Math.max(0, Math.round((adesso - new Date(inizioTurno).getTime()) / 1000)) : 0
    const ora0 = hist[0] ? spiega(hist[0]).cosa : ''
    const cosaFa = fase ? tr(fase + '…') : ora0
    const vivo = lavoraOra
      ? `${tr('in corso da')} ${dur(secT)}${cosaFa ? ' · ' + cosaFa : ''}${car > 0 ? ` · ${kt(car)} ${tr('token')}` : ''} · ${(p0?.model ?? d.chat).replace('claude-', '')} ${p0?.effort ?? ''} · ${d.lavorano} ${tr('agenti al lavoro')}`.replace(/ {2,}/g, ' ')
      : tr('pronto')
    const rigaVivo = desk ? scritta(vivo) : <Text dimColor>{vivo}</Text>
    const righeOra = hist.length === 0 ? null : (
      <Box flexDirection="column">
        {hist.map((a, i) => {
          const sp = spiega(a), txt = `${sp.cosa}${sp.dove ? ' ' + sp.dove.slice(0, 30) : ''} · ${Math.max(0, Math.round((adesso - a.t0) / 1000))} s`
          const pulsa = i === 0 && lavoraOra
          return desk ? (
            <Box key={String(i)} flexDirection="row" alignItems="center">
              <Svg source={`<svg xmlns="http://www.w3.org/2000/svg" width="12" height="18" viewBox="0 0 12 18">${ANIM}<circle cx="6" cy="9" r="3" class="${pulsa ? 'gp' : ''}" style="fill:${pulsa ? '#6fc08a' : '#8a8a84'}"/></svg>`} alt="" width={12} height={18} />
              {scritta(txt)}
            </Box>
          ) : <Text key={String(i)} dimColor>{pulsa ? '●' : '○'} {txt}</Text>
        })}
      </Box>
    )
    const scegli = async (x: string) => { await update($, vista, () => x); last = 0; await ricarica($).catch(() => undefined) }
    const azzera = async () => { const ora = new Date(await $.clock.now()).toISOString(); await update($, reset, () => ora); await scegli('wf'); $.ui.toast(tr('Gear: workflow azzerato da adesso')) }
    // Real buttons: the chosen view is the primary one (no drawing laid over a button, which showed its focus box).
    // Small text buttons (footnote size); the chosen view is dark with a full dot.
    const pill = (k: string, s: string, fn = () => scegli(k), si = v === k) => piccolo(k, `${si ? '●' : '○'} ${s}`, fn, si ? '#3a3a36' : undefined)
    const chiede = (await read($, comando).catch(() => '')) === 'reset?'
    const piccolo = (k: string, s: string, fn: () => unknown, col?: string) => {
      if (!desk) return tasto(k, s, fn, col)
      const g = svgScritta(s, col, s.length === 1 ? 16 : 0)
      // the clear button is longer than the word and clipped by the box of the drawing, so its focus box is exactly the word's box
      return (
        <Box key={k} position="relative">
          <Svg source={g.source} alt={s} width={g.width} height={18} />
          <Box position="absolute" top={0} left={0} right={0} bottom={0} overflow="hidden" flexDirection="row">
            <Button key={k} plain onPress={fn}><Text size="footnote">{'\u00a0'.repeat(Math.max(1, Math.floor(g.width / 9)))}</Text></Button>
          </Box>
        </Box>
      )
    }
    const apriG = await read($, guida).catch(() => false)
    const lg = (await read($, lingua).catch(() => 'it')) || 'it'
    const sel = (
      <Box flexDirection="row" gap={3} alignItems="center">
        {pill('live', tr('live'))}
        {pill('wf', rs ? `${tr('workflow da')} ${new Date(rs).toTimeString().slice(0, 5)}` : tr('workflow'))}
        {pill('tot', tr('totale chat'))}
        {chiede
          ? <Box flexDirection="row" gap={2}>{piccolo('q', tr('azzerare il workflow da adesso?'), () => undefined)}{piccolo('ok', tr('OK'), async () => { await update($, comando, () => ''); await azzera() }, COL.high)}{piccolo('no', tr('annulla'), () => update($, comando, () => ''))}</Box>
          : piccolo('reset', tr('↺ nuovo workflow'), () => { void update($, comando, () => 'reset?'); $.clock.after(6000, () => update($, comando, v => v === 'reset?' ? '' : v)) })}
      </Box>
    )

    return stack(
      <Box flexDirection="column" width={e.props.bodyColumns}>
        {testa}
        {sel}
        {r2 ? (desk ? scritta(r2) : <Text dimColor>{r2}</Text>) : null}
        {/* desktop: one agent per row is in the browser page (↗); here the table and the lines below are enough, the same in every chat */}
        {(desk ? [] : d.righe).map((x, i) => {
          if (!desk) return (
            <Text key={String(i)} wrap="truncate-end" dimColor={x.stato === 'completato'}>
              <Text color={x.stato === 'fermo' ? c('high') : c(x.liv, tinta ? GRIGIO : undefined)}>{icona[x.stato] ?? '·'} {x.nome}{x.dir === '▲' || x.dir === '▼' ? ' ' + x.dir : ''}</Text>
              <Text dimColor>  {x.stato === 'fermo' ? `${tr('fermo da')} ${dur(x.ago)}  ` : ''}{x.model}  {kt(x.tok)} {tr('token')}  {x.desc}</Text>
            </Text>
          )
          const g = svgAgente(x, tinta)
          return <Box key={String(i)} overflow="hidden"><Svg source={g.source} alt={`${x.nome} ${x.stato} ${x.desc}`} width={g.width} height={24} /></Box>
        })}
        {d.interrotti > 0 && <Text size="footnote" dimColor>✗ {d.interrotti} {tr('interrotti (mai finiti, fermi da oltre 1h)')}</Text>}
        <Box width={e.props.bodyColumns} flexDirection="row" justifyContent="flex-start" alignItems="flex-start" gap={4}>
        <Box flexDirection="column" flexShrink={1} gap={0}>
          {desk ? scritta(r1) : <Text dimColor>{r1}</Text>}
          {desk ? scritta(r3) : <Text dimColor>{r3}</Text>}
          {r5 ? (desk ? scritta(r5) : <Text dimColor>{r5}</Text>) : null}
          {desk && (d.stok || d.tok) ? (() => { const g = svgBarra(d.perliv ?? {}, d.stok || d.tok, tinta); return <Svg source={g.source} alt="chi ha usato i token" width={g.width} height={46} /> })() : null}
        </Box>
        {desk ? (() => { const sMin = lav0 ? (oraJ - inizio) / 60000 : 0; const c = svgCruscotto(livAdesso(d), d.dir, tinta, Boolean((e.props as { isWorking?: boolean }).isWorking) || d.lavorano > 0, p0?.effort ?? '', sMin > 0.05 ? Math.round(car / sMin) : 0); return <Box flexShrink={0}><Svg source={c.source} alt="contachilometri: marcia e impegno" width={c.width} height={90} /></Box> })() : null}
        {desk ? (() => { const g = svgGriglia(d.perliv ?? {}, tinta, livAdesso(d)); return <Box flexShrink={0}><Svg source={g.source} alt="marce: agenti e token" width={g.width} height={114} /></Box> })() : null}
        </Box>
        {apriG ? <Box flexDirection="column"><Box flexDirection="row" gap={2}>{Object.keys(GUIDA).map(k => <Button key={'lg' + k} plain onPress={() => update($, lingua, () => k)}><Text>{k === lg ? '[' : ' '}{BANDIERA[k] ?? k.toUpperCase()}{k === lg ? ']' : ' '}</Text></Button>)}</Box>{(GUIDA[lg] ?? GUIDA.it).map((x, i) => <Box key={'g' + i}>{desk ? scritta(x, 560) : <Text dimColor>{x}</Text>}</Box>)}</Box> : null}
        {desk ? <Box flexDirection="row" justifyContent="flex-end" alignItems="center" gap={2}>{piccolo('guida', tr(apriG ? '× guida' : '? guida'), () => update($, guida, g => !g))}<Svg source={`<svg xmlns="http://www.w3.org/2000/svg" width="150" height="16" viewBox="0 0 150 16">${STILE}<text x="150" y="12" class="sm mu" text-anchor="end">Gear ${VERSIONE} · ${DATA}</text></svg>`} alt={`Gear ${VERSIONE}`} width={150} height={16} /></Box> : <Text dimColor>Gear {VERSIONE}</Text>}
      </Box>,
    )
  })
}

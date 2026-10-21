import React, { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Search, LayoutGrid, List, Mountain, Cog, Wand2, Gauge, Users, Download, ExternalLink, Loader2, Compass, KeyRound } from 'lucide-react'
import { api, LOADERS } from '../api'
import { Select, Menu, VersionChip } from '../components/ui'
import ProjectPage from './ProjectPage'

const CATEGORIES = [
  { key: null, label: 'Tous', icon: LayoutGrid },
  { key: 'adventure', label: 'Aventure', icon: Mountain },
  { key: 'technology', label: 'Technologie', icon: Cog },
  { key: 'magic', label: 'Magie', icon: Wand2 },
  { key: 'optimization', label: 'Optimisation', icon: Gauge },
  { key: 'multiplayer', label: 'Multijoueur', icon: Users }
]

const TYPES = [
  { value: 'modpack', label: 'Modpacks', placeholder: 'Rechercher un modpack…' },
  { value: 'mod', label: 'Mods', placeholder: 'Rechercher un mod…' },
  { value: 'shader', label: 'Shaders', placeholder: 'Rechercher un shader…' },
  { value: 'resourcepack', label: 'Resource packs', placeholder: 'Rechercher un resource pack…' }
]

const PLATFORMS = [
  { key: 'modrinth', label: 'Modrinth', color: '#1bd96a' },
  { key: 'curseforge', label: 'CurseForge', color: '#f16436' }
]

const formatDownloads = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : n >= 1e3 ? `${Math.round(n / 1e3)} k` : String(n))

function LoaderChips({ loaders }) {
  return loaders.slice(0, 2).map((key) => {
    const l = LOADERS.find((x) => x.key === key)
    return l ? (
      <span key={key} className="chip bg-bark-800/80">
        <img src={l.icon} className="h-4 w-4 object-contain" alt="" /> {l.label}
      </span>
    ) : null
  })
}

function ProjectCard({ hit, index, onInstall, onOpen }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.035 }}
      className="group flex flex-col overflow-hidden rounded-tl-lg border border-bark-700/80 bg-bark-850/90 transition hover:-translate-y-1 hover:border-ember-500/40"
    >
      <div className="relative h-[170px] cursor-pointer overflow-hidden bg-bark-800" onClick={() => onOpen(hit)}>
        {hit.image ? (
          <img src={hit.image} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" alt="" loading="lazy" draggable={false} />
        ) : (
          <div className="flex h-full items-center justify-center">{hit.icon && <img src={hit.icon} className="h-20 w-20 rounded-xl" alt="" />}</div>
        )}
        {hit.icon && hit.image && <img src={hit.icon} className="absolute bottom-3 left-3 h-12 w-12 rounded-lg border-2 border-white/80 bg-bark-900 shadow-lg" alt="" loading="lazy" />}
        <span className="chip absolute right-3 top-3 text-xs"><Download className="h-3.5 w-3.5" /> {formatDownloads(hit.downloads)}</span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="cursor-pointer truncate text-xl font-bold hover:underline" onClick={() => onOpen(hit)}>{hit.title}</h3>
        <p className="mt-0.5 text-xs text-cream-muted/70">par {hit.author}</p>
        <p className="mt-2 line-clamp-2 flex-1 text-sm text-cream-muted">{hit.description}</p>
        <div className="mt-3 flex items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {hit.gameVersion && <VersionChip version={hit.gameVersion} />}
            <LoaderChips loaders={hit.loaders} />
          </div>
          <button className="btn-primary shrink-0 px-4 py-2" onClick={() => onInstall(hit)}>
            <Download className="h-4 w-4" /> Installer
          </button>
          <Menu items={[{ icon: ExternalLink, label: `Voir sur ${hit.platform === 'curseforge' ? 'CurseForge' : 'Modrinth'}`, onClick: () => api.app.openExternal(hit.url) }]}>
            <button className="flex h-10 w-8 items-center justify-center rounded-lg bg-bark-800 text-cream/80 hover:bg-bark-700">⋮</button>
          </Menu>
        </div>
      </div>
    </motion.div>
  )
}

// Affichage liste : une ligne compacte par projet
function ProjectRow({ hit, onInstall, onOpen }) {
  return (
    <div className="group flex items-center gap-4 rounded-tl-lg border border-bark-700/80 bg-bark-850/90 p-3 transition hover:border-ember-500/40">
      <button onClick={() => onOpen(hit)} className="shrink-0">
        {hit.icon ? <img src={hit.icon} className="h-16 w-16 rounded-xl bg-bark-800" alt="" loading="lazy" /> : <div className="h-16 w-16 rounded-xl bg-bark-800" />}
      </button>
      <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onOpen(hit)}>
        <div className="flex items-baseline gap-2">
          <h3 className="truncate text-lg font-bold group-hover:underline">{hit.title}</h3>
          <span className="shrink-0 text-xs text-cream-muted/70">par {hit.author}</span>
        </div>
        <p className="truncate text-sm text-cream-muted">{hit.description}</p>
      </div>
      <div className="hidden shrink-0 gap-1.5 lg:flex">
        {hit.gameVersion && <VersionChip version={hit.gameVersion} />}
        <LoaderChips loaders={hit.loaders} />
      </div>
      <span className="w-20 shrink-0 text-right text-sm text-cream-muted"><Download className="mr-1 inline h-3.5 w-3.5" />{formatDownloads(hit.downloads)}</span>
      <button className="btn-primary shrink-0 px-4 py-2" onClick={() => onInstall(hit)}><Download className="h-4 w-4" /> Installer</button>
    </div>
  )
}

const storedView = () => { try { return localStorage.getItem('terra.discoverView') || 'grid' } catch { return 'grid' } }

export default function Discover({ onInstall, onOpenSettings, devMode, initialType }) {
  const [platform, setPlatform] = useState('modrinth')
  const [type, setType] = useState(initialType || 'modpack')
  const [category, setCategory] = useState(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState({ hits: [], total: 0 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const reqId = useRef(0)
  const [view, setViewState] = useState(storedView)
  const [opened, setOpened] = useState(null)
  const setView = (v) => { setViewState(v); try { localStorage.setItem('terra.discoverView', v) } catch {} }

  // Recherche (avec un petit délai pendant la frappe)
  useEffect(() => {
    const id = ++reqId.current
    setLoading(true)
    setError(null)
    const t = setTimeout(async () => {
      try {
        const res = await api.content.search({ platform, type, category, query })
        if (id === reqId.current) setResults(res)
      } catch (e) {
        if (id === reqId.current) { setError(e.message); setResults({ hits: [], total: 0 }) }
      } finally {
        if (id === reqId.current) setLoading(false)
      }
    }, query ? 350 : 0)
    return () => clearTimeout(t)
  }, [platform, type, category, query])

  const loadMore = async () => {
    setLoading(true)
    try {
      const res = await api.content.search({ platform, type, category, query, offset: results.hits.length })
      setResults((r) => ({ total: res.total, hits: [...r.hits, ...res.hits] }))
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  const needsKey = devMode && error && /clé d’API/.test(error)

  // La liste reste montée (cachée) pendant la consultation d'un projet : recherche et position conservées
  const scrollPos = useRef(0)
  const main = () => document.querySelector('main')
  const openProject = (hit) => { scrollPos.current = main()?.scrollTop || 0; setOpened(hit); main()?.scrollTo(0, 0) }
  const closeProject = () => { setOpened(null); requestAnimationFrame(() => main()?.scrollTo(0, scrollPos.current)) }

  return (
    <>
    {opened && <ProjectPage hit={opened} onBack={closeProject} onInstall={onInstall} />}
    <div className={opened ? 'hidden' : 'space-y-6'}>
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-ember-500 shadow-[0_6px_20px_-6px_rgba(228,107,26,0.8)]">
          <Compass className="h-8 w-8 text-white" />
        </div>
        <div className="flex-1">
          <h1 className="text-[38px] font-extrabold leading-tight tracking-tight">Découvrez votre prochaine aventure</h1>
          <p className="text-[15px] text-cream-muted">Explorez des modpacks, mods et shaders, puis installez-les en un clic.</p>
        </div>
        <div className="flex rounded-tl border border-bark-700 bg-bark-950/60 p-1">
          {PLATFORMS.map((p) => (
            <button key={p.key} onClick={() => setPlatform(p.key)} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${platform === p.key ? 'bg-bark-800 text-cream' : 'text-cream-muted hover:text-cream'}`}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} /> {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2.5">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-cream-muted" />
          <input className="input h-12 pl-12" placeholder={TYPES.find((t) => t.value === type).placeholder} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {CATEGORIES.map((c) => (
          <button key={c.label} onClick={() => setCategory(c.key)} className={`flex h-12 items-center gap-2 rounded-tl border px-3.5 text-[15px] transition ${category === c.key ? 'border-ember-500 bg-ember-500/10 text-cream' : 'border-bark-700 bg-bark-850/80 text-cream/80 hover:border-bark-600'}`}>
            <c.icon className={`h-[18px] w-[18px] ${category === c.key ? 'text-ember-400' : ''}`} /> {c.label}
          </button>
        ))}
        <div className="flex rounded-tl border border-bark-700 bg-bark-950/70 p-1">
          {[['grid', LayoutGrid], ['list', List]].map(([k, Icon]) => (
            <button key={k} title={k === 'grid' ? 'Grille' : 'Liste'} onClick={() => setView(k)} className={`flex w-11 items-center justify-center rounded-lg transition ${view === k ? 'bg-ember-500/20 text-ember-400 ring-1 ring-ember-500/60' : 'text-cream-muted hover:text-cream'}`}>
              <Icon className="h-5 w-5" />
            </button>
          ))}
        </div>
        <Select className="h-12 w-[175px]" value={type} onChange={(v) => { setType(v); setCategory(null) }} options={TYPES} />
      </div>

      {error && (
        <div className="panel flex items-center gap-4 p-5">
          {needsKey && <KeyRound className="h-8 w-8 text-ember-400" />}
          <p className="flex-1 text-cream-muted">{error}</p>
          {needsKey && <button className="btn-primary" onClick={onOpenSettings}>Ouvrir les paramètres</button>}
        </div>
      )}

      {view === 'grid' ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {results.hits.map((hit, i) => <ProjectCard key={`${hit.platform}-${hit.id}`} hit={hit} index={i} onInstall={onInstall} onOpen={openProject} />)}
        </div>
      ) : (
        <div className="space-y-2.5">
          {results.hits.map((hit) => <ProjectRow key={`${hit.platform}-${hit.id}`} hit={hit} onInstall={onInstall} onOpen={openProject} />)}
        </div>
      )}

      {loading && <div className="flex justify-center py-8"><Loader2 className="h-7 w-7 animate-spin text-ember-400" /></div>}
      {!loading && !error && results.hits.length === 0 && <p className="py-12 text-center text-cream-muted">Aucun résultat.</p>}
      {!loading && results.hits.length > 0 && results.hits.length < results.total && (
        <div className="flex justify-center pb-4">
          <button className="btn-ghost px-8" onClick={loadMore}>Afficher plus</button>
        </div>
      )}
    </div>
    </>
  )
}

import React, { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { ArrowLeft, Download, ExternalLink, Heart, Calendar, Scale, FileText, Images, ListTree, Loader2, X, Github, Bug, BookOpen, MessageCircle } from 'lucide-react'
import { api, LOADERS } from '../api'
import { VersionChip } from '../components/ui'

const TABS = [
  { key: 'description', label: 'Description', icon: FileText },
  { key: 'gallery', label: 'Galerie', icon: Images },
  { key: 'versions', label: 'Versions', icon: ListTree }
]
const PLATFORM_LABEL = { modrinth: 'Modrinth', curseforge: 'CurseForge' }
const CHANNEL = { release: { label: 'Stable', cls: 'bg-[#1f5a2a] text-[#9be3a8]' }, beta: { label: 'Bêta', cls: 'bg-[#5a4a1f] text-[#e3d29b]' }, alpha: { label: 'Alpha', cls: 'bg-[#5a1f1f] text-[#e39b9b]' } }

const fmtNum = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : n >= 1e3 ? `${Math.round(n / 1e3)} k` : String(n ?? 0))
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '')

// Description distante : convertie puis nettoyée (aucun script, iframe ou formulaire)
function Description({ detail }) {
  const html = useMemo(() => {
    const raw = detail.bodyFormat === 'markdown' ? marked.parse(detail.body || '', { async: false }) : detail.body || ''
    return DOMPurify.sanitize(raw, { FORBID_TAGS: ['style', 'iframe', 'form', 'input', 'button'], FORBID_ATTR: ['style', 'onerror', 'onload'] })
  }, [detail])

  // Les liens s'ouvrent dans le navigateur, jamais dans le launcher
  const onClick = (e) => {
    const a = e.target.closest('a')
    if (!a) return
    e.preventDefault()
    if (/^https:\/\//.test(a.href)) api.app.openExternal(a.href)
  }

  return <div className="prose-terra panel select-text p-7" onClick={onClick} dangerouslySetInnerHTML={{ __html: html || '<p>Aucune description.</p>' }} />
}

function Gallery({ detail, onOpen }) {
  if (!detail.gallery.length) return <div className="panel px-6 py-12 text-center text-cream-muted">Aucune image.</div>
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {detail.gallery.map((g, i) => (
        <button key={g.url} onClick={() => onOpen(i)} className="group overflow-hidden rounded-tl-lg border border-bark-700 bg-bark-850 text-left">
          <img src={g.url} className="aspect-video w-full object-cover transition duration-500 group-hover:scale-105" alt="" loading="lazy" />
          {g.title && <div className="truncate px-4 py-2.5 text-sm font-semibold">{g.title}</div>}
        </button>
      ))}
    </div>
  )
}

function Versions({ hit }) {
  const [versions, setVersions] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => { api.content.versions(hit.platform, hit.id).then(setVersions).catch((e) => setError(e.message)) }, [hit])
  if (error) return <div className="panel p-5 text-cream-muted">{error}</div>
  if (!versions) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-ember-400" /></div>
  return (
    <div className="space-y-2">
      {versions.slice(0, 60).map((v) => {
        const ch = CHANNEL[v.channel] || CHANNEL.release
        return (
          <div key={v.id} className="flex items-center gap-4 rounded-tl border border-bark-700 bg-bark-850/85 px-4 py-3">
            <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold uppercase ${ch.cls}`}>{ch.label}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{v.name}</div>
              <div className="truncate text-xs text-cream-muted">Minecraft {v.gameVersions.slice(0, 4).join(', ')}{v.gameVersions.length > 4 ? '…' : ''}</div>
            </div>
            <div className="flex gap-1">
              {v.loaders.map((key) => {
                const l = LOADERS.find((x) => x.key === key)
                return l ? <img key={key} src={l.icon} title={l.label} className="h-5 w-5 object-contain" alt={l.label} /> : null
              })}
            </div>
            <span className="w-24 text-right text-xs text-cream-muted">{fmtDate(v.date)}</span>
            {v.downloads != null && <span className="w-16 text-right text-xs text-cream-muted">{fmtNum(v.downloads)}</span>}
          </div>
        )
      })}
    </div>
  )
}

export default function ProjectPage({ hit, onBack, onInstall }) {
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('description')
  const [lightbox, setLightbox] = useState(null)

  useEffect(() => {
    setDetail(null)
    setError(null)
    setTab('description')
    api.content.details(hit.platform, hit.id).then(setDetail).catch((e) => setError(e.message))
  }, [hit])

  const d = detail || hit
  const links = detail?.links || {}
  const linkButtons = [
    { key: 'source', label: 'Code source', icon: Github },
    { key: 'issues', label: 'Signaler un bug', icon: Bug },
    { key: 'wiki', label: 'Wiki', icon: BookOpen },
    { key: 'discord', label: 'Discord', icon: MessageCircle }
  ].filter((l) => links[l.key])

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-2 text-[16px] font-medium hover:text-ember-400"><ArrowLeft className="h-5 w-5" /> Retour à Découvrir</button>

      <div className="relative overflow-hidden rounded-tl-lg border border-bark-700/80">
        {d.image && <img src={d.image} className="absolute inset-0 h-full w-full scale-110 object-cover opacity-35 blur-md" alt="" />}
        <div className="absolute inset-0 bg-gradient-to-r from-bark-900 via-bark-900/85 to-bark-900/40" />
        <div className="relative flex items-center gap-6 p-7">
          {d.icon ? <img src={d.icon} className="h-28 w-28 shrink-0 rounded-2xl border-2 border-white/20 bg-bark-800 shadow-xl" alt="" /> : <div className="h-28 w-28 shrink-0 rounded-2xl bg-bark-800" />}
          <div className="min-w-0 flex-1 space-y-2">
            <h1 className="truncate text-4xl font-extrabold">{d.title}</h1>
            <p className="text-cream-muted">par <span className="font-semibold text-cream">{d.author}</span> · sur {PLATFORM_LABEL[d.platform]}</p>
            <p className="max-w-3xl text-[15px] text-cream/85">{d.description}</p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {d.gameVersion && <VersionChip version={d.gameVersion} />}
              {(d.loaders || []).map((key) => {
                const l = LOADERS.find((x) => x.key === key)
                return l ? <span key={key} className="chip bg-bark-800/80"><img src={l.icon} className="h-4 w-4 object-contain" alt="" /> {l.label}</span> : null
              })}
              <span className="chip bg-bark-800/80"><Download className="h-4 w-4" /> {fmtNum(d.downloads)}</span>
              {detail?.followers != null && <span className="chip bg-bark-800/80"><Heart className="h-4 w-4" /> {fmtNum(detail.followers)}</span>}
              {detail?.updated && <span className="chip bg-bark-800/80"><Calendar className="h-4 w-4" /> {fmtDate(detail.updated)}</span>}
              {detail?.license && <span className="chip bg-bark-800/80"><Scale className="h-4 w-4" /> {detail.license}</span>}
            </div>
          </div>
          <div className="flex w-56 shrink-0 flex-col gap-2.5">
            <button className="btn-primary py-3.5 text-base" onClick={() => onInstall(d)}><Download className="h-5 w-5" /> Installer</button>
            <button className="btn-ghost" onClick={() => api.app.openExternal(d.url)}><ExternalLink className="h-4 w-4" /> Voir sur {PLATFORM_LABEL[d.platform]}</button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-bark-700">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`relative flex items-center gap-2.5 px-5 py-3.5 text-[16px] transition ${tab === t.key ? 'text-ember-400' : 'text-cream/80 hover:text-cream'}`}>
            <t.icon className="h-5 w-5" /> {t.label}{t.key === 'gallery' && detail ? ` (${detail.gallery.length})` : ''}
            {tab === t.key && <motion.span layoutId="project-tab" className="absolute inset-x-2 bottom-0 h-[3px] rounded-full bg-ember-500" />}
          </button>
        ))}
        <div className="ml-auto flex gap-1">
          {linkButtons.map((l) => (
            <button key={l.key} title={l.label} onClick={() => api.app.openExternal(links[l.key])} className="rounded-lg p-2 text-cream-muted hover:bg-bark-800 hover:text-cream"><l.icon className="h-5 w-5" /></button>
          ))}
        </div>
      </div>

      {error && <div className="panel p-5 text-cream-muted">{error}</div>}
      {!detail && !error && tab !== 'versions' && <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-ember-400" /></div>}
      {detail && tab === 'description' && <Description detail={detail} />}
      {detail && tab === 'gallery' && <Gallery detail={detail} onOpen={setLightbox} />}
      {tab === 'versions' && <Versions hit={hit} />}

      {lightbox != null && detail && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/85 p-10" onClick={() => setLightbox(null)}>
          <img src={detail.gallery[lightbox].url} className="max-h-[85%] max-w-full rounded-tl shadow-2xl" alt="" />
          {detail.gallery[lightbox].title && <p className="text-lg font-semibold">{detail.gallery[lightbox].title}</p>}
          <button className="absolute right-6 top-6 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"><X className="h-6 w-6" /></button>
        </div>
      )}
    </div>
  )
}

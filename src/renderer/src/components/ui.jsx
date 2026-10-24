import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Check, ChevronDown, Pencil } from 'lucide-react'
import { IconBrandMinecraft } from '@tabler/icons-react'
import { LOADERS } from '../api'

// Nom modifiable sur place : le crayon ouvre un champ ; Entrée ou clic ailleurs enregistre, Échap annule.
// onOpen : clic sur le nom (ouvrir la fiche), facultatif.
export function EditableName({ name, onSave, onOpen, as: Tag = 'h2', className = '', wrapperClassName = '', icon = 'h-4 w-4' }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)
  useEffect(() => { if (!editing) setValue(name) }, [name, editing])
  const commit = () => {
    setEditing(false)
    const v = value.trim()
    if (v && v !== name) onSave(v)
  }
  if (editing) {
    return (
      <div className={wrapperClassName}>
        <input
          autoFocus
          value={value}
          maxLength={40}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setValue(name); setEditing(false) } }}
          onBlur={commit}
          onClick={(e) => e.stopPropagation()}
          className={`w-full min-w-0 rounded-lg border border-ember-500/70 bg-black/45 px-2 outline-none ${className}`}
        />
      </div>
    )
  }
  return (
    <div className={`flex min-w-0 items-center gap-1.5 ${wrapperClassName}`}>
      <Tag className={`min-w-0 truncate ${onOpen ? 'cursor-pointer hover:underline' : ''} ${className}`} onClick={onOpen}>{name}</Tag>
      <button
        type="button"
        title="Renommer"
        onClick={(e) => { e.stopPropagation(); setEditing(true) }}
        className="shrink-0 rounded-lg bg-black/30 p-1.5 text-white/80 backdrop-blur-sm transition hover:bg-black/55 hover:text-white"
      >
        <Pencil className={icon} />
      </button>
    </div>
  )
}

// Liste déroulante aux couleurs du launcher, qui s'ouvre vers le bas.
// options : [{ value, label, hint? }]
export function Select({ value, onChange, options, icon: Icon, placeholder = 'Choisir…', className = '' }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const ref = useRef(null)
  const listRef = useRef(null)
  const current = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false)
    window.addEventListener('mousedown', close)
    const i = options.findIndex((o) => o.value === value)
    setActive(i)
    requestAnimationFrame(() => listRef.current?.children[i]?.scrollIntoView({ block: 'center' }))
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const choose = (o) => { onChange(o.value); setOpen(false) }
  const onKey = (e) => {
    if (e.key === 'Escape') return setOpen(false)
    if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
      e.preventDefault()
      if (!open) return setOpen(true)
      const next = Math.max(0, Math.min(options.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1)))
      setActive(next)
      listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' })
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (open && options[active]) choose(options[active])
      else setOpen(true)
    }
  }

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} onKeyDown={onKey} className={`input flex h-full items-center gap-3 text-left ${open ? 'border-ember-500/80 ring-2 ring-ember-500/20' : ''}`}>
        {Icon && <Icon className="h-5 w-5 shrink-0 text-cream-muted" />}
        <span className={`flex-1 truncate ${current ? '' : 'text-cream-muted/60'}`}>{current?.label || placeholder}</span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-cream-muted transition ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={listRef}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.12 }}
            className="no-drag absolute left-0 right-0 top-full z-50 mt-2 max-h-72 overflow-y-auto rounded-tl border border-bark-700 bg-bark-850 p-1.5 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.8)]"
          >
            {options.map((o, i) => (
              <button
                key={o.value}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[15px] ${i === active ? 'bg-bark-700/70' : ''} ${o.value === value ? 'text-ember-400' : 'text-cream/90'}`}
              >
                <span className="flex-1 truncate">{o.label}</span>
                {o.hint && <span className="rounded-md bg-bark-800 px-2 py-0.5 text-[11px] uppercase tracking-wide text-cream-muted">{o.hint}</span>}
                {o.value === value && <Check className="h-4 w-4" />}
              </button>
            ))}
            {options.length === 0 && <div className="px-3 py-2 text-sm text-cream-muted">Chargement…</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function Modal({ open, onClose, title, icon: Icon, children, footer, width = 'max-w-xl' }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="no-drag fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
          <motion.div
            className={`panel flex max-h-full w-full ${width} flex-col overflow-hidden bg-bark-900 shadow-2xl`}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-bark-700/70 px-6 py-4">
              {Icon && <Icon className="h-5 w-5 text-ember-400" />}
              <h2 className="flex-1 text-lg font-bold">{title}</h2>
              <button onClick={onClose} className="rounded-lg p-1.5 text-orange-50/50 hover:bg-bark-800 hover:text-orange-50">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {footer && <div className="flex justify-end gap-3 border-t border-bark-700/70 bg-bark-950/40 px-6 py-4">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-semibold text-orange-50/80">{label}</span>
        {hint && <span className="text-xs text-orange-50/40">{hint}</span>}
      </div>
      {children}
    </label>
  )
}

export function Checkbox({ checked, onChange, label, detail, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${checked ? 'border-ember-500/50 bg-ember-500/10' : 'border-bark-700 bg-bark-950/40 hover:border-bark-600'} disabled:opacity-40`}
    >
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${checked ? 'border-ember-500 bg-ember-500' : 'border-bark-600'}`}>
        {checked && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
      </span>
      <span className="flex-1 text-sm font-medium">{label}</span>
      {detail && <span className="text-xs text-orange-50/45">{detail}</span>}
    </button>
  )
}

// Menu contextuel : s'ouvre sous le bouton, ou au-dessus s'il n'y a pas la place.
// Affiché par-dessus la page pour ne pas être coupé par une carte ou une bannière.
export function Menu({ items, children }) {
  const [pos, setPos] = useState(null)
  const ref = useRef(null)
  const menuRef = useRef(null)
  const list = items.filter(Boolean)
  const open = !!pos

  useEffect(() => {
    if (!open) return
    const close = (e) => !ref.current?.contains(e.target) && !menuRef.current?.contains(e.target) && setPos(null)
    const hide = () => setPos(null)
    window.addEventListener('mousedown', close)
    window.addEventListener('resize', hide)
    window.addEventListener('scroll', hide, true)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('resize', hide)
      window.removeEventListener('scroll', hide, true)
    }
  }, [open])

  const toggle = (e) => {
    e.stopPropagation()
    if (open) return setPos(null)
    const height = list.filter((it) => it !== '-').length * 36 + list.filter((it) => it === '-').length * 9 + 14
    const r = ref.current.getBoundingClientRect()
    const below = window.innerHeight - r.bottom
    const up = below < height + 16 && r.top > below
    setPos({ up, right: window.innerWidth - r.right, top: r.bottom + 8, bottom: window.innerHeight - r.top + 8 })
  }
  const dy = pos?.up ? 6 : -6

  return (
    <div className="relative" ref={ref}>
      <div onClick={toggle}>{children}</div>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={menuRef}
              className="no-drag fixed z-[60] min-w-[250px] overflow-hidden rounded-xl border border-bark-700 bg-bark-850 p-1.5 shadow-2xl"
              style={pos.up ? { right: pos.right, bottom: pos.bottom } : { right: pos.right, top: pos.top }}
              initial={{ opacity: 0, y: dy, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: dy, scale: 0.97 }}
              transition={{ duration: 0.12 }}
            >
              {list.map((it, i) =>
                it === '-' ? (
                  <div key={i} className="my-1 h-px bg-bark-700" />
                ) : (
                  <button
                    key={i}
                    onClick={(e) => { e.stopPropagation(); setPos(null); it.onClick() }}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${it.danger ? 'text-red-400 hover:bg-red-500/10' : 'text-orange-50/85 hover:bg-bark-700/70'}`}
                  >
                    {it.icon && <it.icon className="h-4 w-4 opacity-80" />}
                    {it.label}
                  </button>
                )
              )}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  )
}

export function VersionChip({ version }) {
  return (
    <span className="chip">
      <MinecraftIcon /> Minecraft Java {version}
    </span>
  )
}

export function LoaderChip({ loader }) {
  const l = LOADERS.find((x) => x.key === loader) || LOADERS[0]
  return (
    <span className="chip">
      <img src={l.icon} className="h-4 w-4 object-contain" alt="" draggable={false} /> {l.label}
    </span>
  )
}

export function ProfileChip({ profile }) {
  if (!profile) return null
  return (
    <span className="chip">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: profile.color }} /> {profile.name}
    </span>
  )
}

// Icône Minecraft de Tabler Icons (tabler.io/icons, brand-minecraft)
export function MinecraftIcon({ className = 'h-4 w-4' }) {
  return <IconBrandMinecraft className={`shrink-0 text-[#5dbb46] ${className}`} stroke={2} aria-hidden />
}

export function ProfileAvatar({ profile, size = 'h-12 w-12 text-xl' }) {
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-xl font-black text-white shadow-inner ${size}`} style={{ background: `linear-gradient(145deg, ${profile.color}, ${profile.color}99)` }}>
      {profile.name.trim().charAt(0).toUpperCase() || '?'}
    </div>
  )
}

// Tête du joueur découpée dans son vrai skin (visage + calque du chapeau), sans passer par un cache externe.
// size : de préférence un multiple de 8, pour des pixels nets.
export function SkinHead({ account, size, className = '' }) {
  if (!account.skin) return <img src={`https://mc-heads.net/avatar/${account.uuid}/${size * 2}`} className={`pixel ${className}`} style={{ width: size, height: size }} alt="" />
  const layer = (x) => ({
    position: 'absolute', inset: 0, imageRendering: 'pixelated',
    backgroundImage: `url(${account.skin})`, backgroundSize: `${size * 8}px auto`, backgroundPosition: `-${size * x}px -${size}px`
  })
  return (
    <div className={`relative shrink-0 overflow-hidden ${className}`} style={{ width: size, height: size }}>
      <div style={layer(1)} />
      <div style={layer(5)} />
    </div>
  )
}

// 3 h 25 min, 12 min, moins d'une minute
export function formatPlayTime(ms) {
  const min = Math.floor((ms || 0) / 60000)
  if (min < 1) return 'moins d’une minute'
  const h = Math.floor(min / 60)
  return h ? `${h} h ${String(min % 60).padStart(2, '0')}` : `${min} min`
}

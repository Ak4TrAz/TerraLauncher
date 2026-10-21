import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { LayoutGrid, Compass, UserRound, Settings as SettingsIcon, ChevronDown, Minus, Square, X, Check, Info, LogIn, Users } from 'lucide-react'
import { api } from './api'
import Leaves from './components/Leaves'
import Library from './pages/Library'
import Profiles from './pages/Profiles'
import Discover from './pages/Discover'
import Accounts from './pages/Accounts'
import Settings from './pages/Settings'
import InstanceDetail from './pages/InstanceDetail'
import { instanceMenu } from './pages/Library'
import CreateInstance from './pages/CreateInstance'
import ImportModal from './components/ImportModal'
import InstallModal from './components/InstallModal'
import DownloadsButton from './components/DownloadsButton'
import { Fox } from './components/Sprites'
import ProfileModal from './components/ProfileModal'
import ReapplyModal from './components/ReapplyModal'
import ConfirmModal from './components/ConfirmModal'
import CrashModal from './components/CrashModal'

const TABS = [
  { key: 'library', label: 'Bibliothèque', icon: LayoutGrid },
  { key: 'profiles', label: 'Profils', icon: UserRound },
  { key: 'discover', label: 'Découvrir', icon: Compass }
]

function WindowControls() {
  const btn = 'no-drag flex h-9 w-12 items-center justify-center text-cream/70 transition hover:bg-white/10 hover:text-white'
  return (
    <div className="drag flex h-9 justify-end">
      <button className={btn} onClick={() => api.window.minimize()}><Minus className="h-4 w-4" /></button>
      <button className={btn} onClick={() => api.window.maximize()}><Square className="h-3.5 w-3.5" /></button>
      <button className={`${btn} hover:bg-red-600`} onClick={() => api.window.close()}><X className="h-4 w-4" /></button>
    </div>
  )
}

// Compte actif + menu pour changer de compte
function AccountChip({ accounts, onSwitch, onManage }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const active = accounts.find((a) => a.active)

  useEffect(() => {
    if (!open) return
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  if (!active) {
    return (
      <button onClick={onManage} className="no-drag btn-ghost px-4 py-2">
        <LogIn className="h-4 w-4" /> Se connecter
      </button>
    )
  }

  return (
    <div className="no-drag relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition hover:bg-white/5">
        <img src={`https://mc-heads.net/avatar/${active.uuid}/64`} className="pixel h-10 w-10 rounded-full border-2 border-bark-600 bg-bark-800" alt="" />
        <span className="max-w-[140px] truncate text-[17px] font-medium">{active.name}</span>
        <ChevronDown className={`h-4 w-4 text-cream-muted transition ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.12 }} className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-tl-lg border border-bark-700 bg-bark-850 p-1.5 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.85)]">
            {accounts.map((a) => (
              <button key={a.uuid} onClick={() => { onSwitch(a.uuid); setOpen(false) }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-bark-700/70">
                <img src={`https://mc-heads.net/avatar/${a.uuid}/32`} className="pixel h-7 w-7 rounded-md" alt="" />
                <span className="flex-1 font-medium">{a.name}</span>
                {a.active && <Check className="h-4 w-4 text-ember-400" />}
              </button>
            ))}
            <div className="my-1 h-px bg-bark-700" />
            <button onClick={() => { onManage(); setOpen(false) }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-cream/85 hover:bg-bark-700/70">
              <Users className="h-4 w-4" /> Gérer les comptes
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Header({ tab, setTab, accounts, onSwitchAccount }) {
  return (
    <header className="drag relative z-30 flex h-[76px] items-center gap-5 border-b border-bark-700/70 px-6 xl:gap-10 xl:px-8">
      <div className="flex items-center gap-3">
        <Fox className="h-12 w-[52px] drop-shadow-[0_4px_10px_rgba(228,107,26,0.35)]" />
        <span className="whitespace-nowrap text-2xl font-bold tracking-tight xl:text-[30px]">
          Terra<span className="text-ember-500">Launcher</span>
        </span>
      </div>
      <nav className="no-drag flex h-full items-center gap-2">
        {TABS.map((t) => {
          const active = tab === t.key || ((tab === 'create' || tab === 'instance') && t.key === 'library')
          return (
            <button key={t.key} onClick={() => setTab(t.key)} className={`relative flex h-full items-center gap-2 whitespace-nowrap px-3 text-[16px] font-medium transition xl:gap-2.5 xl:px-4 xl:text-[17px] ${active ? 'text-ember-400' : 'text-cream/80 hover:text-cream'}`}>
              <t.icon className="h-5 w-5" />
              {t.label}
              {active && <motion.span layoutId="tab-underline" className="absolute inset-x-2 bottom-0 h-[3px] rounded-full bg-ember-500" />}
            </button>
          )
        })}
      </nav>
      <div className="ml-auto flex items-center gap-3">
        <DownloadsButton />
        <AccountChip accounts={accounts} onSwitch={onSwitchAccount} onManage={() => setTab('accounts')} />
        <div className="h-8 w-px bg-bark-700" />
        <button onClick={() => setTab('settings')} className={`no-drag rounded-xl p-2 transition ${tab === 'settings' ? 'bg-ember-500 text-white' : 'text-cream/70 hover:bg-white/5 hover:text-cream'}`}>
          <SettingsIcon className="h-6 w-6" />
        </button>
      </div>
    </header>
  )
}

export default function App() {
  const [tab, setTab] = useState('library')
  const [settingsTab, setSettingsTab] = useState('general')
  const [settings, setSettings] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [instances, setInstances] = useState([])
  const [profiles, setProfiles] = useState([])
  const [itemDefs, setItemDefs] = useState([])
  const [importing, setImporting] = useState(null)
  const [installing, setInstalling] = useState(null)
  const [profileModal, setProfileModal] = useState(null) // { profile } | null
  const [reapplying, setReapplying] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [toasts, setToasts] = useState([])
  const [gameStatus, setGameStatus] = useState({}) // instanceId -> { state, ... }
  const [crash, setCrash] = useState(null)
  const [detailId, setDetailId] = useState(null)
  const [update, setUpdate] = useState(null) // { state: downloading|ready, version }
  const [discover, setDiscover] = useState({ type: null, target: null })

  const toast = useCallback((text, kind = 'info') => {
    const id = Math.random()
    setToasts((t) => [...t, { id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3800)
  }, [])

  const refresh = useCallback(async () => {
    const [i, p] = await Promise.all([api.instances.list(), api.profiles.list()])
    setInstances(i)
    setProfiles(p)
  }, [])

  useEffect(() => {
    api.items().then(setItemDefs)
    api.accounts.list().then(setAccounts)
    api.settings.get().then((s) => {
      setSettings(s)
      if (s.startPage) setTab(s.startPage)
    })
    refresh()
    const offStatus = api.game.onStatus((status) => {
      setGameStatus((s) => ({ ...s, [status.instanceId]: status.state === 'stopped' || status.state === 'crashed' ? undefined : status }))
      if (status.state === 'crashed') setCrash(status)
    })
    const offInstances = api.onInstancesChanged(refresh)
    const offUpdate = api.app.onUpdate(setUpdate)
    return () => { offStatus(); offInstances(); offUpdate() }
  }, [refresh])

  const openSettings = (sub = 'general') => { setSettingsTab(sub); setTab('settings') }

  // Exécute une action, rafraîchit et affiche les erreurs en toast.
  const run = (fn, success) => async (...args) => {
    try {
      const res = await fn(...args)
      await refresh()
      const msg = typeof success === 'function' ? success(res, ...args) : success
      if (msg) toast(msg, 'success')
      return res
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const instanceActions = {
    create: () => setTab('create'),
    statusOf: (id) => gameStatus[id],
    open: (inst) => { setDetailId(inst.id); setTab('instance') },
    join: (inst) => instanceActions.play(inst, { join: true }),
    update: run((inst, changes) => api.instances.update(inst.id, changes), (_r, _i, _c, msg) => msg),
    duplicate: run((inst) => api.instances.duplicate(inst.id), (copy) => `Instance « ${copy.name} » créée.`),
    exportZip: run((inst) => api.instances.exportZip(inst.id), (file) => (file ? 'Instance exportée.' : 'Export annulé.')),
    play: async (inst, opts) => {
      if (!accounts.some((a) => a.active)) {
        toast('Connecte d’abord ton compte Microsoft pour jouer.')
        return setTab('accounts')
      }
      try {
        await api.game.launch(inst.id, opts)
      } catch (err) {
        setGameStatus((s) => ({ ...s, [inst.id]: undefined }))
        toast(err.message, 'error')
      }
    },
    stop: (inst) => api.game.stop(inst.id),
    repair: run((inst) => api.game.repair(inst.id), (_r, inst) => `« ${inst.name} » a été vérifiée et réparée.`),
    openFolder: run((inst) => api.instances.openFolder(inst.id)),
    changeBanner: run((inst) => api.instances.pickBanner(inst.id)),
    reapply: (inst) => (profiles.length ? setReapplying(inst) : toast("Crée d'abord un profil dans l'onglet Profils.")),
    saveToProfile: run((inst) => api.instances.saveToProfile(inst.id), 'Touches et réglages enregistrés dans le profil.'),
    remove: (inst) =>
      setConfirm({
        title: 'Supprimer l’instance',
        message: `« ${inst.name} » et tout son dossier (mondes, mods, captures) seront supprimés. Les shaders et packs partagés du profil ne sont pas touchés.`,
        action: 'Supprimer',
        onConfirm: run(() => api.instances.remove(inst.id), 'Instance supprimée.')
      })
  }

  const profileActions = {
    create: () => setProfileModal({ profile: null }),
    edit: (profile) => setProfileModal({ profile }),
    openFolder: run((p) => api.profiles.openFolder(p.id)),
    importFrom: (profile) => setImporting(profile),
    remove: (profile) =>
      setConfirm({
        title: 'Supprimer le profil',
        message: `Le profil « ${profile.name} » sera supprimé. Les instances qui l'utilisent gardent une copie de leurs shaders et resource packs.`,
        action: 'Supprimer',
        onConfirm: run(() => api.profiles.remove(profile.id), 'Profil supprimé.')
      })
  }

  const createInstance = run(async (data) => {
    const inst = await api.instances.create(data)
    setTab('library')
    return inst
  }, (inst) => `Instance « ${inst.name} » créée${inst.profileId ? ' avec ton profil' : ''}.`)
  const importDone = async (count, source) => {
    await refresh()
    toast(`${count} élément${count > 1 ? 's' : ''} importé${count > 1 ? 's' : ''} depuis « ${source.name} ».`, 'success')
  }
  const saveProfile = run(
    (data) => (profileModal?.profile ? api.profiles.update(profileModal.profile.id, data) : api.profiles.create(data)),
    (p) => `Profil « ${p.name} » enregistré.`
  )
  const reapply = run((id, profileId, items) => api.instances.reapplyProfile(id, profileId, items), 'Profil appliqué.')

  return (
    <div className="relative flex h-full flex-col bg-[radial-gradient(ellipse_at_top,_#2b2019_0%,_#1c1612_55%)]">
      {settings?.animations !== false && <Leaves />}
      <WindowControls />
      {update?.state === 'ready' && (
        <div className="relative z-40 flex items-center justify-center gap-4 bg-ember-500 px-4 py-2 text-sm font-semibold text-white">
          La version {update.version} de TerraLauncher est prête.
          <button className="rounded-lg bg-white/20 px-3 py-1 hover:bg-white/30" onClick={() => api.app.installUpdate()}>Redémarrer pour mettre à jour</button>
        </div>
      )}
      <Header tab={tab} setTab={(k) => { if (k === 'discover') setDiscover({ type: null, target: null }); setTab(k) }} accounts={accounts} onSwitchAccount={async (uuid) => setAccounts(await api.accounts.setActive(uuid))} />

      <main className="relative z-10 flex-1 overflow-y-auto px-6 py-6 xl:px-8 xl:py-7">
        {/* Changement de page immédiat : seul l’affichage est animé (pas d’attente de fin d’animation) */}
        <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} className="mx-auto max-w-[1440px]">
            {tab === 'library' && <Library instances={instances} profiles={profiles} actions={instanceActions} />}
            {tab === 'create' && (
              <CreateInstance profiles={profiles} itemDefs={itemDefs} onCancel={() => setTab('library')} onCreate={createInstance} onCreateProfile={() => { setTab('profiles'); setProfileModal({ profile: null }) }} />
            )}
            {tab === 'profiles' && <Profiles profiles={profiles} instances={instances} actions={profileActions} />}
            {tab === 'discover' && <Discover key={discover.type || 'all'} initialType={discover.type} onInstall={setInstalling} devMode={settings?.devMode} onOpenSettings={() => openSettings('connections')} />}
            {tab === 'instance' && (
              <InstanceDetail
                inst={instances.find((i) => i.id === detailId)}
                profile={profiles.find((p) => p.id === instances.find((i) => i.id === detailId)?.profileId)}
                actions={instanceActions}
                menuItems={instances.find((i) => i.id === detailId) ? instanceMenu(instances.find((i) => i.id === detailId), instanceActions).filter((m) => m?.label !== 'Détails de l’instance') : []}
                onBack={() => setTab('library')}
                onAddContent={(type) => { setDiscover({ type, target: detailId }); setTab('discover') }}
                toast={toast}
              />
            )}
            {tab === 'accounts' && <Accounts accounts={accounts} setAccounts={setAccounts} settings={settings} onBack={() => setTab('library')} onOpenSettings={() => openSettings('connections')} toast={toast} />}
            {tab === 'settings' && <Settings settings={settings} initialTab={settingsTab} onSaved={(s, quiet) => { setSettings(s); if (!quiet) toast('Paramètres enregistrés.', 'success') }} />}
        </motion.div>
      </main>

      <ImportModal profile={importing} onClose={() => setImporting(null)} onDone={importDone} />
      <InstallModal hit={installing} preferredInstance={discover.target} onClose={() => setInstalling(null)} instances={instances} profiles={profiles} itemDefs={itemDefs} onDone={(msg) => { refresh(); toast(msg, 'success') }} onError={(msg) => toast(msg, 'error')} />
      <ProfileModal open={!!profileModal} profile={profileModal?.profile} onClose={() => setProfileModal(null)} onSave={saveProfile} />
      <ReapplyModal instance={reapplying} onClose={() => setReapplying(null)} onApply={reapply} profiles={profiles} itemDefs={itemDefs} />
      <ConfirmModal confirm={confirm} onClose={() => setConfirm(null)} />
      <CrashModal crash={crash} instance={instances.find((i) => i.id === crash?.instanceId)} onClose={() => setCrash(null)} />

      <div className="pointer-events-none fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div key={t.id} initial={{ opacity: 0, y: 16, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }} className={`flex max-w-xl items-center gap-2.5 rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur ${t.kind === 'error' ? 'border-red-500/40 bg-red-950/90 text-red-200' : t.kind === 'success' ? 'border-ember-500/40 bg-bark-850/95' : 'border-bark-600 bg-bark-850/95'}`}>
              {t.kind === 'success' ? <Check className="h-4 w-4 shrink-0 text-ember-400" /> : <Info className="h-4 w-4 shrink-0 text-cream-muted" />}
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

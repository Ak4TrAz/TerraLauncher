import React, { useEffect, useState } from 'react'
import { Settings as SettingsIcon, Coffee, Gamepad2, PlugZap, Palette, Play, Folder, Eye, Save, RotateCcw, Check, ExternalLink, FolderOpen, Hammer } from 'lucide-react'
import { api } from '../api'
import { Select } from '../components/ui'
import Banner from '../components/Banner'

const TABS = [
  { key: 'general', label: 'Général', icon: SettingsIcon },
  { key: 'java', label: 'Java', icon: Coffee },
  { key: 'game', label: 'Jeu', icon: Gamepad2 },
  { key: 'connections', label: 'Connexions', icon: PlugZap }
]

function Toggle({ on, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className={`relative h-8 w-14 rounded-full transition ${on ? 'bg-ember-500' : 'bg-bark-700'}`}>
      <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? 'left-7' : 'left-1'}`} />
    </button>
  )
}

function Section({ icon: Icon, title, subtitle, children }) {
  return (
    <div className="panel p-6">
      <div className="mb-5 flex items-start gap-4 border-b border-bark-700/70 pb-4">
        <Icon className="mt-1 h-7 w-7 text-cream" />
        <div>
          <h2 className="text-2xl font-bold">{title}</h2>
          <p className="text-cream-muted">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

function Setting({ title, desc, children }) {
  return (
    <div>
      <div className="font-semibold">{title}</div>
      <div className="mb-2 text-sm text-cream-muted">{desc}</div>
      {children}
    </div>
  )
}

function Link({ href, children }) {
  return <button type="button" onClick={() => api.app.openExternal(href)} className="inline-flex items-center gap-1 font-semibold text-ember-400 hover:text-ember-300">{children} <ExternalLink className="h-3.5 w-3.5" /></button>
}

function Status({ ok, okText, koText }) {
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${ok ? 'bg-[#1f5a2a] text-[#9be3a8]' : 'bg-bark-700 text-cream-muted'}`}>{ok ? okText : koText}</span>
}

function Connections({ draft, set }) {
  return (
    <div className="space-y-5">
      <Section icon={PlugZap} title="Microsoft / Minecraft" subtitle="Nécessaire pour se connecter avec un compte Minecraft Java.">
        <div className="mb-4 flex items-center gap-3"><Status ok={!!draft.msClientId} okText="Client ID configuré" koText="Non configuré" /></div>
        <Setting title="Client ID de l’application Azure" desc="Identifiant propre à TerraLauncher, créé une seule fois par toi.">
          <input className="input h-11 font-mono" placeholder="00000000-0000-0000-0000-000000000000" value={draft.msClientId || ''} onChange={(e) => set({ msClientId: e.target.value })} />
        </Setting>
        <ol className="mt-5 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-cream-muted">
          <li>Sur <Link href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade">portal.azure.com → Inscriptions d’applications</Link>, clique « Nouvelle inscription ». Nom : TerraLauncher. Comptes : <b className="text-cream">« Comptes Microsoft personnels uniquement »</b>.</li>
          <li>URI de redirection : plateforme <b className="text-cream">« Client public/natif (mobile et bureau) »</b>, valeur <code className="rounded bg-bark-950 px-1.5 py-0.5 text-cream">http://localhost</code>.</li>
          <li>Copie l’<b className="text-cream">« ID d’application (client) »</b> dans le champ ci-dessus.</li>
          <li>Demande à Mojang l’accès à l’API Minecraft pour ce Client ID via <Link href="https://aka.ms/mce-reviewappid">aka.ms/mce-reviewappid</Link>. Tant que ce n’est pas validé, la connexion s’arrête à l’étape Minecraft.</li>
        </ol>
      </Section>

      <Section icon={PlugZap} title="CurseForge" subtitle="Nécessaire pour chercher et installer depuis CurseForge.">
        <div className="mb-4 flex items-center gap-3"><Status ok={draft.hasCurseforgeKey} okText="Clé enregistrée" koText="Non configurée" /></div>
        <Setting title="Clé d’API CurseForge" desc="Stockée chiffrée par Windows sur ce PC.">
          <input className="input h-11 font-mono" type="password" placeholder="$2a$10$…" value={draft.curseforgeKey || ''} onChange={(e) => set({ curseforgeKey: e.target.value })} />
        </Setting>
        <p className="mt-4 text-sm text-cream-muted">Demande une clé sur la <Link href="https://console.curseforge.com/">console CurseForge pour développeurs</Link> (formulaire d’accès à l’API).</p>
      </Section>

      <Section icon={PlugZap} title="Modrinth" subtitle="Catalogue ouvert : aucune clé n’est nécessaire.">
        <Status ok okText="Prêt à l’emploi" />
      </Section>
    </div>
  )
}

export default function Settings({ settings, onSaved, initialTab = 'general' }) {
  const [tab, setTab] = useState(initialTab)
  const [draft, setDraft] = useState(settings || {})
  useEffect(() => setDraft(settings || {}), [settings])
  useEffect(() => setTab(initialTab), [initialTab])
  const set = (changes) => setDraft((d) => ({ ...d, ...changes }))

  const save = async () => {
    const changes = { animations: draft.animations, startPage: draft.startPage, msClientId: draft.msClientId || '' }
    if (draft.curseforgeKey !== settings?.curseforgeKey) changes.curseforgeKey = draft.curseforgeKey || ''
    onSaved(await api.settings.update(changes))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-5">
        <SettingsIcon className="h-14 w-14 text-ember-500" strokeWidth={2.5} />
        <div>
          <h1 className="text-[38px] font-extrabold leading-tight tracking-tight">Paramètres</h1>
          <p className="text-[17px] text-cream-muted">Personnalisez votre expérience TerraLauncher.</p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-bark-700">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`-mb-px flex items-center gap-2.5 rounded-t-tl border px-5 py-3 text-[16px] transition ${tab === t.key ? 'border-ember-500 border-b-bark-900 bg-ember-500/10 text-ember-400' : 'border-bark-700 text-cream/80 hover:text-cream'}`}>
            <t.icon className="h-5 w-5" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_460px]">
          <div className="space-y-5">
            <Section icon={Palette} title="Apparence" subtitle="Personnalisez l’interface de TerraLauncher.">
              <div className="grid grid-cols-3 gap-6">
                <Setting title="Thème" desc="Choisissez le thème de l’application.">
                  <Select className="h-11" value="autumn" onChange={() => {}} options={[{ value: 'autumn', label: 'Automne sombre' }]} />
                </Setting>
                <Setting title="Langue" desc="Langue de l’interface.">
                  <Select className="h-11" value="fr" onChange={() => {}} options={[{ value: 'fr', label: 'Français' }]} />
                </Setting>
                <Setting title="Animations décoratives" desc="Afficher les feuilles animées.">
                  <Toggle on={draft.animations !== false} onChange={(v) => set({ animations: v })} />
                </Setting>
              </div>
            </Section>
            <Section icon={Play} title="Au lancement" subtitle="Configurez le comportement de TerraLauncher au démarrage.">
              <Setting title="Ouvrir la page" desc="Page affichée au démarrage de l’application.">
                <Select className="h-11 max-w-sm" value={draft.startPage || 'library'} onChange={(v) => set({ startPage: v })} options={[{ value: 'library', label: 'Ma bibliothèque' }, { value: 'discover', label: 'Découvrir' }, { value: 'profiles', label: 'Profils' }]} />
              </Setting>
            </Section>
            <Section icon={Folder} title="Dossiers" subtitle="Gérez les emplacements de vos données.">
              <Setting title="Données de TerraLauncher" desc="Instances, profils, versions de Minecraft.">
                <div className="flex gap-2">
                  <input className="input h-11 flex-1" readOnly value="%APPDATA%\.terralauncher" />
                  <button className="btn-ghost h-11" onClick={() => api.app.openDataFolder().catch(() => {})}><FolderOpen className="h-5 w-5" /></button>
                </div>
              </Setting>
            </Section>
          </div>
          <div className="panel h-fit p-6">
            <div className="mb-4 flex items-center gap-3"><Eye className="h-6 w-6" /><h2 className="text-2xl font-bold">Aperçu</h2></div>
            <div className="aspect-[4/3] overflow-hidden rounded-tl border border-bark-700"><Banner scene={5} /></div>
            <p className="mt-4 font-semibold">Thème</p>
            <div className="mt-2 w-36 overflow-hidden rounded-tl border-2 border-ember-500">
              <div className="h-16 bg-[#2a1c14]"><Banner scene={0} /></div>
              <div className="flex items-center justify-between bg-bark-900 px-2 py-1 text-sm">Automne sombre <Check className="h-4 w-4 text-ember-400" /></div>
            </div>
          </div>
        </div>
      )}

      {(tab === 'java' || tab === 'game') && (
        <div className="panel flex flex-col items-center gap-3 px-6 py-20 text-center">
          <Hammer className="h-10 w-10 text-ember-400" />
          <h2 className="text-2xl font-bold">{tab === 'java' ? 'Java et mémoire' : 'Réglages du jeu'}</h2>
          <p className="max-w-md text-cream-muted">Ces réglages (RAM, version de Java, carte graphique NVIDIA, résolution) arrivent avec le lancement du jeu.</p>
        </div>
      )}

      {tab === 'connections' && <Connections draft={draft} set={set} />}

      <div className="flex justify-between pb-2">
        <button className="btn-ghost px-6 py-3" onClick={() => setDraft(settings || {})}><RotateCcw className="h-5 w-5" /> Annuler les modifications</button>
        <button className="btn-primary px-10 py-3 text-base" onClick={save}><Save className="h-5 w-5" /> Enregistrer</button>
      </div>
    </div>
  )
}

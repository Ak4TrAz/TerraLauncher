import React, { useState } from 'react'
import { Plus, Check, Play, LogOut, Loader2, ArrowLeft, KeyRound, AlertTriangle } from 'lucide-react'
import { api } from '../api'
import { CubesIcon, GrassBlock } from '../components/ui'
import { Fox, Leaf } from '../components/Sprites'

function MicrosoftLogo({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden>
      <rect width="9" height="9" fill="#f25022" /><rect x="11" width="9" height="9" fill="#7fba00" />
      <rect y="11" width="9" height="9" fill="#00a4ef" /><rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  )
}

function AccountCard({ acc, onUse, onRemove }) {
  return (
    <div className={`flex items-center gap-6 rounded-tl-lg border p-6 ${acc.active ? 'border-ember-500 bg-gradient-to-br from-ember-500/15 to-transparent' : 'border-bark-700 bg-bark-850/85'}`}>
      <img src={`https://mc-heads.net/avatar/${acc.uuid}/128`} className="pixel h-28 w-28 rounded-full border-4 border-bark-600 bg-bark-800" alt="" />
      <div className="flex-1 space-y-2">
        <div className="text-3xl font-bold">{acc.name}</div>
        {acc.active && <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1f5a2a] px-3 py-1 text-sm font-semibold text-[#9be3a8]"><Check className="h-4 w-4" /> Compte actif</span>}
        <div className="flex items-center gap-2 text-cream-muted"><MicrosoftLogo /> Compte Microsoft</div>
        <div className="flex items-center gap-2 text-cream-muted"><GrassBlock className="h-5 w-5" /> Minecraft Java</div>
      </div>
      <div className="flex w-56 flex-col gap-3 border-l border-bark-700 pl-6">
        <button className="btn-primary py-3" disabled={acc.active} onClick={() => onUse(acc)}><Play className="h-4 w-4 fill-white" /> Utiliser ce compte</button>
        <button className="btn-ghost py-3" onClick={() => onRemove(acc)}><LogOut className="h-4 w-4" /> Déconnecter</button>
      </div>
    </div>
  )
}

export default function Accounts({ accounts, setAccounts, settings, onBack, onOpenSettings, toast }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const missingId = !settings?.hasMsClientId

  const login = async () => {
    setBusy(true)
    setError(null)
    try {
      const list = await api.accounts.login()
      setAccounts(list)
      toast(`Connecté en tant que ${list.find((a) => a.active)?.name}.`, 'success')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-5">
        <CubesIcon className="h-14 w-14" />
        <div>
          <h1 className="text-3xl font-extrabold xl:text-[38px] leading-tight tracking-tight">Vos comptes</h1>
          <p className="text-[17px] text-cream-muted">Choisissez le compte utilisé pour lancer Minecraft.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_440px]">
        <div className="space-y-5">
          {accounts.map((acc) => (
            <AccountCard
              key={acc.uuid}
              acc={acc}
              onUse={async (a) => setAccounts(await api.accounts.setActive(a.uuid))}
              onRemove={async (a) => { setAccounts(await api.accounts.remove(a.uuid)); toast(`${a.name} est déconnecté.`) }}
            />
          ))}

          <div className="flex items-center gap-6 rounded-tl-lg border-2 border-dashed border-bark-600 p-6">
            <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-dashed border-bark-600">
              <Plus className="h-10 w-10 text-cream-muted" />
            </div>
            <div className="flex-1">
              <div className="text-2xl font-bold">Ajouter un compte Microsoft</div>
              <div className="text-cream-muted">{busy ? 'Termine la connexion dans ton navigateur…' : 'La connexion s’ouvrira dans votre navigateur.'}</div>
            </div>
            {busy ? (
              <button className="btn-ghost px-6 py-3" onClick={() => api.accounts.cancel()}><Loader2 className="h-5 w-5 animate-spin" /> Annuler</button>
            ) : (
              <button className="btn-primary px-6 py-3 text-base" disabled={missingId} onClick={login}><MicrosoftLogo className="h-5 w-5" /> Se connecter</button>
            )}
          </div>

          {missingId && (
            <div className="panel flex items-center gap-4 p-5">
              <KeyRound className="h-8 w-8 shrink-0 text-ember-400" />
              <p className="flex-1 text-cream-muted">Pour se connecter, TerraLauncher a besoin de son propre <b className="text-cream">Client ID Microsoft</b> (application Azure). Ajoute-le dans les paramètres.</p>
              {settings?.devMode && <button className="btn-primary" onClick={onOpenSettings}>Paramètres</button>}
            </div>
          )}
          {error && (
            <div className="flex items-start gap-3 rounded-tl border border-[#df7164]/40 bg-[#df7164]/10 p-4 text-[#f0a69c]">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /> {error}
            </div>
          )}
        </div>

        <div className="panel relative overflow-hidden p-8">
          <div className="relative mx-auto mb-6 flex h-48 w-48 items-center justify-center">
            <Leaf variant={0} className="absolute left-0 top-6 h-8 w-8 rotate-12" />
            <Leaf variant={2} className="absolute right-0 top-2 h-10 w-10 -rotate-12" />
            <Leaf variant={1} className="absolute bottom-6 left-4 h-7 w-7" />
            <Fox className="h-40 w-40" />
          </div>
          <h2 className="mb-3 text-3xl font-bold">Connexion sécurisée</h2>
          <p className="text-lg leading-relaxed text-cream-muted">Connectez-vous avec Microsoft dans votre navigateur. TerraLauncher ne vous demande jamais votre mot de passe.</p>
          <p className="mt-4 text-sm leading-relaxed text-cream-muted/70">Tes jetons de connexion sont chiffrés par Windows sur ce PC.</p>
        </div>
      </div>

      <button onClick={onBack} className="flex items-center gap-3 text-lg underline-offset-4 hover:underline"><ArrowLeft className="h-5 w-5" /> Retour à la bibliothèque</button>
    </div>
  )
}

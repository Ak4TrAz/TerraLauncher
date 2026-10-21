import React from 'react'
import { UserRound, Plus } from 'lucide-react'
import { Checkbox, ProfileAvatar } from './ui'

function detail(key, s) {
  if (!s) return ''
  switch (key) {
    case 'options': return s.options ? 'options.txt' : 'vide'
    case 'shaders': return s.shaders ? `${s.shaders} shader${s.shaders > 1 ? 's' : ''}` : 'vide'
    case 'resourcepacks': return s.resourcepacks ? `${s.resourcepacks} pack${s.resourcepacks > 1 ? 's' : ''}` : 'vide'
    case 'servers': return s.servers ? 'servers.dat' : 'vide'
    case 'config': return s.config ? `${s.config} fichier${s.config > 1 ? 's' : ''}` : 'vide'
    case 'mods': return s.mods ? `${s.mods} mod${s.mods > 1 ? 's' : ''}` : 'vide'
    case 'extras': return s.extras ? `${s.extras} élément${s.extras > 1 ? 's' : ''}` : 'vide'
    default: return ''
  }
}

// Champ « Importer un profil » : choix du profil puis de ce qu'on récupère.
export default function ProfileImportField({ profiles, itemDefs, profileId, setProfileId, items, setItems, allowNone = true, onCreateProfile }) {
  const selected = profiles.find((p) => p.id === profileId)
  const toggle = (key, on) => setItems(on ? [...items, key] : items.filter((k) => k !== key))

  return (
    <div className="rounded-2xl border border-ember-500/25 bg-gradient-to-b from-ember-500/[0.07] to-transparent p-4">
      <div className="mb-3 flex items-center gap-2">
        <UserRound className="h-4 w-4 text-ember-400" />
        <span className="text-sm font-bold">Importer un profil</span>
        <span className="text-xs text-orange-50/40">touches, shaders, packs, serveurs…</span>
      </div>

      {profiles.length === 0 ? (
        <div className="flex items-center justify-between rounded-xl border border-dashed border-bark-600 px-4 py-3 text-sm text-orange-50/60">
          Aucun profil pour l'instant.
          {onCreateProfile && (
            <button type="button" onClick={onCreateProfile} className="inline-flex items-center gap-1 font-semibold text-ember-400 hover:text-ember-300">
              <Plus className="h-4 w-4" /> Créer un profil
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {allowNone && (
            <button type="button" onClick={() => setProfileId(null)} className={`rounded-xl border px-3 py-2 text-sm transition ${!profileId ? 'border-ember-500 bg-ember-500/15 text-orange-50' : 'border-bark-700 text-orange-50/60 hover:border-bark-600'}`}>
              Aucun
            </button>
          )}
          {profiles.map((p) => (
            <button
              type="button"
              key={p.id}
              onClick={() => setProfileId(p.id)}
              className={`flex items-center gap-2 rounded-xl border py-1.5 pl-1.5 pr-3 text-sm transition ${profileId === p.id ? 'border-ember-500 bg-ember-500/15 text-orange-50' : 'border-bark-700 text-orange-50/75 hover:border-bark-600'}`}
            >
              <ProfileAvatar profile={p} size="h-7 w-7 text-sm rounded-lg" />
              {p.name}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {itemDefs.map((it) => (
            <Checkbox key={it.key} checked={items.includes(it.key)} onChange={(on) => toggle(it.key, on)} label={it.label} detail={detail(it.key, selected.summary)} />
          ))}
        </div>
      )}
    </div>
  )
}

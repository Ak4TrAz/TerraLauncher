import React, { useEffect, useState } from 'react'
import { UserRound, Check } from 'lucide-react'
import { Modal, Field, ProfileAvatar } from './ui'

const COLORS = ['#f07a1e', '#e2452b', '#e0b020', '#5dbb46', '#2fb5a0', '#3d8bf0', '#8a5cf0', '#e055a8']

// Création ou modification d'un profil.
export default function ProfileModal({ open, onClose, onSave, profile }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(COLORS[0])

  useEffect(() => {
    if (!open) return
    setName(profile?.name || '')
    setDescription(profile?.description || '')
    setColor(profile?.color || COLORS[Math.floor(Math.random() * COLORS.length)])
  }, [open, profile])

  const submit = async () => {
    await onSave({ name: name.trim() || 'Nouveau profil', description: description.trim(), color })
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={profile ? 'Modifier le profil' : 'Nouveau profil'}
      icon={UserRound}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={submit}>
            <Check className="h-4 w-4" /> {profile ? 'Enregistrer' : 'Créer le profil'}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <ProfileAvatar profile={{ name: name || '?', color }} size="h-16 w-16 text-2xl" />
          <div className="flex-1">
            <Field label="Nom du profil">
              <input className="input" autoFocus placeholder="Ex : AkaTrAz, PvP, Survie détente…" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} onKeyDown={(e) => e.key === 'Enter' && submit()} />
            </Field>
          </div>
        </div>
        <Field label="Description" hint="optionnel">
          <input className="input" placeholder="Ex : Mes touches + shaders Complementary" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={80} />
        </Field>
        <Field label="Couleur">
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)} className={`h-9 w-9 rounded-xl transition ${color === c ? 'scale-110 ring-2 ring-white/80 ring-offset-2 ring-offset-bark-900' : 'hover:scale-105'}`} style={{ background: c }} />
            ))}
          </div>
        </Field>
        {!profile && (
          <p className="rounded-xl bg-bark-950/60 px-4 py-3 text-sm text-orange-50/55">
            Une fois créé, utilise <b className="text-orange-50/80">Importer depuis une instance</b> pour récupérer ce que tu veux (touches, shaders, resource packs, configs, mods…) depuis GDLauncher, Modrinth, .minecraft ou une instance TerraLauncher.
          </p>
        )}
      </div>
    </Modal>
  )
}

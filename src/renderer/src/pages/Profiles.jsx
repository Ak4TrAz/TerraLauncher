import React from 'react'
import { motion } from 'framer-motion'
import { Plus, UserRound, Download, FolderOpen, Pencil, Trash2, Keyboard, Sparkles, Image, Server, Settings2, Boxes, Puzzle, FileStack } from 'lucide-react'
import { ProfileAvatar } from '../components/ui'

function Stat({ icon: Icon, label, on }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium ${on ? 'bg-ember-500/15 text-ember-300' : 'bg-bark-800 text-orange-50/35'}`}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </span>
  )
}

function ProfileCard({ profile, used, actions, index }) {
  const s = profile.summary || {}
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="panel relative overflow-hidden p-5"
    >
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: profile.color }} />
      <div className="flex items-start gap-4">
        <ProfileAvatar profile={profile} size="h-14 w-14 text-2xl" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-xl font-bold">{profile.name}</h3>
          <p className="truncate text-sm text-orange-50/50">{profile.description || 'Aucune description'}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-bark-800 px-2.5 py-1 text-xs text-orange-50/60">
          <Boxes className="h-3.5 w-3.5" /> {used} instance{used > 1 ? 's' : ''}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        <Stat icon={Keyboard} label="Touches" on={s.options} />
        <Stat icon={Sparkles} label={`${s.shaders || 0} shader${s.shaders > 1 ? 's' : ''}`} on={s.shaders > 0} />
        <Stat icon={Image} label={`${s.resourcepacks || 0} resource pack${s.resourcepacks > 1 ? 's' : ''}`} on={s.resourcepacks > 0} />
        <Stat icon={Server} label="Serveurs" on={s.servers} />
        <Stat icon={Settings2} label={`${s.config || 0} config${s.config > 1 ? 's' : ''}`} on={s.config > 0} />
        <Stat icon={Puzzle} label={`${s.mods || 0} mod${s.mods > 1 ? 's' : ''}`} on={s.mods > 0} />
        <Stat icon={FileStack} label={`${s.extras || 0} autre${s.extras > 1 ? 's' : ''}`} on={s.extras > 0} />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button className="btn-primary px-3 py-2 text-sm" onClick={() => actions.importFrom(profile)}>
          <Download className="h-4 w-4" /> Importer depuis une instance
        </button>
        <button className="btn-ghost px-3 py-2 text-sm" onClick={() => actions.openFolder(profile)}>
          <FolderOpen className="h-4 w-4" /> Dossier
        </button>
        <button className="btn-ghost px-3 py-2 text-sm" onClick={() => actions.edit(profile)}>
          <Pencil className="h-4 w-4" /> Modifier
        </button>
        <button className="btn-ghost ml-auto px-3 py-2 text-sm text-red-400 hover:text-red-300" onClick={() => actions.remove(profile)}>
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  )
}

export default function Profiles({ profiles, instances, actions }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-ember-500/15">
          <UserRound className="h-7 w-7 text-ember-400" />
        </div>
        <div className="flex-1">
          <h1 className="text-3xl font-extrabold xl:text-[34px] leading-tight tracking-tight">Vos profils</h1>
          <p className="text-[15px] text-orange-50/60">Vos touches, shaders et packs, réutilisables dans chaque nouvelle instance.</p>
        </div>
        <button className="btn-primary px-6 py-3 text-base" onClick={actions.create}>
          <Plus className="h-5 w-5" /> Nouveau profil
        </button>
      </div>

      {profiles.length === 0 ? (
        <div className="panel flex flex-col items-center gap-4 px-6 py-16 text-center">
          <UserRound className="h-10 w-10 text-ember-400" />
          <div>
            <h2 className="text-xl font-bold">Aucun profil</h2>
            <p className="mt-1 max-w-md text-orange-50/55">Un profil regroupe ton options.txt (touches), tes shaders, resource packs, serveurs et configs. Il est proposé à chaque création d'instance.</p>
          </div>
          <button className="btn-primary" onClick={actions.create}><Plus className="h-5 w-5" /> Créer mon premier profil</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {profiles.map((p, i) => (
            <ProfileCard key={p.id} profile={p} index={i} used={instances.filter((x) => x.profileId === p.id).length} actions={actions} />
          ))}
        </div>
      )}
    </div>
  )
}

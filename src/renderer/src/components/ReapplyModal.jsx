import React, { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Modal } from './ui'
import ProfileImportField from './ProfileImportField'

// Réapplique un profil sur une instance existante.
export default function ReapplyModal({ instance, onClose, onApply, profiles, itemDefs }) {
  const [profileId, setProfileId] = useState(null)
  const [items, setItems] = useState([])

  useEffect(() => {
    if (!instance) return
    setProfileId(instance.profileId || profiles[0]?.id || null)
    setItems(itemDefs.map((i) => i.key))
  }, [instance])

  return (
    <Modal
      open={!!instance}
      onClose={onClose}
      title={`Appliquer un profil à « ${instance?.name || ''} »`}
      icon={RefreshCw}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Annuler</button>
          <button className="btn-primary" disabled={!profileId || items.length === 0} onClick={async () => { await onApply(instance.id, profileId, items); onClose() }}>
            <RefreshCw className="h-4 w-4" /> Appliquer
          </button>
        </>
      }
    >
      <p className="mb-4 text-sm text-orange-50/55">
        Les réglages du profil remplacent ceux de l'instance. Les touches propres aux mods de cette instance sont conservées.
      </p>
      <ProfileImportField profiles={profiles} itemDefs={itemDefs} profileId={profileId} setProfileId={setProfileId} items={items} setItems={setItems} allowNone={false} />
    </Modal>
  )
}

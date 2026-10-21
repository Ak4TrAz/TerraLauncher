import React from 'react'
import { AlertTriangle, FolderOpen, Copy } from 'lucide-react'
import { Modal } from './ui'
import { api } from '../api'

// Affiché quand le jeu se ferme sur une erreur
export default function CrashModal({ crash, instance, onClose }) {
  return (
    <Modal
      open={!!crash}
      onClose={onClose}
      title={`« ${instance?.name || 'Minecraft'} » s’est fermé de façon inattendue`}
      icon={AlertTriangle}
      width="max-w-3xl"
      footer={
        <>
          <button className="btn-ghost mr-auto" onClick={() => navigator.clipboard?.writeText(crash?.crashReport || '')}><Copy className="h-4 w-4" /> Copier le rapport</button>
          {instance && <button className="btn-ghost" onClick={() => api.instances.openFolder(instance.id).catch(() => {})}><FolderOpen className="h-4 w-4" /> Dossier de l’instance</button>}
          <button className="btn-primary" onClick={onClose}>Fermer</button>
        </>
      }
    >
      <p className="mb-3 text-sm text-cream-muted">
        Code de sortie {crash?.code ?? 'inconnu'}. Les dernières lignes du jeu sont ci-dessous ; le journal complet est dans <code className="rounded bg-bark-950 px-1">logs/terralauncher-latest.log</code>.
        Souvent, un mod incompatible ou un manque de RAM en est la cause.
      </p>
      <pre className="max-h-[380px] select-text overflow-auto whitespace-pre-wrap rounded-tl border border-bark-700 bg-bark-950 p-4 font-mono text-xs leading-relaxed text-cream/85">{crash?.crashReport || 'Aucun détail disponible.'}</pre>
    </Modal>
  )
}

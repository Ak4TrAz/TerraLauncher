import React from 'react'
import { AlertTriangle } from 'lucide-react'
import { Modal } from './ui'

export default function ConfirmModal({ confirm, onClose }) {
  return (
    <Modal
      open={!!confirm}
      onClose={onClose}
      title={confirm?.title}
      icon={AlertTriangle}
      width="max-w-md"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Annuler</button>
          <button className="btn-danger" onClick={async () => { await confirm.onConfirm(); onClose() }}>{confirm?.action || 'Confirmer'}</button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-orange-50/70">{confirm?.message}</p>
    </Modal>
  )
}

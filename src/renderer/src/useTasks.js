import { useEffect, useState } from 'react'
import { api } from './api'

// Suit des tâches de fond (panneau des téléchargements) et appelle onDone quand elles se terminent.
// Renvoie [ids en cours, ajouter un id].
export function useTasks(onDone) {
  const [ids, setIds] = useState([])
  useEffect(() => {
    if (!ids.length) return
    return api.downloads.onUpdate((tasks) => {
      const finished = tasks.filter((t) => ids.includes(t.id) && t.status !== 'running')
      if (!finished.length) return
      setIds((cur) => cur.filter((id) => !finished.some((t) => t.id === id)))
      onDone(finished)
    })
  }, [ids, onDone])
  return [ids, (id) => setIds((cur) => [...cur, id])]
}

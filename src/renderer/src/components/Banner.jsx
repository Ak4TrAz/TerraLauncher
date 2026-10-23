import React from 'react'

// Illustrations par défaut des instances (découpées dans les maquettes).
export const BANNERS = [
  { name: 'Chalet au lac', file: './banners/chalet.webp' },
  { name: 'Exploration', file: './banners/exploration.webp' },
  { name: 'Îles volantes', file: './banners/skyblock.webp' },
  { name: 'Château', file: './banners/chateau.webp' },
  { name: 'Vallée', file: './banners/vallee.webp' },
  { name: 'Renard', file: './banners/renard.webp' }
]

// Image utilisée pour toute nouvelle instance
export const FOX_BANNER = 5

export default function Banner({ instance, scene, className = '' }) {
  const src = instance?.bannerFile
    ? `terra://banner/${instance.id}/${instance.bannerFile}?v=${instance.bannerRev || 0}`
    : BANNERS[(instance ? instance.banner ?? 0 : scene ?? 0) % BANNERS.length].file
  return <img src={src} className={`h-full w-full object-cover ${className}`} alt="" draggable={false} />
}

// Vignette carrée : le logo importé, sinon la bannière
export function Logo({ instance, className = '' }) {
  if (!instance?.logoFile) return <Banner instance={instance} className={className} />
  const src = `terra://banner/${instance.id}/${instance.logoFile}?v=${instance.logoRev || 0}`
  return <img src={src} className={`h-full w-full object-cover ${className}`} alt="" draggable={false} />
}

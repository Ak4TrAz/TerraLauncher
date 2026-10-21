import React from 'react'

// Images détourées telles quelles depuis les maquettes TerraLauncher.

export function Fox({ className = 'h-12 w-12' }) {
  return <img src="./fox.png" className={`object-contain ${className}`} alt="" draggable={false} />
}

export const LEAVES = ['./leaves/leaf1.png', './leaves/leaf2.png', './leaves/leaf3.png', './leaves/leaf4.png']

export function Leaf({ variant = 0, className = 'h-6 w-6', style }) {
  return <img src={LEAVES[variant % LEAVES.length]} className={`object-contain ${className}`} style={style} alt="" draggable={false} />
}

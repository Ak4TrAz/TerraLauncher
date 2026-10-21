import React from 'react'
import { createRoot } from 'react-dom/client'
import { MotionGlobalConfig } from 'framer-motion'
import App from './App'
import './index.css'

// Aperçu de développement : ?noanim coupe les animations (utile quand la page tourne en arrière-plan)
if (new URLSearchParams(location.search).has('noanim')) MotionGlobalConfig.skipAnimations = true

createRoot(document.getElementById('root')).render(<App />)

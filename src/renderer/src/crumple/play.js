// Froissement d'une carte : la capture de la carte devient une feuille 3D posée exactement à sa place à l'écran,
// la feuille se froisse (simulation précalculée, voir vat.js), puis la boule tombe hors de l'écran.
import * as THREE from 'three'
import { loadVAT } from './vat'

let dataPromise = null
// Application installée (file://) : fichiers servis par le protocole terra:// ; aperçu de développement : chemin relatif
const basePath = () => (location.protocol === 'file:' ? 'terra://asset/crumple/' : './crumple/')

// À appeler dès que la suppression est proposée : le chargement est prêt au moment de confirmer
export function preloadCrumple() {
  if (!dataPromise) dataPromise = loadVAT(basePath()).catch((err) => { dataPromise = null; throw err })
  return dataPromise
}

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const lerp = (a, b, t) => a + (b - a) * t

const CRUMPLE_MS = 950
const FALL_MS = 650
const FOV = 30
const DIST = 10

// canvas : plein écran, au-dessus de la carte ; imageUrl : capture de la carte ; rect : sa position à l'écran (px)
// onFirstFrame : appelé quand la feuille 3D recouvre la carte (on peut alors cacher la vraie carte)
export async function playCrumple({ canvas, imageUrl, rect, onFirstFrame }) {
  const data = await preloadCrumple()
  const W = window.innerWidth
  const H = window.innerHeight

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setSize(W, H, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(FOV, W / H, 0.1, 100)
  camera.position.set(0, 0, DIST)
  camera.lookAt(0, 0, 0)
  const unit = (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * DIST) / H // unités 3D par pixel, au plan z = 0

  scene.add(new THREE.AmbientLight(0xffffff, 1.5))
  const key = new THREE.DirectionalLight(0xffffff, 1.5)
  key.position.set(-3, 4, 6)
  scene.add(key)
  const texture = await new THREE.TextureLoader().loadAsync(imageUrl)
  texture.colorSpace = THREE.SRGBColorSpace
  // Orientation des UV du maillage (reprise de la démo d'origine)
  texture.rotation = Math.PI
  texture.center.set(0.5, 0.5)
  texture.repeat.set(1, -1)
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy()

  const { vertexCount, frameCount, indices, uvs, positions, normals, flat, crumple } = data
  const len = vertexCount * 3
  const geometry = new THREE.BufferGeometry()
  const posAttr = new THREE.BufferAttribute(positions.slice(0, len), 3).setUsage(THREE.DynamicDrawUsage)
  const nrmAttr = new THREE.BufferAttribute(normals.slice(0, len), 3).setUsage(THREE.DynamicDrawUsage)
  geometry.setAttribute('position', posAttr)
  geometry.setAttribute('normal', nrmAttr)
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2))
  geometry.setIndex(indices)
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85, metalness: 0, side: THREE.DoubleSide, transparent: true })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(-flat.cx, 0, -flat.cz) // centre de la feuille à plat sur l'origine du pivot

  // Pivot : feuille face à la caméra (normale +Y vers l'écran, bord haut +Z vers le haut de l'écran)
  const pivot = new THREE.Group()
  pivot.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)))
  pivot.add(mesh)
  scene.add(pivot)

  const setFrame = (f) => {
    const f0 = Math.min(frameCount - 1, Math.floor(f))
    const f1 = Math.min(frameCount - 1, f0 + 1)
    const t = f - f0
    const a = f0 * len
    const b = f1 * len
    const p = posAttr.array
    const n = nrmAttr.array
    for (let i = 0; i < len; i++) {
      p[i] = positions[a + i] * (1 - t) + positions[b + i] * t
      n[i] = normals[a + i] * (1 - t) + normals[b + i] * t
    }
    posAttr.needsUpdate = true
    nrmAttr.needsUpdate = true
    geometry.computeBoundingSphere()
  }

  // Taille à plat = taille de la carte ; boule finale ≈ 40 % du plus petit côté de la carte
  const sx = (rect.width * unit) / flat.width
  const sz = (rect.height * unit) / flat.depth
  const sBall = (Math.min(rect.width, rect.height) * unit * 0.2) / crumple.radius
  const home = new THREE.Vector3((rect.left + rect.width / 2 - W / 2) * unit, -(rect.top + rect.height / 2 - H / 2) * unit, 0)
  // Décalage du centre de la boule par rapport au centre de la feuille (repère local)
  const ballLocal = new THREE.Vector3(crumple.center[0] - flat.cx, crumple.center[1], crumple.center[2] - flat.cz)
  const drift = new THREE.Vector3()
  const fall = { vx: (Math.random() - 0.5) * 4, spin: (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 4) }

  const place = (e, extra = new THREE.Vector3()) => {
    const scx = lerp(sx, sBall, e)
    const scz = lerp(sz, sBall, e)
    const scy = lerp(Math.min(sx, sz), sBall, e)
    pivot.scale.set(scx, scy, scz)
    // La boule reste centrée là où était la carte
    drift.set(ballLocal.x * scx, ballLocal.y * scy, ballLocal.z * scz).applyQuaternion(pivot.quaternion).multiplyScalar(e)
    pivot.position.copy(home).sub(drift).add(extra)
  }

  setFrame(0)
  place(0)
  renderer.render(scene, camera)
  onFirstFrame?.()

  await new Promise((resolve) => {
    const start = performance.now()
    const baseRotation = pivot.rotation.clone()
    const tick = (now) => {
      const ms = now - start
      if (ms < CRUMPLE_MS) {
        const e = easeInOutCubic(ms / CRUMPLE_MS)
        setFrame(e * (frameCount - 1))
        place(e)
        pivot.rotation.set(baseRotation.x, baseRotation.y, baseRotation.z)
        pivot.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), Math.sin(e * Math.PI) * 0.12)
      } else if (ms < CRUMPLE_MS + FALL_MS) {
        // La boule tombe en tournant
        const t = (ms - CRUMPLE_MS) / 1000
        const g = H * unit * 3.2
        place(1, new THREE.Vector3(fall.vx * t, 2.2 * H * unit * 0.15 * t - 0.5 * g * t * t, 0))
        pivot.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), fall.spin * 0.016)
        material.opacity = 1 - Math.max(0, (ms - CRUMPLE_MS - FALL_MS * 0.6) / (FALL_MS * 0.4))
      } else {
        return resolve()
      }
      renderer.render(scene, camera)
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  renderer.clear() // la dernière image ne reste pas affichée
  geometry.dispose()
  material.dispose()
  texture.dispose()
  renderer.dispose()
}

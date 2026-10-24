// Animation de papier froissé : simulation Vellum (Houdini) précalculée en VAT (Vertex Animation Textures).
// Adapté de « paper-crumple-demo » (MIT, nagasawa / ITEM Inc.) : https://github.com/item-develop/paper-crumple-demo
// Fichiers : public/crumple/ (maillage FBX + texture de positions EXR, licence dans LICENSE.txt).
import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'

const FRAME_COUNT = 50
const MOTION_EPSILON = 1e-4

// Renvoie { vertexCount, frameCount, indices, uvs, positions, normals, flat, crumple }
// positions/normals : toutes les images à la suite ; image 0 = feuille à plat, dernière = boule froissée
export async function loadVAT(basePath) {
  const exrLoader = new EXRLoader()
  exrLoader.setDataType(THREE.FloatType)
  const [fbxGroup, posTex] = await Promise.all([
    new FBXLoader().loadAsync(basePath + 'vertex_animation_textures1_mesh.fbx'),
    exrLoader.loadAsync(basePath + 'vertex_animation_textures1_pos.exr')
  ])

  let fbxMesh = null
  fbxGroup.traverse((child) => { if (child.isMesh && !fbxMesh) fbxMesh = child })
  if (!fbxMesh) throw new Error('Maillage du papier introuvable.')

  const geo = fbxMesh.geometry
  const posAttr = geo.getAttribute('position')
  const uvAttr = geo.getAttribute('uv')
  const indexAttr = geo.getIndex()
  const vertexCount = posAttr.count
  // Le FBXLoader range la 2e couche d'UV (adresse dans la texture VAT) dans « uv1 »
  const vatUv = geo.getAttribute('uv2') || geo.getAttribute('uv1')
  const isDummy = (v) => vatUv && vatUv.getX(v) === 0 && vatUv.getY(v) === 0 // triangles de boîte englobante à ignorer

  const indices = []
  if (indexAttr) for (let i = 0; i < indexAttr.count; i++) indices.push(indexAttr.getX(i))
  else for (let i = 0; i < vertexCount; i += 3) if (!isDummy(i) && !isDummy(i + 1) && !isDummy(i + 2)) indices.push(i, i + 1, i + 2)

  const uvs = []
  if (uvAttr) for (let i = 0; i < uvAttr.count; i++) uvs.push(uvAttr.getX(i), uvAttr.getY(i))

  const posData = posTex.image.data
  const texW = posTex.image.width
  const texH = posTex.image.height
  const channels = posData.length / (texW * texH)

  let pointCount = vertexCount
  if (vatUv) {
    pointCount = 0
    for (let v = 0; v < vertexCount; v++) {
      if (isDummy(v)) continue
      const col = Math.floor(vatUv.getX(v) * texW)
      const row = Math.floor((1 - vatUv.getY(v)) * texH)
      pointCount = Math.max(pointCount, row * texW + col + 1)
    }
  }
  const rowsPerFrame = Math.ceil(pointCount / texW)

  const pointIds = new Int32Array(vertexCount)
  for (let v = 0; v < vertexCount; v++) {
    let id = v
    if (vatUv) id = isDummy(v) ? 0 : Math.floor((1 - vatUv.getY(v)) * texH) * texW + Math.floor(vatUv.getX(v) * texW)
    pointIds[v] = Math.max(0, Math.min(id, pointCount - 1))
  }

  // Positions de chaque image : position de repos + déplacement lu dans l'EXR.
  // L'EXRLoader retourne l'image verticalement (convention WebGL) et le déplacement X est inversé à l'export.
  const totalRows = FRAME_COUNT * rowsPerFrame
  const raw = new Float32Array(vertexCount * 3 * FRAME_COUNT)
  for (let frame = 0; frame < FRAME_COUNT; frame++) {
    for (let v = 0; v < vertexCount; v++) {
      const id = pointIds[v]
      const row = totalRows - 1 - (frame * rowsPerFrame + Math.floor(id / texW))
      const px = (row * texW + (id % texW)) * channels
      const o = (frame * vertexCount + v) * 3
      raw[o] = posAttr.getX(v) - posData[px]
      raw[o + 1] = posAttr.getY(v) + posData[px + 1]
      raw[o + 2] = posAttr.getZ(v) + posData[px + 2]
    }
  }

  // Retire les images immobiles au début et à la fin
  const stride = vertexCount * 3
  const deltas = []
  for (let f = 0; f < FRAME_COUNT - 1; f++) {
    let max = 0
    for (let i = 0; i < stride; i++) max = Math.max(max, Math.abs(raw[f * stride + i] - raw[(f + 1) * stride + i]))
    deltas.push(max)
  }
  let first = Math.max(0, deltas.findIndex((d) => d > MOTION_EPSILON))
  let last = deltas.length - 1
  while (last >= 0 && deltas[last] <= MOTION_EPSILON) last--
  const frameCount = last + 2 - first
  const positions = raw.slice(first * stride, (first + frameCount) * stride)

  const valid = []
  for (let v = 0; v < vertexCount; v++) if (!isDummy(v)) valid.push(v)

  // Taille de la feuille à plat (plan XZ, normale +Y)
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const v of valid) {
    minX = Math.min(minX, positions[v * 3]); maxX = Math.max(maxX, positions[v * 3])
    minZ = Math.min(minZ, positions[v * 3 + 2]); maxZ = Math.max(maxZ, positions[v * 3 + 2])
  }
  const flat = { width: maxX - minX, depth: maxZ - minZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 }

  // Centre et rayon de la boule (dernière image)
  const lastOff = (frameCount - 1) * stride
  let cx = 0, cy = 0, cz = 0
  for (const v of valid) { cx += positions[lastOff + v * 3]; cy += positions[lastOff + v * 3 + 1]; cz += positions[lastOff + v * 3 + 2] }
  cx /= valid.length; cy /= valid.length; cz /= valid.length
  const dists = valid.map((v) => Math.hypot(positions[lastOff + v * 3] - cx, positions[lastOff + v * 3 + 1] - cy, positions[lastOff + v * 3 + 2] - cz)).sort((a, b) => a - b)
  const crumple = { center: [cx, cy, cz], radius: dists[Math.floor(dists.length * 0.9)] }

  // Normales lissées par point (le maillage est une « soupe » de triangles sans sommets partagés)
  const normals = new Float32Array(vertexCount * 3 * frameCount)
  const pointNormals = new Float32Array(pointCount * 3)
  for (let frame = 0; frame < frameCount; frame++) {
    const off = frame * stride
    pointNormals.fill(0)
    for (let i = 0; i < indices.length; i += 3) {
      const a = off + indices[i] * 3, b = off + indices[i + 1] * 3, c = off + indices[i + 2] * 3
      const e1x = positions[b] - positions[a], e1y = positions[b + 1] - positions[a + 1], e1z = positions[b + 2] - positions[a + 2]
      const e2x = positions[c] - positions[a], e2y = positions[c + 1] - positions[a + 1], e2z = positions[c + 2] - positions[a + 2]
      const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x
      for (let k = 0; k < 3; k++) {
        const p = pointIds[indices[i + k]] * 3
        pointNormals[p] += nx; pointNormals[p + 1] += ny; pointNormals[p + 2] += nz
      }
    }
    for (let p = 0; p < pointCount; p++) {
      const o = p * 3
      const len = Math.hypot(pointNormals[o], pointNormals[o + 1], pointNormals[o + 2])
      if (len > 1e-10) { pointNormals[o] /= len; pointNormals[o + 1] /= len; pointNormals[o + 2] /= len } else { pointNormals[o] = 0; pointNormals[o + 1] = 1; pointNormals[o + 2] = 0 }
    }
    for (let v = 0; v < vertexCount; v++) {
      const p = pointIds[v] * 3, o = off + v * 3
      normals[o] = pointNormals[p]; normals[o + 1] = pointNormals[p + 1]; normals[o + 2] = pointNormals[p + 2]
    }
  }

  return { vertexCount, frameCount, indices, uvs, positions, normals, flat, crumple }
}

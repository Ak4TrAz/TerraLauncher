// Contrôles des chemins et des noms de version venus de l'extérieur (modpacks, API, autres launchers).
const path = require('path')

// Chemin relatif confiné dans base : refuse tout ce qui en sortirait (« .. », chemin absolu…)
function insideDir(base, rel) {
  const dest = path.resolve(base, String(rel))
  if (!dest.startsWith(path.resolve(base) + path.sep)) throw new Error(`Chemin refusé : ${rel}`)
  return dest
}

// Version de Minecraft ou de chargeur : « 1.20.1 », « 24w14a », « 1.21-pre1 », « 0.15.7+build.1 »…
// Ni séparateur de dossier, ni point initial, ni « : » : le nom sert de dossier.
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,79}$/
// Composant Java de Mojang : « jre-legacy », « java-runtime-delta »…
const COMPONENT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/

const isVersion = (v) => typeof v === 'string' && VERSION.test(v)

function checkVersion(v, what = 'Version') {
  if (!isVersion(v)) throw new Error(`${what} refusée : ${String(v).slice(0, 80)}`)
  return v
}

function checkComponent(c) {
  if (typeof c !== 'string' || !COMPONENT.test(c)) throw new Error(`Composant Java refusé : ${String(c).slice(0, 80)}`)
  return c
}

module.exports = { insideDir, isVersion, checkVersion, checkComponent }

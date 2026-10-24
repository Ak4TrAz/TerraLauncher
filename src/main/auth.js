// Connexion Microsoft → Xbox Live → Minecraft (OAuth « code + PKCE » avec retour sur localhost).
// Les jetons sont chiffrés par Windows (safeStorage) dans accounts.bin.
const fs = require('fs')
const path = require('path')
const http = require('http')
const crypto = require('crypto')
const { safeStorage, shell } = require('electron')

const MS_AUTHORIZE = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize'
const MS_TOKEN = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token'
const SCOPE = 'XboxLive.signin offline_access'

let file = null
let accounts = []
let pending = null // connexion en cours { cancel }

function init(root) {
  file = path.join(root, 'accounts.bin')
  try { accounts = JSON.parse(safeStorage.decryptString(fs.readFileSync(file))) } catch { accounts = [] }
}

function save() {
  fs.writeFileSync(file, safeStorage.encryptString(JSON.stringify(accounts)))
}

// Mojang renvoie le skin en http://, que la CSP de l'interface bloque : textures.minecraft.net répond aussi en https
const httpsSkin = (url) => url?.replace(/^http:\/\//i, 'https://') || null

// Version sans jetons, pour l'interface
const list = () => accounts.map(({ uuid, name, skin, active, addedAt }) => ({ uuid, name, skin: httpsSkin(skin), active, addedAt }))

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function postJson(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch {}
  return { res, json, text }
}

async function msToken(clientId, params) {
  const res = await fetch(MS_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, scope: SCOPE, ...params })
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`Microsoft : ${json.error_description || json.error || res.status}`)
  return json
}

const XSTS_ERRORS = {
  2148916233: "Ce compte Microsoft n'a pas encore de profil Xbox. Connecte-toi une fois sur xbox.com pour le créer.",
  2148916235: "Xbox Live n'est pas disponible dans ton pays.",
  2148916236: 'Ce compte doit être vérifié (âge) sur xbox.com.',
  2148916237: 'Ce compte doit être vérifié (âge) sur xbox.com.',
  2148916238: "Compte enfant : il doit être ajouté à une famille Microsoft par un adulte."
}

// Jeton Microsoft → compte Minecraft complet
async function minecraftFromMicrosoft(msAccessToken) {
  const xbl = await postJson('https://user.auth.xboxlive.com/user/authenticate', {
    Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: `d=${msAccessToken}` },
    RelyingParty: 'http://auth.xboxlive.com',
    TokenType: 'JWT'
  })
  if (!xbl.res.ok) throw new Error(`Xbox Live a refusé la connexion (${xbl.res.status}).`)

  const xsts = await postJson('https://xsts.auth.xboxlive.com/xsts/authorize', {
    Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.json.Token] },
    RelyingParty: 'rp://api.minecraftservices.com/',
    TokenType: 'JWT'
  })
  if (!xsts.res.ok) throw new Error(XSTS_ERRORS[xsts.json?.XErr] || `Xbox (XSTS) a refusé la connexion (${xsts.res.status}).`)
  const uhs = xsts.json.DisplayClaims.xui[0].uhs

  const mc = await postJson('https://api.minecraftservices.com/authentication/login_with_xbox', { identityToken: `XBL3.0 x=${uhs};${xsts.json.Token}` })
  if (!mc.res.ok) {
    console.error('[auth] login_with_xbox', mc.res.status, mc.text)
    if (mc.res.status === 403 || /Invalid app registration/i.test(mc.text))
      throw new Error("Mojang n'a pas encore autorisé TerraLauncher à se connecter à Minecraft (validation en attente). Réessaie plus tard.")
    throw new Error(`Minecraft a refusé la connexion (${mc.res.status}).`)
  }
  const mcToken = mc.json.access_token

  const prof = await fetch('https://api.minecraftservices.com/minecraft/profile', { headers: { Authorization: `Bearer ${mcToken}` } })
  if (prof.status === 404) throw new Error('Ce compte Microsoft ne possède pas Minecraft Java Edition.')
  if (!prof.ok) throw new Error(`Impossible de lire le profil Minecraft (${prof.status}).`)
  const profile = await prof.json()
  const skin = profile.skins?.find((s) => s.state === 'ACTIVE')?.url || null

  return { uuid: profile.id, name: profile.name, skin, mcToken, mcExpires: Date.now() + (mc.json.expires_in - 60) * 1000 }
}

function upsert(acc, msRefresh) {
  accounts = accounts.map((a) => ({ ...a, active: false }))
  const prev = accounts.find((a) => a.uuid === acc.uuid)
  const merged = { ...prev, ...acc, msRefresh, active: true, addedAt: prev?.addedAt || Date.now() }
  accounts = [merged, ...accounts.filter((a) => a.uuid !== acc.uuid)]
  save()
  return merged
}

// Petit serveur local qui reçoit le code renvoyé par Microsoft.
// Renvoie { port: Promise<number>, code: Promise<string> }
function waitForCode(state) {
  let portReady
  const port = new Promise((r) => { portReady = r })
  const code = new Promise((resolve, reject) => {
    const servers = []
    const done = (err, code) => {
      clearTimeout(timer)
      servers.forEach((s) => s.close())
      pending = null
      err ? reject(err) : resolve(code)
    }
    const handler = (req, res) => {
      const url = new URL(req.url, 'http://localhost')
      if (url.pathname !== '/') { res.writeHead(404); return res.end() }
      const ok = url.searchParams.get('code') && url.searchParams.get('state') === state
      const error = url.searchParams.get('error_description') || url.searchParams.get('error')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`<!doctype html><meta charset="utf-8"><title>TerraLauncher</title><body style="background:#1c1612;color:#f6e9df;font-family:Segoe UI,sans-serif;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h1 style="color:${ok ? '#f27a29' : '#df7164'}">${ok ? 'Connexion réussie' : 'Connexion annulée'}</h1><p>Tu peux fermer cet onglet et revenir dans TerraLauncher.</p></div>`)
      if (ok) done(null, url.searchParams.get('code'))
      else done(new Error(error || 'Connexion annulée.'))
    }
    const timer = setTimeout(() => done(new Error('Délai dépassé : la connexion n’a pas été terminée.')), 5 * 60 * 1000)
    pending = { cancel: () => done(new Error('Connexion annulée.')) }

    // Écoute sur 127.0.0.1 puis ::1 avec le même port (le navigateur peut utiliser l'un ou l'autre)
    const v4 = http.createServer(handler)
    servers.push(v4)
    v4.on('error', (e) => done(e))
    v4.listen(0, '127.0.0.1', () => {
      const p = v4.address().port
      const v6 = http.createServer(handler)
      v6.on('error', () => {}) // IPv6 absent : pas grave
      v6.listen(p, '::1')
      servers.push(v6)
      portReady(p)
    })
  })
  return { port, code }
}

async function login(clientId) {
  if (!clientId) throw new Error('Connexion Microsoft non configurée dans cette version du launcher.')
  if (pending) pending.cancel()

  const verifier = b64url(crypto.randomBytes(32))
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest())
  const state = b64url(crypto.randomBytes(16))

  const server = waitForCode(state)
  const port = await server.port
  const redirectUri = `http://localhost:${port}`

  const url = new URL(MS_AUTHORIZE)
  url.search = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SCOPE,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    prompt: 'select_account'
  })
  await shell.openExternal(url.toString())

  const code = await server.code
  const tokens = await msToken(clientId, { grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: verifier })
  const acc = await minecraftFromMicrosoft(tokens.access_token)
  upsert(acc, tokens.refresh_token)
  return list()
}

function cancelLogin() {
  pending?.cancel()
}

// Renvoie un jeton Minecraft valide pour le compte actif (rafraîchi si besoin).
async function activeSession(clientId) {
  const acc = accounts.find((a) => a.active)
  if (!acc) throw new Error('Aucun compte Minecraft connecté.')
  if (acc.mcExpires > Date.now()) return { uuid: acc.uuid, name: acc.name, accessToken: acc.mcToken }
  const tokens = await msToken(clientId, { grant_type: 'refresh_token', refresh_token: acc.msRefresh })
  const fresh = await minecraftFromMicrosoft(tokens.access_token)
  const saved = upsert(fresh, tokens.refresh_token || acc.msRefresh)
  return { uuid: saved.uuid, name: saved.name, accessToken: saved.mcToken }
}

function setActive(uuid) {
  accounts = accounts.map((a) => ({ ...a, active: a.uuid === uuid }))
  save()
  return list()
}

function remove(uuid) {
  const wasActive = accounts.find((a) => a.uuid === uuid)?.active
  accounts = accounts.filter((a) => a.uuid !== uuid)
  if (wasActive && accounts[0]) accounts[0].active = true
  save()
  return list()
}

module.exports = { init, list, login, cancelLogin, activeSession, setActive, remove }

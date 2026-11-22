// Findings der Review-Seite lesen und beantworten (Node 18+, ohne Pakete).
//   node tools/findings.mjs                 → offene Findings zeigen
//   node tools/findings.mjs --all           → alle (auch erledigte)
//   node tools/findings.mjs --json          → roh als JSON
//   node tools/findings.mjs done <id> "Antwort"   → als erledigt markieren (mit Antwort)
//   node tools/findings.mjs answer <id> "Antwort" → nur antworten
// Das Skript meldet sich anonym an (wie das Spiel) und schaltet sich beim ersten Mal mit dem Review-Code frei.
// Code in `.review-code` (eine Zeile, gitignored), Anmeldung in `.review-device.json` (gitignored).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API_KEY = 'AIzaSyCKvwhj0oQon6pOanQnhqDPY4Z6l87IALI'; // öffentliche Web-Konfiguration (wie in online.js)
const DB = 'https://lio-car-saver-de75a-default-rtdb.europe-west1.firebasedatabase.app';
const DEV = join(ROOT, '.review-device.json'), CODE = join(ROOT, '.review-code');

async function post(url, body, form = false) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' },
    body: form ? new URLSearchParams(body).toString() : JSON.stringify(body) });
  const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j.error || j)); return j;
}
async function login() {
  let d = existsSync(DEV) ? JSON.parse(readFileSync(DEV, 'utf8')) : null;
  if (d) { // Token erneuern
    const j = await post('https://securetoken.googleapis.com/v1/token?key=' + API_KEY, { grant_type: 'refresh_token', refresh_token: d.refreshToken }, true);
    d = { ...d, refreshToken: j.refresh_token, idToken: j.id_token, uid: j.user_id };
  } else {
    const j = await post('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + API_KEY, { returnSecureToken: true });
    d = { uid: j.localId, refreshToken: j.refreshToken, idToken: j.idToken, registered: false };
  }
  writeFileSync(DEV, JSON.stringify({ uid: d.uid, refreshToken: d.refreshToken, registered: d.registered }, null, 1));
  return d;
}
async function db(d, path, method = 'GET', body) {
  const r = await fetch(`${DB}/${path}.json?auth=${d.idToken}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json(); if (!r.ok) throw new Error(path + ': ' + JSON.stringify(j)); return j;
}
async function register(d) {
  if (d.registered) return;
  if (await db(d, 'reviewers/' + d.uid)) { d.registered = true; } else {
    if (!existsSync(CODE)) throw new Error('Gerät nicht freigeschaltet: Review-Code in .review-code ablegen');
    const code = readFileSync(CODE, 'utf8').trim();
    await db(d, 'reviewers/' + d.uid, 'PUT', { code, name: 'Claude (Lese-Skript)', t: { '.sv': 'timestamp' } });
    d.registered = true;
  }
  writeFileSync(DEV, JSON.stringify({ uid: d.uid, refreshToken: d.refreshToken, registered: true }, null, 1));
}

const [cmd, id, ...rest] = process.argv.slice(2);
const d = await login();
await register(d);
if (cmd === 'done' || cmd === 'answer') {
  if (!id) throw new Error('Finding-ID fehlt');
  const patch = {}; if (cmd === 'done') patch.status = 'erledigt'; if (rest.length) patch.answer = rest.join(' ').slice(0, 1000);
  await db(d, 'review/findings/' + id, 'PATCH', patch);
  console.log('ok', id, patch);
} else {
  const all = (await db(d, 'review/findings')) || {};
  const list = Object.entries(all).filter(([, f]) => cmd === '--all' || cmd === '--json' || f.status !== 'erledigt').sort((a, b) => a[1].t - b[1].t);
  if (cmd === '--json') console.log(JSON.stringify(Object.fromEntries(list), null, 1));
  else if (!list.length) console.log('Keine offenen Findings.');
  else for (const [k, f] of list) console.log(`${k}  [${f.status}] ${new Date(f.t).toLocaleString('de-CH')}  ${f.kind} (${f.model})  ${f.topic}  v${f.version || '?'}\n   ${f.text}${f.answer ? '\n   → ' + f.answer : ''}`);
}

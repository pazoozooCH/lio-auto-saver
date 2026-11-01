# Auto-Retter

Browser-Spiel ohne Build: `index.html` + `game.js` (Canvas, alles in einer Datei), `serve.py` als Webserver.
Texte im Spiel sind Deutsch (Schweizer Schreibweise, kein ß).

## Arbeitsweise

- Nach jeder Änderung committen und auf `main` pushen (Remote: github.com/pazoozooCH/lio-auto-saver).
- Die Versionsnummer ist die Anzahl Commits; `serve.py` erzeugt `version.js` daraus. `version.js` nie committen.

## Server und Tests

- Spiel für alle im LAN: Port **8123** (`.claude/launch.json` → `auto-retter`, `serve.py --host 0.0.0.0`).
  Dort liegt der echte Spielstand im `localStorage` – beim Testen nicht anfassen.
- Tests nur auf Port **8124** (`auto-retter-test`, nur `127.0.0.1`). Anderer Port = eigener `localStorage`.
- Prüfen: `node --check game.js`, dann im Browser auf 8124 ansehen; Spielzustand lässt sich per
  JavaScript setzen (`start(...)`, `openMenu('shop')`, `fleet`, `wallet` usw. sind globale Variablen).

# Car-Saver

Browser-Spiel ohne Build: `index.html` + `game.js` (Spiellogik, Menüs und 2D-Zeichnung), `serve.py` als Webserver.
3D mit three.js (per Import-Map von jsDelivr), als ES-Module per `import()` nachgeladen:
- `press3d.js`: zeichnet die Presse als 3D-Fabrikhalle. Die Logik bleibt in `game.js` (2D-Koordinaten);
  `press3d.project()` rechnet Positionen für Texte, Symbole und Antippen um. Ohne three.js (offline) zeichnet
  `game.js` die Presse wie früher in 2D.
- `race.js`: 3D-Rennstrecke, erst beim ersten Rennen geladen. Höhe, Steilkurven, Brücken, Tunnel; je Strecke eine eigene Szene.
- `tracks.js`: die Rennstrecken (Kontrollpunkte `[x, z, Höhe]`, Runden, Neigung) und ihre Landschaften (Vulkan, Gletscher, Wüste, Dschungel).
  Neue Strecke: hier eintragen und in `RACE_TRACKS` in `game.js` (Menü).
- `drag.js`: 3D-Dragster-Bahn (1 gegen 1, Startampel, selber schalten); Gewinner bekommt das Auto des Verlierers.
- `cars3d.js`: 3D-Fahrzeuge für alle Modi; jedes Fahrzeug hat in `BUILD` eine eigene Bauanleitung. Neuere Fahrzeuge
  haben in `KINDS` ein `look` (wird in 2D wie dieses Fahrzeug gezeichnet) und ein `badge` (Bildchen auf der Seite).
- `city.js`: 3D-Stadt zum freien Herumfahren (Strassengitter, Häuser, Parks, Ampeln, Verkehr mit Abbiegen und Halten).
  Testen: `startCityMode()`, dann `window.__city()` (`me`, `cars`, `input`). Oben am Stadtrand ist Platz für sechs Basen nebeneinander (nur für echte Spieler, sonst Wiese): bis zu 10 ausgesuchte
  Autos (`baseGarage` in `game.js`, Spielstand `autoRetterBase`), dort Auto wechseln; online je Spieler eine (`rooms/<CODE>/bases`).
- `stunt.js`: 3D-Stuntpark mit eigener Physik in der Höhe (Rampen als Formen in `SHAPES`, Looping, Feuerringe, Salto/Schraube).
  Testen: `startStuntMode()`, dann `window.__stunt()` (`me`, `input`, `score`).
- `viewer.js`: 3D-Ansicht eines Fahrzeugs zum Drehen (eigener Renderer, wird beim Schliessen freigegeben).
- `fx.js`: Kamera-Ansichten beim Fahren (`camView`), Reifenrauch und Bremsspuren (Stadt, Rennen, Stuntpark); Driften selbst steckt in der Physik des jeweiligen Modus.
  Dazu das Fliegen (`fly: true` in `KINDS`; Stadt, Stuntpark, Rennen): Höhe und Knöpfe hier, Hindernisse im jeweiligen Modus.
  Im Rennen bleibt man über der Strecke (Wände gelten, nicht schneller, `T.clear` = erlaubte Höhe in Tunneln und unter Brücken).
- `netcars.js`: Mitspieler beim freien Fahren online (Stadt, Stuntpark): senden, glätten, Namensschild, Zusammenstösse.
- `chat.js`: Chat beim freien Fahren online: feste Sprüche (gespeichert wird die Nummer; neue Sprüche hinten anhängen),
  freier Text nur in privaten Räumen, ohne Wortfilter (Entscheid der Eltern; Regeln prüfen Länge, Rate und privat).
- `online.js`: Online-Spiel (Lobby, Räume, Live-Daten) über Firebase Realtime Database mit anonymer Anmeldung.
  Regeln in `database.rules.json`, Einrichtung und Admin-Befehle im README. Freundes-Schlüssel nie ins Repo schreiben.
- `sound.js`: Geräusche aus dem Synthesizer (Motor mit Gängen, Reifen, Gras/Kies/Randstein, Wind, Crashs), ohne Tondateien.
- `world3d.js`: Baukasten für die Landschaften (Rauschen, Oberflächen mit Relief, Gelände, Wolken, Staub, Lichtstrahlen).
Texte im Spiel sind Deutsch (Schweizer Schreibweise, kein ß).

## Arbeitsweise

- Nach jeder Änderung committen und auf `main` pushen (Remote: github.com/pazoozooCH/lio-auto-saver).
- Das Spiel heisst „Car-Saver“ (früher „Auto-Retter“). Die `localStorage`-Schlüssel beginnen weiter mit `autoRetter`,
  damit Spielstände erhalten bleiben – nie umbenennen.
- Neue Spieldatei? In `.github/workflows/pages.yml` (Kopierliste) und in `APP_FILES` in `game.js` (Update-Knopf) eintragen.
- Die Versionsnummer ist die Anzahl Commits; `serve.py` erzeugt `version.js` daraus. `version.js` nie committen.

## Server und Tests

- Spiel für alle im LAN: Port **8123** (`.claude/launch.json` → `auto-retter`, `serve.py --host 0.0.0.0`).
  Dort liegt der echte Spielstand im `localStorage` – beim Testen nicht anfassen.
- Tests nur auf Port **8124** (`auto-retter-test`, nur `127.0.0.1`). Anderer Port = eigener `localStorage`.
  Auf 8124 zählt der Besucherzähler (`countVisit` in `online.js`) nicht mit.
- Prüfen: `node --check game.js`; die Module (alle anderen .js) als Modul prüfen: `node --input-type=module --check < race.js`
  (sonst werden z.B. doppelte `const` nicht gefunden). Dann im Browser auf 8124 ansehen; Spielzustand lässt sich per
  JavaScript setzen (`start(...)`, `openMenu('shop')`, `fleet`, `wallet` usw. sind globale Variablen).
- Rennen testen: `startRaceMode()`, dann liefert `window.__race()` das laufende Rennen (`input`, `me`, `cars`, `T`).
  Der Browser-Tab muss im Vordergrund sein, sonst läuft das Rennen kaum weiter.
- Dragrace testen: `openDragMenu(); dragPick = 0; startDragMode()`, dann `window.__drag()`; Gas/Schalten per Leertaste.
- Online testen: `openOnline()`. Zweiter Spieler über eine andere Herkunft (`127.0.0.1:8124` statt `localhost:8124`)
  oder per Skript mit einer zweiten Firebase-App (`initializeApp(CONFIG, 'bot')` + `inMemoryPersistence`).

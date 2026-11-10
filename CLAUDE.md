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
  Normale Autos (Limousine, Kompakt, Kombi, Sport, Coupé, SUV, Schrägheck, Pickup) haben eine echte Karosserie
  (`REAL` + `realBody`: Querschnitte, Radkästen, Kabine mit Säulen, gemalte Front/Heck); `{ classic: true }` = alte Kastenform.
- `city.js`: 3D-Stadt zum freien Herumfahren (Strassengitter, Häuser, Parks, Ampeln, Verkehr mit Abbiegen und Halten).
  Testen: `startCityMode()`, dann `window.__city()` (`me`, `cars`, `input`). 🚪/X: aussteigen und zu Fuss gehen (`city.walk`),
  einsteigen ins eigene Auto oder in eines der eigenen Base.
  Polizei nur nach einem Blitzer: Rotlicht-Kamera an jeder zehnten Ampel (`S.redCams`) oder Radarkasten (`S.speedCams`,
  mehr als 5 km/h über dem Limit); Tempolimit je Strasse in `streetLimit` (Ring 80, Mitte 30, sonst 50).
  Über 140 km/h geblitzt: 3 Minuten Gefängnis (Block 2,2), freikaufen 100 Münzen; Endzeit im Spielstand `autoRetterJail`.
  Weiter in der Stadt: Unfälle der Bots mit Stau (`stepAccidents`), Tank/Akku (`city.fuel`, Tankstelle mit Ladesäule),
  Schaden mit Kratzern und Werkstatt (`hurt`, Block 6,3, davor Parkplatz für den Auftrag Einparken), Wetter (`stepWeather`),
  Fahrschule (Auftrag `school`, Führerschein in `autoRetterLicense`) und Autohändler (Block 1,3, `cityDealer` in `game.js`).
  Blaue Zone (Block 3,6, `stepBlue`/`stepLot`): Verkehrsautos parkieren dort, mal viel los, mal ruhig; selber parkieren gibt
  Münzen, nach 3 Minuten (Parkscheibe) ein Strafzettel.
  Fussgänger (`stepPeds`): gehen um die Blöcke, überqueren bei Rot auf dem Zebrastreifen, Autos halten an (`followLimit`).
  Baustelle (`stepWorks`): sperrt ein Strassenstück, Verkehr fährt Umleitung (`isClosed` in `planTurn`).
  Eigenes Haus (Block 7,5, `stepHouse`): am Briefkasten kaufen und Gartensachen kaufen, Garage = gratis reparieren und tanken;
  Spielstand `autoRetterHouse`. Testen im Hintergrund-Tab: `window.__cityTick(n)` rechnet n Bilder.
  Freies Gelände: neben den Strassen darf man überall fahren (`allowedAt` + `offroadWhy` in outskirts.js: nicht ins Wasser,
  nicht über Autobahn-Leitplanken, nicht in gesperrte Gebiete); `groundAt` = Bodenhöhe genau wie das Gelände-Netz.
  Skifahren: zu Fuss zur Talstation (`LIFT` in country.js), X = Sessellift (`stepLift`), oben Ski an (`stepSki`).
  Dort auch das eigene Autohaus: sechs feste Plätze (3 Drehteller draussen, 3 im Ausstellungsraum), Bestellungen bringt der
  Autotransporter (`stepDelivery`), Kunden mit Wunsch und Beratung (💬/T), Spielstand `autoRetterShop` (stock, orders). Oben am Stadtrand ist Platz für sechs Basen nebeneinander (nur für echte Spieler, sonst Wiese): bis zu 10 ausgesuchte
  Autos (`baseGarage` in `game.js`, Spielstand `autoRetterBase`), dort Auto wechseln; online je Spieler eine (`rooms/<CODE>/bases`).
- `outskirts.js`: Gebiete ausserhalb des Stadtgitters (für `city.js`): Autobahn im Süden (Rechteck mit runden Ecken, 7,8 km, vier Spuren je Richtung; die Südgerade liegt auf
  einem zweiten Geländestück) mit Tempolimit 140, Raststätte an der Südgeraden (`REST`, Tanken über `REST_ZONES`; Autos fahren hinein, parkieren und wieder weg:
  `stepRestCar`, Wege mit `makePath`/`pathAt`), lange Staus
  (`startJam`, Zusatzautos verschwinden wieder). Viele Autos: nur die nächsten bekommen ein echtes 3D-Auto aus einem Vorrat
  (`POOL`), die anderen sind Klötze (InstancedMesh); weit weg nur jedes dritte Bild gerechnet (Verkehr mit
  Lastwagen, Normalen, Dränglern, Rasern; Tunnel mit Hügel, Baustelle mit Leitkegeln, Polizei jagt Raser,
  „Knapp vorbei“-Bonus über `hooks.nearMiss`; Unfälle mit Stau und Rettungsgasse: `startAccident`, Retter `cars.rescue`,
  wer die Gasse blockiert, bekommt über `hooks.gasse` einen Strafzettel), Hafen (Westen, ab 5 goldenen Schlüsseln), Flughafen (Osten, ab 12) und
  Passstrasse mit Höhe (Norden, ab 20; `passGround` = Bodenhöhe, `passTerrain` formt das Gelände). In der Stadt:
  Überraschungen (Feuer, Banküberfall, Notfall → Spital), 30 goldene Schlüssel (Spielstand `autoRetterKeys`).
- `country.js`: neue Gebiete draussen (für `city.js`, frei zugänglich): Bauernhof im Nordosten (Feldweg, Felder, Matsch,
  Kühe, Heuballen mit dem Traktor einsammeln, Traktor zum Einsteigen: `city.rides`), Strand im Westen (Promenade, Sand, Steg mit
  Boot: `city.boat`, fährt nur auf dem Wasser) und Skigebiet am Pass (Schnee ab Höhe 55, Sessellift, Skifahrer).
  Böden: `countrySurface` ('gravel', 'mud', 'sand', 'snow'), Wirkung in `stepMe` (`SURF`, `SURF_GRIP`).
- `stunt.js`: 3D-Stuntpark mit eigener Physik in der Höhe (Rampen als Formen in `SHAPES`, Looping, Feuerringe, Salto/Schraube).
  Testen: `startStuntMode()`, dann `window.__stunt()` (`me`, `input`, `score`).
- `viewer.js`: 3D-Ansicht eines Fahrzeugs zum Drehen (eigener Renderer, wird beim Schliessen freigegeben).
- `photo.js`: Fotos der 3D-Fahrzeuge für die Menüs (`drawVehiclePreview` in `game.js`); eigener Renderer, Fotos werden
  nach und nach gemacht (`work()` in der Hauptschleife) und die letzten 90 gemerkt. Ohne three.js bleibt die 2D-Zeichnung.
- `fx.js`: Kamera-Ansichten beim Fahren (`camView`; `cockpit` = Fahrersitz, Augen `eye` und Fahrer `driver` aus `buildCar`), Reifenrauch und Bremsspuren (Stadt, Rennen, Stuntpark); Driften selbst steckt in der Physik des jeweiligen Modus.
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

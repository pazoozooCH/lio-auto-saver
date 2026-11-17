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
  Geschwungene Strassen: gerechnet wird im geraden Gitter, nur das Bild wird verbogen (`warpXZ`/`warpRot`): jede Strasse eigene Welle
  (`SW`, fester Zufall), Blöcke verschieden gross (`SW.ox`/`SW.oz`), Stadt rund statt viereckig (`WARP_ROUND`),
  läuft draussen bis `WARP_OUT` (HALF + 160) sanft aus (auch das Gelände-Netz wird verbogen).
  Bewegung (Auto, zu Fuss, Verkehr) wird durch `warpStretch` geteilt: im Bild immer so schnell wie der Tacho.
  Kreisel an den Kreuzungen in `ROUND` (keine Ampel, `planTurn` fährt im Kreis, Vortritt vor der Einfahrt in `stepTraffic`);
  Abbiegen als Punkte-Weg (`c.turn.pts`, `turnAt`). Fussgängerzonen `PED` (`isPed`, gelten in `isClosed` als gesperrt):
  dort keine Strasse, Ampel, Haltestelle oder Spawn.
  Beim Bauen `warpStatic` (Formen und Instanzen mit Weltkoordinaten am Ursprung, lange Dreiecke geteilt), jedes Bild
  `warpFrame`/`unwarpFrame` in `render` (alles mit eigener Lage kurz verschieben); `userData.noWarp` = nicht verbiegen.
  Neue Effekte mit Weltkoordinaten (wie Rauch/Bremsspuren in `S.fx`) selbst mit `warpXZ` verschieben; Minikarte über `mp`.
  Runde Häuser: `roundRectPts`/`circlePts` + `prism` (Wand mit Fassade rundherum); Form per eigenem Zufall `shapeR`
  (Grösse/Höhe und damit die Dach-Schlüssel bleiben gleich): Turm mit Kuppel/Spitzdach (Kreis in `round` + Quadrat in `solid`),
  runde Ecke zur Kreuzung (zwei Rechtecke + Viertelkreis), weiche Kanten, Kasten.
  Block-Arten (`layR`, lockerer bauen): four (4 Häuser, dicht in der Mitte), three (+ Plätzchen/Grün), pair (+ Parkplatz und
  Grün, `fillQuad`), court (Haus rundherum mit Innenhof, `buildCourt`); freie Plätze verbrauchen gleich viel `r()` wie ein Haus.
  Drehung: `warpDir` dreht genau in die eigene Blickrichtung (sonst stehen Autos schief zur gebogenen Strasse).
  Karte: eine Weltkarte für alles (`drawWorldMap` → `S.worldMap` + genaueres Stadtbild `S.worldDet` (`DM`), Rechteck `WM`, Meer bis zum Rand, Stadt verbogen über `wmPt`; neu gemalt, wenn
  sich die Schlüssel ändern). Oben rechts runder Ausschnitt um den Spieler, vorne = oben, in Stadt und Vororten näher
  (`drawMinimap`); antippen = ganze Welt hochkant mit Namen (`city.bigMap`, `mapLabels`); dort zoomen (＋ − Mausrad, zwei
  Finger, bis 10×) und ziehen (`mapView`, `zoomMap`, `panMap`, `mapPoint` beachtet das gedrehte Handy), kurz antippen = zu. Auf dem Mond `drawMoonMap`.
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
  Spielstand `autoRetterHouse`. Haus von innen (Tür geht für den Besitzer zu Fuss auf, Kamera bleibt drinnen); Bett:
  X = schlafen bis 7 Uhr (`goSleep`/`stepSleep`, nur allein und ab 19 Uhr). Testen im Hintergrund-Tab: `window.__cityTick(n)` rechnet n Bilder.
  Freies Gelände: neben den Strassen darf man überall fahren (`allowedAt` + `offroadWhy` in outskirts.js: nicht ins Wasser,
  nicht über Autobahn-Leitplanken, nicht in gesperrte Gebiete); `groundAt` = Bodenhöhe genau wie das Gelände-Netz.
  Skifahren: zu Fuss zur Talstation (`LIFT` in country.js), X = Sessellift (`stepLift`), oben Ski an (`stepSki`).
  Fliegen: am Flughafen zu Fuss zum orangen Flugzeug (`S.areas.flyer`), X = einsteigen (`stepPlane`: rollen, ab ~150 km/h mit E/▲
  abheben, landen flach und langsam, sonst Bruch = zurück zur Piste). Tempomat über der km/h-Anzeige (`city.cruise`, C, + / −;
  höchstens die Höchstgeschwindigkeit des Autos). Stadtbild: Strassenbäume, Bänke, Läden mit Markisen, Balkone (Instanzen).
  Stadtleben: Läden über `openPanel` (Tankstellen-Snacks `gasShop`, Lackieren `paint`, Tuning `tuning` → `dealer.mod` in game.js
  speichert Farbe/Tuning, Drive-in `order`/`pickup`). Parkhaus (Block 4,2: `parkY`/`parkStep`/`parkBlocked`, Ebenen `city.pkL`),
  Kino (6,4: Film auf der Leinwand, X bei den Sitzen), Stadion (5,6: Spiel 14–22 Uhr, `S.match`).
  Verkehr (`setupTrafficSpecials`/`trafficSpecial`): Postautos an Haltestellen, Schulbus mit Blinklicht (nicht überholen),
  Ambulanz-Einsätze (`city.amb`, Platz machen), nachts keine Lastwagen (`c.off`), dafür Strassenwischer.
  Grafik-Stil: farbig, leicht cartoonartig (nicht fotorealistisch). Fassaden `facade(wall, frame, r, style)`: classic, ribbon,
  curtain, panel (glänzendes Glas mit Lichtstreifen, Rauheit/Metall- und Reliefbild); Glasbalkone, Solarzellen/Dachgärten
  (`roofSpots`). Pflanzen mit Farbverlauf (`shadeGeo`): Laubbäume, Tannen im Wald (`pines`), Büsche, Grasbüschel (4 einseitige
  Bilder, sonst dunkle Rückseite), Blumen – alles Instanzen, eigener Zufall `vr` (der Haupt-Zufall `r` darf sich nicht verschieben).
  Dichtes Gras um den Spieler (`stepGrass`, `GRASS`): wandert mit, nur wo `surfaceAt` = 'grass', fester Zufall je Feld (`gHash`).
  Figuren aus wenigen Stücken mit Vertex-Farben (`figMesh`, `faceParts`); `makePerson` würfelt Kleid, Frisur, Mütze, Tasche.
  Spielfigur zu Fuss: `makePlayer` (Gelenke für Knie/Ellbogen, `spin` für Saltos), `animatePlayer`; Tricks in `stepAir`
  (E/▲ springen, Q/▼ Backflip, rennend Doppel-Backflip, in der Luft ⬅️➡️ Pirouette; auch auf Ski).
  Dort auch das eigene Autohaus: sechs feste Plätze (3 Drehteller draussen, 3 im Ausstellungsraum), Bestellungen bringt der
  Autotransporter (`stepDelivery`), Kunden mit Wunsch und Beratung (💬/T), Spielstand `autoRetterShop` (stock, orders). Oben am Stadtrand ist Platz für sechs Basen nebeneinander (nur für echte Spieler, sonst Wiese): bis zu 10 ausgesuchte
  Autos (`baseGarage` in `game.js`, Spielstand `autoRetterBase`), dort Auto wechseln; online je Spieler eine (`rooms/<CODE>/bases`).
  Geparkte Autos (`city.parked`, Spielstand `autoRetterParked`, höchstens 200): nimmt man ein anderes Auto (Base oder geparkt),
  bleibt das bisherige stehen, wo man ausgestiegen ist; aus der eigenen Base jedes Auto beliebig oft (`switchCar(v, true)`).
  Weit weg erst gebaut, wenn man näher kommt (`stepParked`); Zusammenstösse über zwei Kreise in `S.round`; Base-Knopf 🧹 holt alle zurück.
  Karte: zu Fuss die Spielfigur (`mapPerson`), dein Auto und geparkte Autos als kleine Autos (`mapCar`).
- `outskirts.js`: Gebiete ausserhalb des Stadtgitters (für `city.js`): Autobahn im Süden (Rechteck mit runden Ecken, 7,8 km, vier Spuren je Richtung; die Südgerade liegt auf
  einem zweiten Geländestück) mit Tempolimit 140, Raststätte an der Südgeraden (`REST`, Tanken über `REST_ZONES`; Autos fahren hinein, parkieren und wieder weg:
  `stepRestCar`, Wege mit `makePath`/`pathAt`), lange Staus
  (`startJam`, Zusatzautos verschwinden wieder). Viele Autos: nur die nächsten bekommen ein echtes 3D-Auto aus einem Vorrat
  (`POOL`), die anderen sind Klötze (InstancedMesh); weit weg nur jedes dritte Bild gerechnet (Verkehr mit
  Lastwagen, Normalen, Dränglern, Rasern; Tunnel mit Hügel, Baustelle mit Leitkegeln, Polizei jagt Raser,
  „Knapp vorbei“-Bonus über `hooks.nearMiss`; Unfälle mit Stau und Rettungsgasse: `startAccident`, Retter `cars.rescue`,
  wer die Gasse blockiert, bekommt über `hooks.gasse` einen Strafzettel), Hafen (Westen, ab 5 goldenen Schlüsseln), Flughafen (Osten, ab 12) und
  Passstrasse mit Höhe (Norden, ab 20; `passGround` = Bodenhöhe, `passTerrain` formt das Gelände). Der Flughafen liegt im Autobahn-Ring
  (Ausfahrt `AIR_EXIT` innen an der oberen Geraden, Richtung Osten). In der Stadt:
  Überraschungen (Feuer, Banküberfall, Notfall → Spital), 30 goldene Schlüssel (Spielstand `autoRetterKeys`).
- `country.js`: neue Gebiete draussen (für `city.js`): Bauernhof auf der Alp am Pass (`ALP` in outskirts.js: ebene Wiese;
  Matsch, Kühe, Heuballen mit dem Traktor, Traktor zum Einsteigen: `city.rides`), Strand im Westen (Promenade, Sand, Steg mit
  Boot: `city.boat`), Skigebiet Schneeberg im Autobahn-Ring (`SKI`/`skiH`: Berg, `LIFTS` mit Sesseln, `PISTES`, Skidorf;
  Strasse von der Flughafen-Ausfahrt), Raumbahnhof `SPACE`. Schnee auf der Passstrasse ab Höhe 55.
  Böden: `countrySurface` ('gravel', 'mud', 'sand', 'snow'), Wirkung in `stepMe` (`SURF`, `SURF_GRIP`).
- `moon.js`: der Mond (für `city.js`, bei MOON weit weg): Krater (`moonGround`), Erde und Sterne, Mondbasis, Landefähre,
  Schweizer Fahne, Mondsteine (`stepMoon`), Mond-Buggy (`MOON_BUGGY` in `city.rides`). Hin und zurück mit der Mondrakete
  (Raumbahnhof `SPACE` in country.js, östlich der Stadt): `startLaunch`/`stepLaunch` in city.js; auf dem Mond wenig Schwerkraft
  (`city.moonOn`: Auto fliegt über Kraterränder, Figur springt hoch), schwarzer Himmel (`stepMoonEnv`).
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
- `suburbs.js`: Vororte ausserhalb des Rings (Ostquartier zwischen Stadt und Raumbahnhof, Westquartier zwischen Hafen und
  Autobahn): frei geschwungene Strassen (`SUBURBS[].roads`, kein Verkehr) mit Trottoir, Lampen, Wendeplatz; Einfamilienhäuser
  (Kreise in `round`), Schule mit Sportplatz, Quartierladen, Bäckerei, Spielplätze. `suburbDist` macht das Gelände flach
  (height in city.js) und hält den Wald fern, `suburbRoad` = Asphalt, `inSuburb` = Boden 0, Karte über `drawSuburbs`.
- `island.js`: die Insel. `setIsland(Punkte)` (in buildWorld von city.js: Autobahn, Pass, Gebiete, Vororte, Skigebiet …)
  legt die Küste je Richtung um alles herum, mit Abstand und Wellen (Buchten, Landzungen, nicht symmetrisch); im Westen die
  Bucht mit Strand und Hafen (`BAY`). `islandDist` (> 0 Land, < 0 Meer) braucht: height() in city.js (Klippen/Strand,
  Meeresgrund, tief draussen dunkel wie die Bodenplatte), `offroadWhy` ('water' = Auto nicht ins Meer), `inWater` (Boot
  überall rund um die Insel), Karte (`paintIsland`). Meer: grosse Fläche bei `SEA_Y`, Gelände-Netz 2 × 3400 m.
- `monaco.js`: Diamantinsel (wie Monaco) im Westen vor der Bucht (`MONACO` in island.js: Form, Hafenbecken, Landzunge
  mit Piste, Steg; `landDist` = Land irgendwo). Eigenes Gelände (`monGround`), Ringstrasse, Kehren zum Palast,
  Zufahrt Piste (`MON_ROADS`), Villen mit Pool, Palmen, Jachten; teure Autos auf dem Ring (`makeMonacoTraffic`/
  `stepMonacoTraffic`), Mietautos am Jachthafen (`city.rides`). Fähre (`FERRY`, `ferryAt`): Dock A am Frachthafen
  (Lücke in der Kaimauer), Dock B im Jachthafen; aufs Deck fahren/gehen und anhalten = Überfahrt (`stepFerry`,
  `city.ferryRide`, `onDeck` in allowedAt/groundAt); am anderen Kai wird sie gerufen. Boot: Steg auch dort
  (`city.boatAt`), Flugzeug: Welt bis x −2750. Himmel und Sterne wandern mit der Kamera (der Himmel ist ein Würfel).
- `look.js`: schöne Grafik für Stadt, Rennen, Stuntpark: Nachbearbeitung mit den Bibliotheken `postprocessing` und `n8ao`
  (Import-Map in `index.html`): weiche Schatten in Ecken (N8AO, `transparencyAware` aus = schnell), Leuchten, SMAA, ACES.
  `skyEnvironment` = Spiegelungen vom Himmel. Knopf ✨ in der Stadt (Spielstand `autoRetterGfx`); zu langsam = schaltet ab;
  nicht auf dem Handy (LITE) im Rennen/Stuntpark. Ohne Netz fehlt nur die Nachbearbeitung. Im Rennen braucht der
  Rückspiegel bei schöner Grafik ein eigenes Bild ohne Tonwert (`rtLin`), sonst wechseln die Shader jedes Bild.
- `world3d.js`: Baukasten für die Landschaften (Rauschen, Oberflächen mit Relief, Gelände, Wolken, Staub, Lichtstrahlen).
Texte im Spiel sind Deutsch (Schweizer Schreibweise, kein ß).

Meine Figur (game.js, Shop-Knopf 👕, `drawSkin`/`skinTap`, `SKIN_ITEMS`): Haut, Frisur, Farben gratis; Kopfbedeckung, Oberteil,
Hose, Schuhe, Extras kosten Münzen (zweimal tippen = kaufen). Spielstand `autoRetterSkin` = { tone, hair, hairCol, head, headCol,
top, topCol, legs, legsCol, shoes, shoesCol, extras[], owned[] }; city.js baut daraus die 3D-Figur (`loadSkin`, `makePlayer`).
Neue Teile: in `SKIN_ITEMS` (game.js), in `drawSkinFigure` (2D) und in `makePlayer` (3D) eintragen.

Tägliche Belohnung (game.js, `drawDaily`/`dailyTap`): 7-Tage-Kalender beim Start (Tag 1: 5 Münzen), Tag 7 mit Fahrzeug, verpasst = Tag 1;
Spielstand `autoRetterDaily` = { last, day }.

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

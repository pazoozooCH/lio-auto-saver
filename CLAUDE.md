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
  (`REAL` + `realBody`: Querschnitte, Radkästen, Kabine mit Säulen, gemalte Front/Heck, dunkle Seitenschweller, schwarzer
  Fensterrahmen); `{ classic: true }` = alte Kastenform. Scheiben `glassClear`: getönt, wenig Spiegelung (sonst wirken sie milchig),
  nur Vorderseite (vom Fahrersitz klar). Alte Kastenformen: Lichter vor die abgerundete Kante (bevel ≈ 0,08 m), Bus mit Front-/Heckscheibe (`ends`).
- `city.js`: 3D-Stadt zum freien Herumfahren (Strassengitter 10 × 10 Blöcke, Häuser, Parks, Ampeln, Verkehr mit Abbiegen und Halten).
  Umriss wie eine echte Stadt: Randblöcke in `MASK` sind frei (Wäldchen); `ORGANIC`-Blöcke (auch in MASK) sind Quartiere mit
  Gassen in Kurven (Gartenquartier SW, Sonnenhang NO → weiter ins Ostquartier; `SUBURBS` mit `inCity` in suburbs.js); Strassen nur, wo eine Seite ein Block ist (`segOn`,
  `blockOn`, `nodeSegs`; sonst gilt die Strasse als gesperrt über `isPed`). Anschlüsse am Stadtrand (Zufahrt, Hafen, Strand,
  Raumbahnhof, Pass) liegen bei ±320 (HALF); gespeicherte Autos, die jetzt in einem Haus stünden, kommen auf die Strasse (`parkFree`).
  Geschwungene Strassen: gerechnet wird im geraden Gitter, nur das Bild wird verbogen (`warpXZ`/`warpRot`): jede Strasse eigene Welle
  (`SW`, fester Zufall), Blöcke verschieden gross (`SW.ox`/`SW.oz`), Strassen schräg (`SW.kx`/`SW.kz`: Neigung, kleine
  Schritte, sonst faltet sich das Bild), acht Fussgängerzonen, zwölf Parks, Stadt rund statt viereckig (`WARP_ROUND`),
  läuft draussen bis `WARP_OUT` (HALF + 160) sanft aus (auch das Gelände-Netz wird verbogen).
  Bewegung (Auto, zu Fuss, Verkehr) wird durch `warpStretch` geteilt: im Bild immer so schnell wie der Tacho.
  Zusammenstösse des eigenen Autos: drei Kreise entlang des Autos (`carCircles`, halbe Breite 0,95 m, vorne/hinten bis zur
  Stossstange), Grössen durch `warpScale` geteilt (so passen sie zum verbogenen Bild).
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
  Karte: eine Weltkarte für alles (Bilder im Arbeitsspeicher, `CPU2D` = willReadFrequently: auf der Grafikkarte blieben sie bei knappem Grafikspeicher leer = ganz blau; `mapBlank` prüft alle 2 s; `drawWorldMap` → `S.worldMap` + genaueres Stadtbild `S.worldDet` (`DM`), Rechteck `WM`, Meer bis zum Rand, Stadt verbogen über `wmPt`; neu gemalt, wenn
  sich die Schlüssel ändern). Oben rechts runder Ausschnitt um den Spieler, vorne = oben, in Stadt und Vororten näher
  (`drawMinimap`); antippen = ganze Welt hochkant mit Namen (`city.bigMap`, `mapLabels`); dort zoomen (＋ − Mausrad, zwei
  Finger, bis 10×) und ziehen (`mapView`, `zoomMap`, `panMap`, `mapPoint` beachtet das gedrehte Handy). Kurz antippen (`mapTap`):
  beim eigenen Pfeil = zu, sonst Navi-Ziel 📍 (`setDest`, Bild → Gitter über `unwarpXZ`); Weg durch die Stadtstrassen (`makeRoute`,
  `bfs` über `segOn`), draussen gerade; Linie auf beiden Karten (`drawRoute`), Lichtstrahl am Ziel, Abstand oben links (antippen = löschen). Auf dem Mond `drawMoonMap`.
  Testen: `startCityMode()`, dann `window.__city()` (`me`, `cars`, `input`). 🚪/X: aussteigen und zu Fuss gehen (`city.walk`),
  einsteigen ins eigene Auto oder in eines der eigenen Base.
  Polizei nur nach einem Blitzer: Rotlicht-Kamera an jeder zehnten Ampel (`S.redCams`) oder Radarkasten (`S.speedCams`,
  mehr als 5 km/h über dem Limit); Tempolimit je Strasse in `streetLimit` (Ring 80, Mitte 30, sonst 50).
  Über 140 km/h geblitzt: 3 Minuten Gefängnis (Block 3,3), freikaufen 100 Münzen; Endzeit im Spielstand `autoRetterJail`.
  Autos klauen (`stealCar`, `canSteal`): zu Fuss zu einem fremden Verkehrsauto, X; Alarm (`city.alarm`, Warnblinker `hazardGroup`),
  gesucht `city.wanted` (⭐ je Auto, höchstens 3, `WANTED_TIME` ohne gesehen zu werden). `stepWanted`: Streifen im Verkehr sehen dich
  (`canSee`, Häuser dazwischen) → `startChase(c)` (der Streifenwagen selbst jagt); mehr Streifen über `ensurePatrols` (`c.patrol`).
  Aussteigen geht auch während der Jagd (`exitCar`), dann rennt ein Polizist nach (`P.cop`, `stepCop`, `makeCop`). Erwischt:
  Busse, `giveBack` gibt das Auto zurück und holt dein eigenes (`city.stolenFrom`, ein geparktes Auto); bei ⭐⭐⭐ Gefängnis.
  Lichter am eigenen Auto (`stepCarLights`, `makeLamps`: Leuchtpunkte dort, wo im Modell die Lampen sitzen – `modelLamps` in cars3d.js
  aus den Lampen-Materialien, `userData.lampPos`; sonst aus dem Umriss). Die echten Lampenformen leuchten selbst (`lampsWithShapes`:
  Dreiecke nach Farbe im Bild – orange = Blinker, rot hinten = Rück-/Bremslicht, weiss vorne = Scheinwerfer; ohne Orange blinkt der äussere
  Teil der Lampe; city.js legt leuchtende Überzüge darüber): Scheinwerfer nachts, Rück-/Bremslicht (Bremse), Blinker
  `,` `.` und Warnblinker `G` (Knöpfe ◀ ⚠️ ▶, `setBlink`, geht nach dem Abbiegen aus); zwei Lichtkegel aus den Scheinwerfern, hinten rotes
  Leuchten (Handy: nur ein Kegel). Motorklang je echtem Auto in sound.js (`KIND_PROFILE`: Zylinder, Drehzahlen, Turbo-Pfeifen, Kompressor,
  V8-Blubbern, Kreischen, Auspuff-Resonanz, `pops` = Klepfen); neues Auto = dort ein Profil eintragen.
  Weiter in der Stadt: Unfälle der Bots mit Stau (`stepAccidents`), Tank/Akku (`city.fuel`, Tankstelle mit Ladesäule),
  Schaden mit Kratzern, bei echten Modellen echte Beulen (`dentAt`: eigene Kopie der getroffenen Teile, `dropDents` beim Reparieren/Wechseln) und Werkstatt (`hurt`, pro Unfall nur ein Viertel von früher, Block 7,4, davor Parkplatz für den Auftrag Einparken), Wetter (`stepWeather`),
  Fahrschule (Auftrag `school`, Führerschein in `autoRetterLicense`) und Autohändler (Block 2,4, `cityDealer` in `game.js`).
  Blaue Zone (Block 4,7, `stepBlue`/`stepLot`): Verkehrsautos parkieren dort, mal viel los, mal ruhig; selber parkieren gibt
  Münzen, nach 3 Minuten (Parkscheibe) ein Strafzettel.
  Menschen sind fest (`people()`: Fussgänger, bestohlene Fahrer, Polizist): Auto stösst an (Kreise in `stepMe`, angefahren →
  `p.hitByMe`), zu Fuss wird man weggeschoben, Fussgänger warten, wenn du im Weg stehst.
  Fussgänger (`stepPeds`, `PEDS` 64, gezeichnet bis `PED_SEE`): gehen um die Blöcke, überqueren bei Rot auf dem Zebrastreifen, Autos halten an (`followLimit`).
  Charaktere `PED_TYPES` (Jogger, Senior mit Stock, Kind mit Ballon, mit Hund, Handy, Geschäftsmann, Tourist): `makeCharacter`,
  `stepCharacter` (Pausen, Sprüche beim Näherkommen/Hupen/gesucht über `pedSay`). Verkehr: `TRAFFIC` 64.
  Baustelle (`stepWorks`): sperrt ein Strassenstück, Verkehr fährt Umleitung (`isClosed` in `planTurn`).
  Eigenes Haus (Block 8,6, `stepHouse`): am Briefkasten kaufen und Gartensachen kaufen, Garage = gratis reparieren und tanken;
  Spielstand `autoRetterHouse`. Haus von innen (Tür geht für den Besitzer zu Fuss auf, Kamera bleibt drinnen); Bett:
  X = schlafen bis 7 Uhr (`goSleep`/`stepSleep`, nur allein und ab 19 Uhr). Testen im Hintergrund-Tab: `window.__cityTick(n)` rechnet n Bilder.
  Freies Gelände: neben den Strassen darf man überall fahren (`allowedAt` + `offroadWhy` in outskirts.js: nicht ins Wasser,
  nicht über Autobahn-Leitplanken, nicht in gesperrte Gebiete); `groundAt` = Bodenhöhe genau wie das Gelände-Netz.
  Skifahren: zu Fuss zur Talstation (`LIFT` in country.js), X = Sessellift (`stepLift`), oben Ski an (`stepSki`).
  Fliegen: am Flughafen zu Fuss zum orangen Flugzeug (`S.areas.flyer`), X = einsteigen (`stepPlane`: rollen, ab ~150 km/h mit E/▲
  abheben, landen flach und langsam, sonst Bruch = zurück zur Piste). Tempomat über der km/h-Anzeige (`city.cruise`, C, + / −;
  höchstens die Höchstgeschwindigkeit des Autos). Stadtbild: Strassenbäume, Bänke, Läden mit Markisen, Balkone (Instanzen).
  Stadtleben: Läden über `openPanel` (Tankstellen-Snacks `gasShop`, Lackieren `paint`, Tuning `tuning` → `dealer.mod` in game.js
  speichert Farbe/Tuning, Drive-in `order`/`pickup`). Parkhaus (Block 5,3: `parkY`/`parkStep`/`parkBlocked`, Ebenen `city.pkL`),
  Kino (7,5: Film auf der Leinwand, X bei den Sitzen), Stadion (6,7: Spiel 14–22 Uhr, `S.match`).
  Verkehr (`setupTrafficSpecials`/`trafficSpecial`): Postautos an Haltestellen, Schulbus mit Blinklicht (nicht überholen),
  Ambulanz-Einsätze (`city.amb`, Platz machen), nachts keine Lastwagen (`c.off`), dafür Strassenwischer.
  Grafik-Stil: farbig, leicht cartoonartig (nicht fotorealistisch) – die Autos selbst so echt wie möglich (Wunsch: nur richtige Autos;
  Lichter am Tag klares Glas, `MAT.head` heisst 'headlight' und wird nachts hell). Fassaden `facade(wall, frame, r, style)`: classic, ribbon,
  curtain, panel (glänzendes Glas mit Lichtstreifen, Rauheit/Metall- und Reliefbild); Glasbalkone, Solarzellen/Dachgärten
  (`roofSpots`). Pflanzen mit Farbverlauf (`shadeGeo`): Laubbäume, Tannen im Wald (`pines`), Büsche, Grasbüschel (4 einseitige
  Bilder, sonst dunkle Rückseite), Blumen – alles Instanzen, eigener Zufall `vr` (der Haupt-Zufall `r` darf sich nicht verschieben).
  Dichtes Gras um den Spieler (`stepGrass`, `GRASS`): wandert mit, nur wo `surfaceAt` = 'grass', fester Zufall je Feld (`gHash`), jedes Feld nur einmal geprüft (`city.grassCache`, sonst Ruckler alle 5 m);
  nicht auf der Raststätte (`inRest`), der Diamantinsel und in Senken am Wasser (`landRaw` < 0,15).
  Tempo: grosse InstancedMesh werden nach dem Bauen in Kacheln geteilt (`chunkInstances`, `CHUNK` 300 m, kleines weit weg aus:
  `stepChunks`); Schatten nur jedes zweite Bild (`render`); Autos bis `SEE` 115 m gezeichnet; Verkehrs- und geparkte Autos
  ab `LOD_NEAR` (42 m) als einfache Fassung (`makeFar`/`setLod` in cars3d.js: 3 statt ~45 Zeichen-Befehle, erst bei Bedarf gebaut);
  Speicher (Handy!): Auto-Vorlagen je Typ ohne Farbe (`buildCar` tauscht nur den Lack, `paintKey`; Ausnahme `COLOR_KINDS`),
  Figuren mit wenigen Segmenten (`G` in city.js). Prüfen: `performance.memory` nach dem Start der Stadt (zuletzt ~280 MB).
  `mergeStatic(decor, { bySig, tile })` fasst gleiche einfache Farben (nicht leuchtend, nicht durchsichtig) je 400-m-Kachel zusammen.
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
- `outskirts.js`: Gebiete ausserhalb des Stadtgitters (für `city.js`): Autobahn als grosser Ring um die ganze Insel (`HW`, Rechteck mit runden Ecken,
  12,2 km, vier Spuren je Richtung) mit Tempolimit 140; im Westen Schrägseilbrücke über die Hafenbucht (`BRIDGE`, Fahrbahnhöhe `hwY(s)`,
  `hwGround`; Fähre fährt darunter durch, `FERRY_GAP` ohne Pfeiler). Ausfahrten innen (`EXITS`, `exitGap`) zu den Zubringern `ROADS`
  (Flughafenstrasse z = 462 mit Zufahrt `RAMP` vom Südrand der Stadt, Flughafen und Skistrasse; Strasse zum Raumbahnhof;
  Nordstrasse durchs Tal zum Strand, Südstrasse am Flughafen vorbei, Strasse zum Skidorf, Bergpass-Zubringer (Ausfahrt Nord bei x = 450,
  östlich am Berg vorbei nach Süden und bei z = −360 nach Westen zum Anfang der Passstrasse); sieben Anschlüsse, Baustelle `RW` dazwischen); an jedem Anschluss geschwungene Aus- und Einfahrt
  für Richtung +s (`SLIPS`, Bézier-Kurven, `slipDist`, innere Leitplanke offen über `slipGap`), Raststätte an der Südgeraden (`REST`, Tanken über `REST_ZONES`; Autos fahren hinein, parkieren und wieder weg:
  `stepRestCar`, Wege mit `makePath`/`pathAt`), lange Staus
  (`startJam`, Zusatzautos verschwinden wieder). Viele Autos: nur die nächsten bekommen ein echtes 3D-Auto aus einem Vorrat
  (`POOL`), die anderen sind Klötze (InstancedMesh); weit weg nur jedes dritte Bild gerechnet (Verkehr mit
  Lastwagen, Normalen, Dränglern, Rasern; Tunnel mit Hügel, Baustelle mit Leitkegeln, Polizei jagt Raser,
  „Knapp vorbei“-Bonus über `hooks.nearMiss`; Unfälle mit Stau und Rettungsgasse: `startAccident`, Retter `cars.rescue`,
  wer die Gasse blockiert, bekommt über `hooks.gasse` einen Strafzettel; Gasse gut 5 m breit über `gasseOff`;
  Zusammenstösse mit dir über `hitBox`: Kapsel entlang des Fahrzeugs, Lastwagen schmal und lang statt grosser Kreis), Hafen (Westen, ab 5 goldenen Schlüsseln), Flughafen (Osten, ab 12) und
  Passstrasse mit Höhe (Norden, ab 20; `passGround` = Bodenhöhe, `passTerrain` formt das Gelände). Der Flughafen liegt an der Flughafenstrasse. In der Stadt:
  Überraschungen (Feuer, Banküberfall, Notfall → Spital), 30 goldene Schlüssel (Spielstand `autoRetterKeys`).
- `country.js`: neue Gebiete draussen (für `city.js`): Bauernhof auf der Alp am Pass (`ALP` in outskirts.js: ebene Wiese;
  Matsch, Kühe, Heuballen mit dem Traktor, Traktor zum Einsteigen: `city.rides`), Strand im Westen (Promenade, Sand, Steg mit
  Boot: `city.boat`), Skigebiet Schneeberg im Autobahn-Ring (`SKI`/`skiH`: Berg, `LIFTS` mit Sesseln, `PISTES`, Skidorf;
  Strasse von der Flughafenstrasse), Raumbahnhof `SPACE`. Schnee auf der Passstrasse ab Höhe 55.
  Böden: `countrySurface` ('gravel', 'mud', 'sand', 'snow'), Wirkung in `stepMe` (`SURF`, `SURF_GRIP`).
- `moon.js`: der Mond (für `city.js`, bei MOON weit weg): Krater (`moonGround`), Erde und Sterne, Mondbasis, Landefähre,
  Schweizer Fahne, Mondsteine (`stepMoon`), Mond-Buggy (`MOON_BUGGY` in `city.rides`). Hin und zurück mit der Mondrakete
  (Raumbahnhof `SPACE` in country.js, östlich der Stadt): `startLaunch`/`stepLaunch` in city.js; auf dem Mond wenig Schwerkraft
  (`city.moonOn`: Auto fliegt über Kraterränder, Figur springt hoch), schwarzer Himmel (`stepMoonEnv`).
- `stunt.js`: 3D-Stuntpark mit eigener Physik in der Höhe (Rampen als Formen in `SHAPES`, Looping, Feuerringe, Salto/Schraube).
  Testen: `startStuntMode()`, dann `window.__stunt()` (`me`, `input`, `score`).
- Handy (`MOBILE` in cars3d.js: Touch/iPhone/Android): leichte Modelle aus `models/m/` (gleicher Name, ~30–60k Dreiecke, Bilder 256 px;
  neues Modell = auch dort eine leichte Fassung ablegen), Update-Knopf holt dort nur `models/m/`; Stadt mit Pixeldichte bis 2,
  `makeQuality` nicht unter 1 (sonst verpixelt), erst unter 30 Bildern/s.
- `models/`: echte 3D-Automodelle (GLB, 1k-Texturen, möglichst unter ~30'000 Dreiecken). Eintragen in `MODELS` (cars3d.js):
  Datei, echte Länge (`len`), welche Typen (`kinds`), Nase (`forward`), Räder (`wheels`, Namen), weglassen (`drop`: Teile,
  `hide`: Materialien), `opaque` (fälschlich durchsichtig), Lack (`paint`, ein oder mehrere Materialien, wird grau gemacht und eingefärbt), `credit`.
  Box beim Vorbereiten genau messen (`setFromObject(…, true)`), sonst schweben gedrehte Modelle.
  Jedes echte Auto hat seinen eigenen Typ (Wunsch Lionel; zusätzliche Typen wie `tiguanx`, `bentley` … in game.js nach KINDS, Kopie
  des Grundtyps mit eigenem Namen). Technisch gingen auch mehrere Modelle je Typ (`modelOf` Liste, `modelFor`), wird aber nicht genutzt. Im Verkehr werden
  normale Autos ohne Modell (`SWAP` in city.js) durch echte ersetzt. In der Stadt fahren vor allem günstige Autos (Seltenheit gewöhnlich/ungewöhnlich, `cheap` in makeCar, selten ein teures);
  die teuren (selten/episch/legendär + Sportwagen, SLS) auf der Diamantinsel (`makeMonacoTraffic`, ohne Spezial-Lacke). `beacons` = Blaulichter aufs Dach (Krankenwagen).
  `prepareModel` wirft die leeren Knoten der Modell-Datei weg (sonst >1000 Objekte je Auto: updateMatrixWorld frass das ganze Bild), beim Stadtstart
  werden alle Varianten einmal gebaut und mitgezeichnet (`modelVariants`, `v.variant`: keine Shader-Ruckler später). Messen: Objekte zählen
  (`__cityS().scene.traverse`), Bildzeiten per requestAnimationFrame (Tab vorne).
  `prepareModel` fasst je Material zusammen: gespiegelte Teile umdrehen (`flipWinding`), alle Werte als Float32, Bilder nur
  UV-Lage 0 (`uv1` fällt weg, sonst Shader-Fehler = unsichtbare Teile), Ecken-Farben aus (`vertexColors`, sonst schwarz), mit Index zusammengefasst (Ecken geteilt, viel weniger Speicher als ohne Index), Teile ohne Bilder ohne UV, Normalen als Int8 (`packNormals`; `dentAt` macht sie vor dem Neu-Rechnen wieder genau); Räder als Kopie (Datei-Puffer wird frei).
  Fehlt metalness im Modell (glTF = 1), wird sie auf 0,25 gesetzt (sonst schwarz). Fahrersitz-Kamera: `modelEye` (hinter der
  Oberkante der Frontscheibe, Dach nur in der Mitte gesucht), sonst `eyeX`/`eyeY` in MODELS. Lichter nach Material-Namen
  (`LAMP_RE`) in `MODEL_LAMPS`, leuchten nachts (city.js); `blink` = Blaulicht (Polizei: Dodge Charger mit eigener Bemalung).
  Richtung prüfen: Kamera „vorne“ in der Stadt (`window.__citySwitch(v)`, `window.__cityCam(3)`) muss die Front zeigen. `hide` wirkt vor dem Messen
  (Teile weit weg verkleinern sonst das ganze Auto). `loadCarModels` lädt sie (auch vor der Stadt in game.js), `useModel` ersetzt das eigene Auto (gleiche
  Länge, Räder drehen, keine einfache Fassung). Ersteller in der Danke-Zeile im Startbild (game.js, `drawVersion`) nennen (CC BY).
  Marken sind im Moment erlaubt (Martin: privates Spiel). Neue Datei auch in `APP_FILES`; pages.yml kopiert den ganzen Ordner.
  Shop-Tore zurzeit zu (`GATES_OPEN` in game.js, Wunsch Lionel), Lack-Garage auch (`PAINTS_OPEN`); Spezial-Lacke und selbst lackierte Farben einmal von allen Autos entfernt (`autoRetterNoPaint`, auch geparkte/Autohaus). Lustige Namen der echten Autos (`MODEL_NAMES` in game.js, Reihenfolge je Typ wie in MODELS; `vehicleName(v)`, in city.js `vname`;
  neues Modell = auch hier einen Namen eintragen). Shop (Tore), Autohändler und Tagesgeschenk geben nur echte Autos: `MODEL_KINDS` in game.js (gleich halten mit `MODELS`);
  fehlt eine Seltenheit, kommt das echte Auto mit der nächsten (`modelKind`). Die Sammlung zeigt nur echte Autos (`collectionKinds`: `MODEL_KINDS` + eigene Eigenbauten); alte eigene Fahrzeuge bleiben in der Garage, Stadtverkehr bleibt wie er ist.
  Verkleinern ohne `simplifySloppy` (macht Dellen: Ecken nur nach Lage verbunden), lieber 90–150k Dreiecke und Bilder 512 px. Zu schwere Modelle verkleinern mit glTF-Transform (npm, nur in einem temporären Ordner): Innenraum/Motor weg, `simplify`
  (meshoptimizer), Bilder als JPG; Ziel ~30'000 Dreiecke, wenige MB. Beim Laden fasst `prepareModel` alle Nicht-Rad-Teile je Material zusammen.
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
- `sound.js`: Geräusche aus dem Synthesizer (Motor mit Gängen, Reifen, Gras/Kies/Randstein, Wind, Crashs). Für 15 echte Autos echte
  Motor-Aufnahmen von freesound.org (`SAMPLES`, Dateien `sounds/<typ>_idle.wav` und `_rev.wav`: ruhige Leerlauf-Stelle 1,5–3 s; nur im Leerlauf
  gespielt als lange, sanft überblendete Stücke von zufälligen Stellen `pieceLayer` – kurze Schleife klang wie Dampflok, Körnchen rauschten;
  beim Hochdrehen übernimmt der nachgebaute Motor; dort kein starkes Blubbern, Kreischen nicht in Stössen); Ersteller in der Danke-Zeile (game.js, umbrochen).
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
- `junkyard.js`: Schrottplatz an der Flughafenstrasse (`JUNK`, Zufahrt in `ROADS`): Zaun, rostige Schrottautos (einfache Fassung),
  Kran, Hütte. Teile (`PARTS`: Karosserie, Motor, Räder, Lenkrad, Sitze, Lichter) liegen an `SPOTS` (einsammeln, kommen nach
  1–2 Min. wieder), am gelben Feld `BENCH` kaufen und zusammenbauen (`stepJunk`/`junkPanel`/`junkBuild` in city.js →
  `cityDealer.junkBuild` in game.js). Spielstand `autoRetterJunk`. Eigenbau-Fahrzeuge in `KINDS` mit `junk: true`, `secret`
  (nicht im Shop, nicht verkaufbar), Seltenheit `eigenbau`; zuerst ein Typ, den man noch nicht hat; jedes mit eigener Farbe →
  eigenes Flickenmuster (`special: 'junk'`, `junkTexture` in cars3d.js; 3D: Grundform + `junkExtras`). Fertig steht es bei `BUILT`.
- `review.js`: Review-Seite für Lionel (3× auf „Ersteller: LIONEL“, `reviewTap` in game.js; nur freigeschaltete Geräte,
  beim ersten Mal Code-Abfrage → `reviewers/<uid>`): alle Autos in 3D, Blinker/Warnblinker/Nacht/Bremse, Delle/Reparieren,
  Motor mit Drehzahl-Regler, Kamera vorne/hinten/Seite/Fahrersitz; Findings nach `review/findings`. Technik je Auto (`carStats`:
  Dreiecke, Teile, Bilder, Grafikspeicher, Dateigrösse PC/Handy per HEAD, Masse, Lampen, Ton) und 📊 Tabelle aller echten Autos (sortierbar).
  **Findings lesen:** `node tools/findings.mjs` (offene), `--all`, `done <id> "Antwort"` nach dem Beheben.
- `carlamps.js`: Lichter (`makeLamps`/`setLamps`/`removeLamps`) und Beulen (`dentAt`/`dropDents`) der Autos, für city.js und review.js.
- `world3d.js`: Baukasten für die Landschaften (Rauschen, Oberflächen mit Relief, Gelände, Wolken, Staub, Lichtstrahlen).
Texte im Spiel sind Deutsch (Schweizer Schreibweise, kein ß).

Meine Figur (game.js, Shop-Knopf 👕, `drawSkin`/`skinTap`, `SKIN_ITEMS`): Haut, Frisur, Farben gratis; Kopfbedeckung, Oberteil,
Hose, Schuhe, Extras kosten Münzen (zweimal tippen = kaufen). Spielstand `autoRetterSkin` = { tone, hair, hairCol, head, headCol,
top, topCol, legs, legsCol, shoes, shoesCol, extras[], owned[] }; city.js baut daraus die 3D-Figur (`loadSkin`, `makePlayer`).
Neue Teile: in `SKIN_ITEMS` (game.js), in `drawSkinFigure` (2D) und in `makePlayer` (3D) eintragen.

Keine Fantasie-Fahrzeuge (game.js `RETIRED`): Drachen, Einhorn, Ufo usw. sind `secret` + `retired` (bleiben nur als Daten); eigene
werden beim Laden zu echten Autos gleicher Seltenheit (`realVehicle`), geparkte/Autohaus-Autos in city.js, `buildCar` zeigt sonst
immer das Ersatzauto. Episch/Legendär: echte Sportwagen (`supercar`, `hyperev`, `gtlegend`, `lemans`, `formula`, `luxlimo`, `gtcar`,
`luxsuv`, `musclegt`, `pickupxl`; Formen `REAL.supercar/hyperev/gt` in cars3d.js).

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

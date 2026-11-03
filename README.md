# Car-Saver

Ein Browser-Spiel: Autos fahren durch eine Fabrik mit hydraulischen Pressen. Tippe ein Auto an, damit es anhält,
und nochmals, damit es weiterfährt – so kommen alle heil zum Ausgang.

- 3D-Rennstrecken im F1-Stil: lenken, Gas, Bremse – vier Cups mit Pokalen, mehr PS = schneller;
  fünf Strecken (Alpen, Vulkan, Gletscher mit Tunnel, Wüsten-Canyon mit Brücken-Kreuzung, Dschungel) mit Steilkurven, Hügeln und Brücken
- 3D-Stadt zum freien Herumfahren: Häuser, Parks, Brunnen, Ampeln und viel Verkehr, der abbiegt, an Rot hält und hupt,
  Driften mit Handbremse (Rauch, Bremsspuren, Drift-Punkte) und Polizei, die bei Rot verfolgt und Strafzettel verteilt
- 3D-Stuntpark: Schanzen, Tabletop, Weitsprung, Mega-Rampe vom Turm, Looping, Halfpipe-Wände, Wellenbahn und Feuerringe;
  in der Luft Salto und Schraube, Punkte mit Combo, Rekord – Punkte geben Münzen (250 Punkte = 1 Münze)
- 3D-Dragster-Bahn: 402 m geradeaus, Startampel und selber schalten – der Gewinner bekommt das Auto des Verlierers
- Presse in einer 3D-Fabrikhalle: Autos retten bringt Münzen und +1 PS, zerquetscht kostet −3 PS
- Fahrzeugpark mit 110 Fahrzeugen in fünf Seltenheitsstufen, viele mit Spezialkräften
- Shop mit Garagentoren (Holz bis Obsidian), Spezial-Lacke (Gold, Regenbogen, Diamant, Obsidian)
- Münzen sammeln, Fahrzeuge verkaufen, Level werden schnell schwieriger
- Echte Geräusche aus dem Synthesizer: jedes Fahrzeug klingt nach seinem Antrieb (Diesel, V8, Rennmotor, Elektro, Düse …),
  dazu quietschende Reifen, Gras, Kies, Curbs, Wind und Crashs
- Online mit Freunden: Rennen (2–6 Spieler, freie Plätze fahren Bots, mit Remplern und Rückspiegel), Dragster 1 gegen 1,
  Stadt und Stuntpark zusammen herumfahren (bis 6) über einen 4-stelligen Raum-Code

**Online spielen:** https://pazoozooch.github.io/lio-auto-saver/

Läuft ohne Build: `index.html` + `game.js`, dazu `press3d.js`, `race.js`, `drag.js`, `cars3d.js` und `world3d.js` für die 3D-Grafik
sowie `tracks.js` für die Rennstrecken, `city.js` für die Stadt, `stunt.js` für den Stuntpark, `online.js` und `netcars.js`
für das Online-Spiel und `sound.js` für die Geräusche
(three.js wird aus dem Internet geladen; ohne Internet läuft die Presse in 2D). Der Spielstand liegt im `localStorage` des Browsers.

## Starten

```bash
python3 serve.py
```

Das Spiel ist dann unter `http://<Rechner-IP>:8123` im ganzen LAN erreichbar.
`serve.py` erzeugt dabei `version.js` aus Git: Versionsnummer = Anzahl Commits, dazu der Zeitpunkt des letzten Commits.
Die Version steht unten rechts auf dem Startbildschirm.

Nur lokal, z.B. zum Testen: `python3 serve.py --host 127.0.0.1 --port 8124`

## Veröffentlichung

Jeder Push auf `main` veröffentlicht das Spiel automatisch über GitHub Pages
(`.github/workflows/pages.yml`, inklusive erzeugter `version.js`).

## Online-Modus (Firebase)

Online spielen läuft ohne eigenen Server: Das Spiel verbindet sich direkt mit einer
**Firebase Realtime Database**. Was erlaubt ist, prüfen die Sicherheitsregeln auf dem Firebase-Server.

### So funktioniert es

- Jedes Gerät meldet sich **anonym** bei Firebase an (keine E-Mail, kein Passwort) und bekommt eine feste,
  nicht fälschbare Benutzer-ID.
- Ein Spieler erstellt einen **Raum** mit einem Code aus 4 Ziffern (z.B. `4821`). Dafür braucht es den **Freundes-Schlüssel**.
  Die anderen treten mit dem Raum-Code bei. Mit dem Häkchen **„🌍 Öffentlich“** steht der Raum zusätzlich
  bei allen im Online-Menü unter „Offene Räume“ und kann dort direkt angetippt werden.
- Der Gastgeber (👑) wählt beim Rennen die Strecke und startet. Alle Geräte starten zur selben Serverzeit (`.info/serverTimeOffset`).
- Jedes Gerät berechnet **nur sein eigenes Auto** und sendet Position, Richtung, Tempo und Fortschritt
  10× pro Sekunde. Die Autos der anderen werden geglättet und vorausberechnet angezeigt.
- **Kollisionen:** Berühren sich zwei Autos, schiebt jedes Gerät sein eigenes Auto weg.
  Wer auffährt, wird langsamer, wer angeschoben wird, bekommt Schwung.
- **Bots:** Sind weniger als 6 Spieler im Rennen, füllen Bots (🤖) die freien Startplätze. Sie werden nicht übers Netz
  geschickt: Jedes Gerät rechnet sie selbst, mit demselben Zufall (aus Raum-Code und Runde) und im festen Takt der
  gemeinsamen Uhr, darum fahren sie überall gleich. Spieler prallen an Bots ab, die Bots bleiben auf Kurs.
- **Stadt und Stuntpark** (freies Fahren): kein gemeinsamer Start – jeder tippt „Losfahren“, wann er will, und sieht
  alle, die gerade fahren (mit Namensschild, auf der Karte, im Stuntpark mit Punkteliste). Verkehr und Polizei rechnet
  jedes Gerät für sich. Wer zurück in den Raum geht, verschwindet bei den anderen.
- **Chat** (nur Stadt und Stuntpark online): feste Schnell-Nachrichten und Emojis, kein freier Text – auch in
  öffentlichen Räumen mit Fremden kann niemand etwas Gemeines schreiben. Gespeichert wird nur die Nummer des Spruchs
  (Liste `QUICK` in `chat.js`), höchstens eine Nachricht pro Sekunde und Spieler; sie erscheint als Sprechblase über dem Auto.
- Dragster: gemeinsame Startampel. Ein Frühstart kostet 1 Sekunde, die Zeiten werden verglichen.
- Online werden **keine Autos gewonnen oder verloren** und keine Pokale vergeben, es geht nur um Ruhm.
- Verlässt ein Spieler den Raum oder bricht seine Verbindung ab, löscht Firebase seinen Platz
  (`onDisconnect`). Beim Gastgeber wird der ganze Raum gelöscht.

Datenaufbau:

```
keys/<Schlüssel>: true                        Freundes-Schlüssel (nicht lesbar, nur per Admin-Zugang)
public/<CODE>: mode, name (Gastgeber), n (Spieler), state, created   Liste der öffentlichen Räume
rooms/<CODE>/  host, key, created, mode (race|drag|city|stunt), state (lobby|running), start,
               round (= Rennen × 8 + Strecke: so wählt der Gastgeber die Strecke ohne eigenes Feld in den Regeln)
rooms/<CODE>/players/<0–5>: uid, name, kind, color, special, ps
rooms/<CODE>/chat/<0–5>:    m (Nummer der Schnell-Nachricht 0–63), t (Serverzeit)
rooms/<CODE>/live/<0–5>:    x, z, h, v, p, g, fin, r (Runde), t (Serverzeit); freies Fahren: y (Höhe), a/b (Neigung), p (Stunt-Punkte), r = 0
```

### Einrichtung (bereits erledigt)

| Was | Wert |
|---|---|
| Firebase-Projekt | `lio-car-saver-de75a` (im privaten Google-Konto der Familie) |
| Tarif | **Spark (gratis)**, **kein Abrechnungskonto verknüpft** – es können keine Kosten entstehen |
| Realtime Database | `https://lio-car-saver-de75a-default-rtdb.europe-west1.firebasedatabase.app` (Belgien) |
| Anmeldung | Authentication → Anonym, mit „auto clean-up“ (anonyme Konten werden nach 30 Tagen gelöscht) |
| Web-App | „Car-Saver“, Konfiguration steht in `online.js` (`CONFIG`) |
| Google Analytics | aus |
| Regeln | `database.rules.json` |

Die Werte in `CONFIG` sind **nicht geheim**. Sie stehen bei jeder Firebase-Web-App im Code, den Schutz übernehmen die Regeln.

> ⚠️ In der Firebase-Konsole **nicht** auf „Upgrade auf Blaze“ klicken: Das würde eine Zahlungsart verknüpfen.
> Alles hier läuft im Gratis-Plan. Werden dessen Grenzen erreicht (100 gleichzeitige Verbindungen, 1 GB Speicher,
> 10 GB Download pro Monat), pausiert nur das Online-Spiel bis zum nächsten Monat.
> Der normale Spielstand liegt lokal im Browser und ist nie betroffen.

So wurde es eingerichtet (zum Nachvollziehen oder für ein neues Projekt):

1. In der [Firebase-Konsole](https://console.firebase.google.com) ein Projekt erstellen
   (Nutzungsbedingungen akzeptieren, Analytics aus).
2. APIs einschalten und die Datenbank anlegen:
   ```bash
   P=lio-car-saver-de75a; A=<privates-google-konto>
   gcloud services enable firebasedatabase.googleapis.com identitytoolkit.googleapis.com --project=$P --account=$A
   TOKEN=$(gcloud auth print-access-token --account=$A)
   curl -X POST -H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $P" -H "Content-Type: application/json" \
     -d '{"type":"DEFAULT_DATABASE"}' \
     "https://firebasedatabase.googleapis.com/v1beta/projects/$P/locations/europe-west1/instances?databaseId=$P-default-rtdb"
   ```
3. In der Konsole unter **Authentication** auf „Get started“ klicken und **Anonym** aktivieren
   (inklusive „auto clean-up“).
4. Web-App registrieren und ihre Konfiguration auslesen:
   ```bash
   curl -X POST -H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $P" -H "Content-Type: application/json" \
     -d '{"displayName":"Car-Saver"}' "https://firebase.googleapis.com/v1beta1/projects/$P/webApps"
   curl -H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $P" \
     "https://firebase.googleapis.com/v1beta1/projects/$P/webApps/<appId>/config"
   ```
5. Regeln hochladen und einen Freundes-Schlüssel anlegen (siehe unten).

### Pflege

Für alle Befehle zuerst:

```bash
A=<privates-google-konto>
DB=https://lio-car-saver-de75a-default-rtdb.europe-west1.firebasedatabase.app
TOKEN=$(gcloud auth print-access-token --account=$A)
```

**Regeln hochladen** (nach jeder Änderung an `database.rules.json`):

```bash
curl -X PUT -H "Authorization: Bearer $TOKEN" --data-binary @database.rules.json "$DB/.settings/rules.json"
```

**Freundes-Schlüssel** (nur mit Leuten teilen, die Räume erstellen dürfen; nie ins Repository schreiben):

```bash
curl -X PUT    -H "Authorization: Bearer $TOKEN" -d true "$DB/keys/<Schlüssel>.json"   # anlegen
curl           -H "Authorization: Bearer $TOKEN"         "$DB/keys.json"                # anzeigen
curl -X DELETE -H "Authorization: Bearer $TOKEN"         "$DB/keys/<Schlüssel>.json"   # sperren
```

Schlüssel immer **kleingeschrieben** anlegen: Das Spiel wandelt die Eingabe in Kleinbuchstaben um,
Gross-/Kleinschreibung spielt beim Eintippen also keine Rolle.
Erlaubte Zeichen: Buchstaben, Ziffern und `-` (kein `.`, `#`, `$`, `[`, `]`, `/`).
Wer den Schlüssel kennt, gibt ihn im Spiel einmal unter „Raum erstellen“ ein, das Spiel merkt ihn sich.
Zum Beitreten reicht der Raum-Code.

**Räume anzeigen oder alle löschen** (normalerweise nicht nötig, Räume räumen sich selbst auf):

```bash
curl -H "Authorization: Bearer $TOKEN" "$DB/rooms.json?shallow=true"
curl -X DELETE -H "Authorization: Bearer $TOKEN" "$DB/rooms.json"
```

### Schutz vor Missbrauch

Die Regeln in `database.rules.json` sorgen dafür:

- Lesen und Schreiben nur für angemeldete (anonyme) Nutzer und nur unter `rooms/` und `public/`.
  Die Raumliste unter `rooms/` ist nicht abrufbar, man sieht nur einen Raum, dessen Code man kennt.
  Lesbar für alle ist nur `public/` mit den freiwillig öffentlichen Räumen (Art, Gastgeber-Name, Spielerzahl).
  Eintragen darf dort nur der Gastgeber des Raums. Einträge ohne Raum darf jeder löschen.
- Räume erstellen nur mit gültigem Freundes-Schlüssel. Die Schlüssel selbst sind nicht lesbar.
- Jeder schreibt nur seinen eigenen Platz (`uid`). Start und Runde setzt nur der Gastgeber.
- Nur bekannte Felder mit geprüften Typen und Grössen (z.B. Name 1–16 Zeichen),
  höchstens 6 Plätze pro Raum, Positionen höchstens alle 40 ms.
- Löschen darf ein Raum nur der Gastgeber. Räume, die älter als 3 Stunden sind, darf jeder löschen.

Grenzen: Wer den Code liest, kann sich ebenfalls anonym anmelden und mit einem bekannten Raum-Code
innerhalb der Regeln mitspielen, zum Beispiel mit einem frechen Spitznamen. Mehr ist nicht möglich.
Schlimmstenfalls werden die Gratis-Grenzen erreicht, es entstehen aber keine Kosten.
Weitere mögliche Stufen, falls einmal nötig:

- den API-Schlüssel in der Google-Cloud-Konsole auf die eigenen Adressen beschränken
  (`pazoozooch.github.io`, `localhost`, LAN-Adresse);
- Firebase App Check mit reCAPTCHA.

### Testen

- Auf Port 8124 testen. Ein zweiter Spieler braucht eine **eigene Herkunft**, weil sich Tabs derselben Adresse
  die Anmeldung teilen: z.B. `http://localhost:8124` und `http://127.0.0.1:8124`, oder ein zweites Gerät.
- Ein Rennen läuft nur im Vordergrund-Tab weiter (der Browser bremst Hintergrund-Tabs).

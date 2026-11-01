# Car-Saver

Ein Browser-Spiel: Autos fahren durch eine Fabrik mit hydraulischen Pressen. Tippe ein Auto an, damit es anhält,
und nochmals, damit es weiterfährt – so kommen alle heil zum Ausgang.

- 3D-Rennstrecke im F1-Stil: lenken, Gas, Bremse – vier Cups mit Pokalen, mehr PS = schneller
- 3D-Dragster-Bahn: 402 m geradeaus, Startampel und selber schalten – der Gewinner bekommt das Auto des Verlierers
- Presse in einer 3D-Fabrikhalle: Autos retten bringt Münzen und +1 PS, zerquetscht kostet −3 PS
- Fahrzeugpark mit 60 Fahrzeugen in fünf Seltenheitsstufen, viele mit Spezialkräften
- Shop mit Garagentoren (Holz bis Obsidian), Spezial-Lacke (Gold, Regenbogen, Diamant, Obsidian)
- Münzen sammeln, Fahrzeuge verkaufen, Level werden schnell schwieriger

**Online spielen:** https://pazoozooch.github.io/lio-auto-saver/

Läuft ohne Build: `index.html` + `game.js`, dazu `press3d.js`, `race.js`, `drag.js`, `cars3d.js` und `world3d.js` für die 3D-Grafik
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

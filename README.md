# Auto-Retter

Ein Browser-Spiel: Autos fahren durch eine Fabrik mit hydraulischen Pressen. Tippe ein Auto an, damit es anhält,
und nochmals, damit es weiterfährt – so kommen alle heil zum Ausgang.

- Fahrzeugpark mit 60 Fahrzeugen in fünf Seltenheitsstufen, viele mit Spezialkräften
- Shop mit Garagentoren (Holz bis Obsidian), Spezial-Lacke (Gold, Regenbogen, Diamant, Obsidian)
- Münzen sammeln, Fahrzeuge verkaufen, Level werden schnell schwieriger

Läuft ohne Build und ohne Abhängigkeiten: `index.html` + `game.js`. Der Spielstand liegt im `localStorage` des Browsers.

## Starten

```bash
python3 serve.py
```

Das Spiel ist dann unter `http://<Rechner-IP>:8123` im ganzen LAN erreichbar.
`serve.py` erzeugt dabei `version.js` aus Git: Versionsnummer = Anzahl Commits, dazu der Zeitpunkt des letzten Commits.
Die Version steht unten rechts auf dem Startbildschirm.

Nur lokal, z.B. zum Testen: `python3 serve.py --host 127.0.0.1 --port 8124`

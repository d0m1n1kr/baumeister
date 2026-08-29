# Weiche für die alte Adresse

Das Spiel lag bis v4.2.0 unter `d0m1n1kr.github.io/tiny-towns/`. Beim
Umbenennen des Repositories wandert die Pages-Adresse mit — und anders als bei
`git clone` richtet GitHub für Pages **keine** Weiterleitung ein
([Doku](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository)).
Ohne Weiche liefen geteilte Challenge-Links und installierte PWAs ins Leere.

`index.html` und `sw.js` in diesem Ordner sind diese Weiche. Sie gehören
**nicht** in dieses Repository, sondern in ein eigenes, das den alten Namen
trägt:

1. Neues, öffentliches Repository `tiny-towns` anlegen (leer).
2. `index.html` und `sw.js` aus diesem Ordner hineinlegen.
3. Settings → Pages → Source: *Deploy from a branch*, Branch `main`, Ordner `/`.

Danach führt jeder alte Link auf die neue Adresse — samt Fragment, also öffnet
eine geteilte Tages-Challenge weiterhin genau ihren Tag.

## Warum `sw.js` dazugehört

Eine Weiche allein reicht nicht für die Leute, die das Spiel unter der alten
Adresse schon benutzt haben. Dort liegt ein installierter Service Worker mit
vollem Cache; der beantwortet jede Navigation aus dem Cache, ohne das Netz zu
fragen. Die Weiche würde nie geladen, die alte App liefe einfach weiter — auf
ewig, auch nach einem Neuladen.

Die Datei einfach wegzulassen hilft nicht: Läuft die Update-Prüfung des
Browsers ins 404, bleibt der alte Worker bestehen. Er muss **ersetzt** werden.
`sw.js` ist deshalb ein Worker, der genau eine Aufgabe hat — sich selbst zu
entfernen und die offenen Fenster neu zu laden. Danach geht die nächste
Anfrage ans Netz und die Weiche greift.

Wichtig dabei: `github.io` ist **ein** Ursprung für alle Projektseiten eines
Kontos. `caches.keys()` und `getRegistrations()` sehen dort auch die neue App
unter `/baumeister/`. Aufgeräumt wird deshalb ausschließlich, was zum alten
Pfad gehört — sonst reißt die Weiche bei jedem Aufruf die frische
Installation mit.

`scripts/smoke-umzug.mjs` stellt den ganzen Ablauf lokal nach (alte App mit
cachendem Worker → echte Dateien aus diesem Ordner → Umzug) und prüft beides:
dass der Umzug samt Fragment ankommt und dass die neue App unangetastet bleibt.

## Nebenwirkung, bewusst in Kauf genommen

Solange die Weiche steht, existiert der alte Name als Pfad weiter. Sie ist
gedacht als Übergang, nicht als Dauerzustand: Wenn absehbar niemand mehr die
alte Adresse installiert hat (Erfahrungswert: ein halbes bis ein Jahr), kann
das Weichen-Repository gelöscht werden.

Laut GitHub-Doku bricht ein Repository mit dem alten Namen die
Git-Weiterleitung auf das umbenannte Repository. Das ist hier folgenlos: Die
Remote-URL des eigenen Klons wird einmal von Hand umgestellt
(`git remote set-url origin …`).

Zum Löschen gehört dann auch `sw.js`: Es ist bewusst ein Worker ohne
`fetch`-Handler, der sich bei jeder Aktivierung selbst abmeldet — er kann also
nichts festhalten, was das Löschen später erschweren würde.

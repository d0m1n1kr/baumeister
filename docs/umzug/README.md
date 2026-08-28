# Weiche für die alte Adresse

Das Spiel lag bis v4.2.0 unter `d0m1n1kr.github.io/tiny-towns/`. Beim
Umbenennen des Repositories wandert die Pages-Adresse mit — und anders als bei
`git clone` richtet GitHub für Pages **keine** Weiterleitung ein
([Doku](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository)).
Ohne Weiche liefen geteilte Challenge-Links und installierte PWAs ins Leere.

`index.html` in diesem Ordner ist diese Weiche. Sie gehört **nicht** in dieses
Repository, sondern in ein eigenes, das den alten Namen trägt:

1. Neues, öffentliches Repository `tiny-towns` anlegen (leer).
2. `index.html` aus diesem Ordner als einzige Datei hineinlegen.
3. Settings → Pages → Source: *Deploy from a branch*, Branch `main`, Ordner `/`.

Danach führt jeder alte Link auf die neue Adresse — samt Fragment, also öffnet
eine geteilte Tages-Challenge weiterhin genau ihren Tag.

## Nebenwirkung, bewusst in Kauf genommen

Solange die Weiche steht, existiert der alte Name als Pfad weiter. Sie ist
gedacht als Übergang, nicht als Dauerzustand: Wenn absehbar niemand mehr die
alte Adresse installiert hat (Erfahrungswert: ein halbes bis ein Jahr), kann
das Weichen-Repository gelöscht werden.

Laut GitHub-Doku bricht ein Repository mit dem alten Namen die
Git-Weiterleitung auf das umbenannte Repository. Das ist hier folgenlos: Die
Remote-URL des eigenen Klons wird einmal von Hand umgestellt
(`git remote set-url origin …`).

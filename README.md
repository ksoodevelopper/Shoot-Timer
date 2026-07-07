# Shot Timer

Application statique prête pour GitHub Pages.

## Déploiement GitHub Pages

1. Crée un repository GitHub.
2. Envoie les fichiers `index.html`, `styles.css`, `app.js` et `.nojekyll` à la racine du repository.
3. Ouvre `Settings` > `Pages`.
4. Choisis `Deploy from a branch`.
5. Sélectionne `main` et `/root`, puis sauvegarde.
6. Ouvre l’URL GitHub Pages en `https://...github.io/...`.

Le micro fonctionne sur GitHub Pages parce que le site est servi en HTTPS. En local, utilise plutôt un serveur `localhost`; certains navigateurs bloquent le micro avec un simple double-clic sur le fichier.

## Fichiers

- `index.html` : structure de l’application.
- `styles.css` : interface compacte et responsive.
- `app.js` : timer, Web Audio, détection micro, historique et export CSV.

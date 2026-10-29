# YouTube Auto Skip

Extension Chrome (Manifest V3) qui clique automatiquement sur le bouton « Ignorer » des publicités YouTube dès qu'il apparaît.

## Fonctionnement

- S'exécute uniquement sur `https://www.youtube.com/*` et `https://m.youtube.com/*`.
- Un `MutationObserver`, limité à une vérification par frame via `requestAnimationFrame`, surveille la page.
- Le clic n'a lieu que si le bouton est réellement visible (`offsetParent` non nul et `visibility` différent de `hidden`).
- Fonctionne avec la navigation SPA de YouTube (pas de rechargement entre les vidéos).
- Chaque skip est affiché dans la console avec le préfixe `[YouTube Auto Skip]`.
- Aucune permission demandée dans le manifest.

## Installation

1. Ouvrir `chrome://extensions` dans Chrome.
2. Activer le **mode développeur** (interrupteur en haut à droite).
3. Cliquer sur **Charger l'extension non empaquetée**.
4. Sélectionner le dossier de ce projet (celui qui contient `manifest.json`).
5. Ouvrir YouTube : les messages `[YouTube Auto Skip]` apparaissent dans la console (F12) à chaque pub ignorée.

Après une modification du code, cliquer sur l'icône de rechargement de l'extension dans `chrome://extensions`, puis recharger l'onglet YouTube.

## Limites connues

- Les publicités **non ignorables** n'ont pas de bouton « Ignorer » : elles ne peuvent pas être sautées.
- Les **sélecteurs peuvent casser** si YouTube modifie son interface ; il faudra alors mettre à jour la liste `SKIP_SELECTORS` dans `content.js`.
- L'extension ne bloque pas les publicités : elle clique seulement sur « Ignorer » quand YouTube le propose, après le délai imposé par la pub.

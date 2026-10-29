# YouTube Auto Skip

Extension Chrome (Manifest V3) qui clique automatiquement sur le bouton « Ignorer » des publicités YouTube dès qu'il apparaît.

## Fonctionnement

- S'exécute uniquement sur `https://www.youtube.com/*` et `https://m.youtube.com/*`.
- Un `MutationObserver`, limité à une vérification par frame via `requestAnimationFrame`, surveille la page.
- Le clic n'a lieu que si le bouton est dans le lecteur vidéo, réellement visible (`offsetParent` non nul, `visibility` différent de `hidden`) et non recouvert par un autre élément.
- Continue de fonctionner quand l'onglet YouTube est en arrière-plan.
- Depuis la v2, clique aussi sur « Ignorer l'enquête » (pubs à sondage), repéré par son libellé (FR/EN) dans les conteneurs de pub.
- Fonctionne avec la navigation SPA de YouTube (pas de rechargement entre les vidéos).
- Chaque skip est affiché dans la console avec le préfixe `[YouTube Auto Skip]`.
- Depuis la v3, le clic est envoyé via l'API `chrome.debugger` (permission `debugger`) : YouTube ignore les clics générés par script, seuls les vrais clics souris passent. Chrome affiche brièvement la bannière « YouTube Auto Skip débogue ce navigateur » au moment du clic. Rien d'autre n'est demandé, et le service worker n'accepte que les messages venant de YouTube.
- Avant chaque clic, le service worker vérifie lui-même, via le débogueur et dans un contexte que la page ne peut pas modifier, que l'élément sous le pointeur est bien un bouton « Ignorer » du lecteur. Sinon, le clic n'est pas envoyé.

## Installation

Récupérer d'abord le code, de l'une de ces deux façons :

- **Archive zip** (depuis les [Releases GitHub](https://github.com/quenaultthomas/youtube-auto-skip/releases)) : la décompresser dans un dossier **qui doit rester en place**, Chrome le relit à chaque démarrage.
- **Git** : `git clone https://github.com/quenaultthomas/youtube-auto-skip.git`

Puis, dans Chrome :

1. Ouvrir `chrome://extensions` dans Chrome.
2. Activer le **mode développeur** (interrupteur en haut à droite).
3. Cliquer sur **Charger l'extension non empaquetée**.
4. Sélectionner le dossier de ce projet (celui qui contient `manifest.json`).
5. Ouvrir YouTube : les messages `[YouTube Auto Skip]` apparaissent dans la console (F12) à chaque pub ignorée.

À l'installation, Chrome indique que l'extension peut « accéder au débogueur de pages » : c'est la permission `debugger`, nécessaire pour envoyer un vrai clic.

Après une modification du code, cliquer sur l'icône de rechargement de l'extension dans `chrome://extensions`, puis recharger l'onglet YouTube.

## Générer l'archive à partager

```sh
./build.sh
```

Crée `dist/youtube-auto-skip-<version>.zip` (le numéro vient de `manifest.json`).

## Limites connues

- Les publicités **non ignorables** n'ont pas de bouton « Ignorer » : elles ne peuvent pas être sautées.
- Les **sélecteurs peuvent casser** si YouTube modifie son interface ; il faudra alors mettre à jour la liste `SKIP_SELECTORS` dans `content.js` **et** dans `background.js`.
- À chaque clic, Chrome affiche un court instant la bannière de débogage. Si vous cliquez sur « Annuler » dans cette bannière, le clic en cours est abandonné.
- L'extension ne bloque pas les publicités : elle clique seulement sur « Ignorer » quand YouTube le propose, après le délai imposé par la pub.

# Journal des modifications

Les fichiers publiés ne sont jamais retirés : chaque version ajoute ou corrige, sans casser l'existant.

## 2026-11-27 (export et import dans Réglages)
- L'export et l'import des réglages en JSON quittent l'onglet Publication : ils forment le sous-onglet « Export et import » de Réglages. Le contenu et le fonctionnement ne changent pas.

## 2026-11-27 (barre commune de l'éditeur)
- Barre commune à tous les widgets (fichier partagé `commun/barre.js` et `commun/barre.css`) : nom du widget et statut à gauche, onglets Réglages, En-tête et pied, Aperçu, Publication au centre, Enregistrer à droite ; barre collante en haut de l'écran.
- Les rubriques propres à l'éditeur deviennent des sous-onglets de Réglages.

## 2026-11-27 (publication réservée)

### Ajouté

- Onglet Publication : rappel de la différence entre page publique et accès réservé aux personnes invitées, avec un lien réservé à copier pour le catalogue.

## 2026-11-26 (vérifications)

### Vérifié
- Envoi anonyme depuis une page d'un autre domaine : texte, choix multiples avec « Autre », date et heure, heure, lien, classement, tableau, courriel, y compris dans les colonnes ajoutées au formulaire après sa publication.
- Écriture de la configuration depuis une page Grist en pleine page (`?style=light`).

### Modifié
- Le dépôt de fichiers n'est plus proposé : Grist refuse l'enregistrement d'un fichier déposé par une personne anonyme (« Cannot access attachment »). L'éditeur ne propose plus le type « Fichiers joints » ni les colonnes fichier existantes, et signale une question fichier déjà présente dans une configuration. Pour récupérer un document, utiliser une question de type adresse web.

## 2026-11-26

### Ajouté
- Nouveaux types de réponse : adresse web (lien), heure, date et heure (colonne Grist avec fuseau Europe/Paris, valeur enregistrée en secondes comme Grist l'attend).
- Options facultatives par question : nombre minimal et maximal de choix, choix « Autre » avec précision (colonne dédiée créée à l'enregistrement), réponse par défaut, ordre aléatoire des choix, libellé du milieu sur une échelle.
- Classement par ordre : glisser-déposer et boutons Monter / Descendre, annonce vocale de la position, réponse dans une seule cellule (liste de choix ordonnée).
- Tableau de choix (matrice) : une colonne de choix par ligne, créée à l'enregistrement ; réponse exigée par ligne si le tableau est obligatoire.
- Médias dans la page : image (texte alternatif réclamé), son et vidéo (transcription réclamée), PDF intégré ou en lien. Adresses `https://` uniquement.
- Éditeur : éléments déplaçables par glisser-déposer, d'une étape à l'autre, en plus des boutons.
- Les colonnes créées par le questionnaire (précision « Autre », lignes de tableau) sont ajoutées automatiquement au formulaire publié à la connexion.
- Politique de sécurité : `media-src` ouvert aux adresses `https:` pour lire son et vidéo.
- Tests automatiques du rendu public et de l'éditeur (`tests/`).

### Corrigé
- Éditeur : un clic sur un bouton juste après une saisie de texte pouvait être perdu, car la liste de gauche était reconstruite pendant le clic. Seul l'intitulé est maintenant mis à jour sur place.

## 2026-11-25 (mention de conception)

### Ajouté
- Mention discrète en pied de page, sur l'outil comme sur ses pages publiques : « Widget conçu par le Lab 17 bis, le laboratoire d'innovation publique de l'académie de Reims ».

## 2026-11-25 (audit de sécurité)

### Sécurité
- Les liens venant des données ou des réglages sont vérifiés par le navigateur lui-même : une adresse déguisée (« java⇥script: » avec tabulation, retour à la ligne ou caractère de contrôle) n'est plus acceptée. Elle permettait, sur le portail, d'exécuter du script au clic depuis une adresse fabriquée.
- Politique de sécurité de contenu stricte : seuls les scripts du site, l'API Grist et les scripts de la page connus par leur empreinte peuvent s'exécuter. L'évaluation de texte (« unsafe-eval ») reste permise : l'API officielle de Grist en a besoin (sans elle, les widgets restaient bloqués sur « Chargement… » dans Grist le 25/11 au matin). Un script injecté (lien javascript:, attribut onerror…) est bloqué même si un filtre le laissait passer.
- Feuilles de style du DSFR chargées depuis le CDN : empreinte d'intégrité (SRI), le navigateur refuse un fichier modifié.
- Code d'intégration (iframe) : le titre est échappé, un guillemet ne casse plus le code collé sur un autre site.

## 2026-11-24 (durcissement)

### Sécurité
- Les pages ajoutent une politique de sécurité de contenu minimale (pas d'objets embarqués, pas de balise base).

## 2026-11-24

### Modifié
- Documentation : l'outil de consultation s'appelle désormais `grist-consultation` (ancien nom `grist-decision`).

# grist-questionnaire

> **Widget de mise en page pour Grist, clé en main.** Il transforme une table Grist en questionnaire en ligne au Système de design de l'État (DSFR), avec logique conditionnelle et plusieurs étapes. Les réponses arrivent dans la table Grist.

Tout se règle dans Grist, sans toucher au code : questions, étapes, conditions, textes, en-tête et pied de page. Le dépôt ne contient que le code : aucune donnée, aucune réponse.

## À quoi ça sert

Le formulaire natif de [Grist](https://lasuite.numerique.gouv.fr/produits/grist) ne gère ni la logique conditionnelle, ni les questionnaires en plusieurs étapes, et son apparence n'est pas celle des sites de l'État. Ce widget comble ces manques, dans l'esprit d'outils comme Tally, en restant dans l'écosystème de l'État (Grist de La Suite numérique, DSFR).

| Page | Pour qui | Rôle |
| --- | --- | --- |
| `editeur.html` | La personne qui conçoit le questionnaire | Widget à placer dans un document Grist : étapes, questions, textes, conditions, en-tête et pied de page, aperçu, publication |
| `formulaire.html` | Les personnes qui répondent | Page web autonome au DSFR, en pleine page, accessible par un lien public ou intégrable dans un autre site |

Usages possibles : inscription à un événement, demande d'accompagnement, appel à projets, enquête, recueil de besoins, candidature…

## Ce que le widget sait faire

- **Logique conditionnelle** : une étape, une question ou un bloc de texte s'affiche seulement si les réponses précédentes le justifient.
  - Règles combinées par ET ou par OU.
  - Opérateurs adaptés au type de question : est / n'est pas, contient, supérieur / inférieur, avant / après, coché / non coché, renseigné / non renseigné.
  - Conditions en cascade : une question masquée compte comme vide.
  - Une étape masquée est sautée, et les réponses aux questions masquées ne sont pas envoyées.
- **Plusieurs étapes**, avec l'indicateur d'étapes du DSFR.
- **Notes sur une échelle** réglable (de 1 à 5, de 0 à 10…), avec le sens des notes extrêmes, pour les enquêtes de satisfaction.
- **Composants DSFR** : champs de saisie, boutons radio, cases à cocher, listes déroulantes, interrupteurs, dépôt de fichiers, encadrés, alertes.
- **Messages d'erreur DSFR**, avec un récapitulatif cliquable en haut de page.
- **En-tête et pied de page** configurables : bloc-marque, logo, titre, sous-titre, boutons, liens et logos de pied de page, mention d'accessibilité.
- **Message de confirmation** et **mentions sur les données personnelles** personnalisables.
- **Intégration** dans un autre site (iframe, sans en-tête ni pied de page).
- **Export et import** des réglages, pour réutiliser un questionnaire dans un autre document.

## Le brancher en 5 minutes

1. **Ajouter l'éditeur** : dans un document Grist, même vide, ajoutez une page *Personnalisé* sur la table qui recevra les réponses, avec l'adresse `https://lab17bis.github.io/grist-questionnaire/v1/editeur.html`, et accordez l'**accès complet**.
2. **Démarrer** : l'éditeur prépare un questionnaire à partir des colonnes de la table, ou propose *Partir du questionnaire d'exemple* (inscription à un atelier, avec une condition). Les colonnes nécessaires sont créées pour vous.
3. **Construire** le questionnaire dans l'éditeur, puis cliquer sur *Enregistrer*.
4. **Publier le formulaire Grist** de la même table (une seule fois) et copier son lien de partage.
5. **Diffuser** : dans l'onglet *Publication* de l'éditeur, collez ce lien et cliquez sur *Vérifier et connecter*. L'éditeur donne le lien DSFR à diffuser :
   `https://lab17bis.github.io/grist-questionnaire/v1/formulaire.html?grist=<lien du formulaire publié>`

Ne diffusez pas le lien du formulaire Grist natif : il ignore la logique conditionnelle.

Le modèle [`modele/modele-grist-questionnaire.grist`](modele/modele-grist-questionnaire.grist) reste disponible pour qui préfère importer un document tout prêt.

## Le régler

| Onglet de l'éditeur | Ce qu'on y règle |
| --- | --- |
| Questions | Étapes, questions (à partir des colonnes existantes ou de nouvelles colonnes), blocs de texte, conditions d'affichage |
| Textes | Titre, introduction, bouton d'envoi, message de confirmation, mentions sur les données |
| En-tête et pied | Logo, bloc-marque, titre, sous-titre, boutons, pied de page, mention d'accessibilité |
| Aperçu | Le questionnaire tel qu'il s'affichera, conditions comprises |
| Publication | Connexion au formulaire publié, lien à diffuser, code d'intégration, export et import |

Les réglages sont enregistrés en JSON dans la **description de la colonne `Config_questionnaire`** de la table. Ne supprimez pas cette colonne.

## Le reprendre et l'adapter

- **L'utiliser tel quel** : pointez vos documents Grist vers les adresses ci-dessus. Aucune installation n'est nécessaire.
- **L'héberger chez vous** : copiez le dépôt (*Fork*), activez GitHub Pages ou déposez les fichiers sur n'importe quel serveur web statique. Aucune compilation n'est nécessaire.
- **Réutiliser un questionnaire** : exportez ses réglages en JSON, puis importez-les dans un autre document. `exemples/inscription-atelier.json` en donne un exemple.
- **Modifier le code** :

| Fichier | Rôle |
| --- | --- |
| `index.html` | Page de présentation |
| `editeur.html`, `js/editeur.js`, `css/editeur.css` | Éditeur (widget Grist) |
| `formulaire.html` | Page publique du questionnaire |
| `js/moteur.js` | Modèle de configuration et évaluation des conditions, sans accès réseau |
| `js/rendu.js` | Construction du questionnaire en composants DSFR, validation, étapes |
| `js/page-dsfr.js`, `js/page-editeur.js`, `css/page.css` | En-tête et pied de page configurables, communs aux outils `grist-*` |
| `css/commun.css` | Compléments au DSFR |
| `exemples/` | Réglages d'exemple, sans aucune donnée |
| `modele/` | Modèle de document Grist sans données, à importer |

Le DSFR (version 1.15.4) est chargé depuis le CDN jsDelivr.

## Fonctionnement et sécurité

```
Personne qui répond ──> page DSFR (ce dépôt, GitHub Pages)
                    ──> Grist : questions et réglages (lecture)
                    ──> Grist : réponse enregistrée dans la table (écriture)
```

- La page passe par l'API de partage du formulaire Grist publié : `/api/s/<clé>/forms/<section>` pour lire, `/api/s/<clé>/tables/<table>/records` pour écrire.
- Ce lien permet d'**ajouter** une réponse. Il ne permet **pas** de lire les réponses existantes, ni les autres tables, ni les autres documents. Les réponses ne passent jamais par GitHub.
- Le lien permet d'écrire dans **toutes** les colonnes de la table, même celles absentes du questionnaire. Utilisez une **table dédiée aux réponses**, sans colonne qui déclenche une action (case de validation, par exemple).
- Les questions, les conditions et les textes sont **publics** : n'y mettez rien de confidentiel.
- Une question liée à une autre table (référence) rend la liste de cette table lisible.
- La logique conditionnelle et les champs obligatoires s'appliquent **dans le navigateur**. Ils guident la saisie, sans contrôle côté serveur. La protection contre les envois automatisés se limite à un champ piège.

## Limites

- Le questionnaire dépend du formulaire Grist publié : s'il est dépublié, le lien DSFR ne fonctionne plus.
- Pas encore de calculs, de score, de redirection selon les réponses, ni de pré-remplissage par l'adresse.
- Aucun audit RGAA n'a été mené.

## Version stable et version en cours

Dans Grist, utilisez l'adresse de la **version stable** : `https://lab17bis.github.io/grist-questionnaire/v1/`. Elle ne change que pour corriger un défaut, sans toucher aux tables ni aux réglages. Une évolution qui les modifie paraît sous une nouvelle adresse (`v2/`) : les documents déjà en service restent sur `v1/` tant que vous ne changez pas l'adresse du widget.

L'adresse sans numéro (`https://lab17bis.github.io/grist-questionnaire/`) suit la version en cours de développement. Elle sert à essayer les nouveautés ; ne l'utilisez pas pour un document en service.

Pour figer une nouvelle version stable après des tests réussis : `sh outils/figer-version.sh 1` (ou `2` pour une version qui change les tables), puis publiez le dépôt.

## Données partagées avec les autres outils

Plusieurs outils de la même famille peuvent travailler dans un même document Grist. Ils suivent une règle commune pour ne pas dupliquer les données :

- **Une seule table `Personnes`** par document. Colonne commune : `Nom`. Colonnes facultatives reconnues par tous : `Email` et `Structure` (référence à `Structures`). Un outil lit cette table si elle existe et la crée seulement si elle manque. Il n'y ajoute que ses propres colonnes.
- **Une seule table `Structures`** pour les équipes, services ou établissements : `Nom`, `Sigle`, `Type`, `Parent` (structure de rattachement).
- **Aucun outil ne supprime ni ne renomme** une table ou une colonne qu'il n'a pas créée.
- **Les autres tables portent des noms propres à chaque outil**, pour éviter les collisions (par exemple `Actions` pour grist-projet, `Actions_reunion` pour grist-reunion). Les réglages sont rangés dans la description d'une colonne technique propre à l'outil (`Config_…`).
- **Identifier la personne connectée** : un widget ne connaît pas l'adresse de la personne connectée. Les colonnes « créé par » utilisent une formule `user.Email` calculée à la création. Seul un outil qui doit relier la personne connectée à sa fiche crée la table `Comptes`.

Ce que fait cet outil : Il ne crée aucune table de personnes : les réponses vont dans la table que vous choisissez.

## Espaces clés en main

Ce widget est déjà assemblé, avec d'autres, dans des **espaces** : des documents Grist complets à importer en une fois, vides ou avec un exemple fictif.

- [espace-accompagnement](https://github.com/lab17bis/espace-accompagnement) : suivre les sollicitations : offre de service, fiches contact, satisfaction et indicateurs.
- [espace-sondage](https://github.com/lab17bis/espace-sondage) : mener une enquête : questionnaire, suivi des répondants et indicateurs.
- [espace-communaute](https://github.com/lab17bis/espace-communaute) : animer une communauté de pratique ou un réseau : membres, groupes, rencontres et présences, ressources partagées (proposées aussi par formulaire public), retours et indicateurs.
- [espace-contributions](https://github.com/lab17bis/espace-contributions) : faire participer : boîte à idées, valorisation des réalisations des équipes, votes et suites données.

## Autres outils de la même famille

- [grist-catalogue](https://github.com/lab17bis/grist-catalogue) : catalogue public de fiches au DSFR.
- [grist-graphique](https://github.com/lab17bis/grist-graphique) : tableaux de bord et graphiques au DSFR.
- [grist-projet](https://github.com/lab17bis/grist-projet) : espace d'équipe pour gérer des projets.
- [grist-reunion](https://github.com/lab17bis/grist-reunion) : réunions : ordre du jour, séance, compte rendu et suivi des actions.
- [grist-management](https://github.com/lab17bis/grist-management) : écran de management visuel d'équipe.
- [grist-consultation](https://github.com/lab17bis/grist-consultation) : consultations : boîte à idées, valorisation des réalisations, votes et suites données.
- [grist-carte](https://github.com/lab17bis/grist-carte) : carte interactive des lignes d'une table, au fond de l'IGN.
- [grist-graphe](https://github.com/lab17bis/grist-graphe) : cartographie des acteurs et de leurs liens.

Les widgets qui ont un en-tête et un pied de page partagent les mêmes réglages.

## Écosystème

- **[Grist](https://grist.numerique.gouv.fr)** : tableur-base de données libre ([gristlabs/grist-core](https://github.com/gristlabs/grist-core)), proposé aux agents publics par la [DINUM](https://www.numerique.gouv.fr/) dans [La Suite numérique](https://lasuite.numerique.gouv.fr/).
- **[Système de design de l'État (DSFR)](https://www.systeme-de-design.gouv.fr/)** ([GouvernementFR/dsfr](https://github.com/GouvernementFR/dsfr)). Son usage est réservé aux sites des services de l'État : voir les [conditions d'utilisation](https://www.systeme-de-design.gouv.fr/utilisation-et-organisation/perimetre-d-application).
- **[Communauté Grist francophone](https://forum.grist.libre.sh/)**.

## Mots-clés

Grist, widget Grist, widget de mise en page, formulaire, questionnaire, enquête, inscription, logique conditionnelle, formulaire conditionnel, formulaire multi-étapes, DSFR, Système de design de l'État, La Suite numérique, DINUM, service public, administration, alternative à Tally, clé en main, logiciel libre.

## Licence

Code sous licence MIT (voir `LICENSE`). Réutilisation, adaptation et contributions bienvenues.

Conçu par le Lab 17 bis, laboratoire d'innovation publique de l'académie de Reims. Contact : <lab17bis@ac-reims.fr>

# Questionnaires DSFR pour Grist

**Créer des questionnaires en ligne au Système de design de l'État (DSFR), avec logique conditionnelle, dont les réponses sont enregistrées dans Grist.**

Outil libre conçu par le [Lab 17 bis](https://lab17bis.github.io/ressources/), laboratoire d'innovation publique de l'[académie de Reims](https://www.ac-reims.fr/), au sein de l'équipe Dynamique Modernisation et Transformation (DMT) du rectorat.

> Statut : prototype en service. Aucune donnée n'est stockée dans ce dépôt.

## En bref

Le formulaire natif de [Grist](https://lasuite.numerique.gouv.fr/produits/grist) ne gère ni la logique conditionnelle, ni les questionnaires en plusieurs étapes, et son apparence n'est pas celle des sites de l'État. Ce dépôt ajoute deux pages :

| Page | Pour qui | Rôle |
| --- | --- | --- |
| `editeur.html` | La personne qui conçoit le questionnaire | Widget personnalisé à placer dans un document Grist : étapes, questions, textes, conditions, aperçu, publication. |
| `formulaire.html` | Les personnes qui répondent | Page web autonome au DSFR, en pleine page, accessible par un lien public ou intégrable dans un autre site. |

L'objectif : se rapprocher de ce que proposent des outils comme Tally, en restant dans l'écosystème souverain de l'État (Grist de La Suite numérique, DSFR).

## Fonctionnalités

- **Logique conditionnelle** : une étape, une question ou un bloc de texte s'affiche seulement si les réponses précédentes le justifient.
  - Règles combinées par ET ou par OU.
  - Opérateurs adaptés au type de question : est / n'est pas, contient, supérieur / inférieur, avant / après, coché / non coché, renseigné / non renseigné.
  - Conditions en cascade : une question masquée compte comme vide.
  - Une étape masquée est sautée.
  - Les réponses aux questions masquées ne sont pas envoyées.
- **Questionnaire en plusieurs étapes**, avec l'indicateur d'étapes du DSFR.
- **Composants DSFR** : champs de saisie, boutons radio, cases à cocher, listes déroulantes, interrupteurs, dépôt de fichiers, encadrés, alertes.
- **Messages d'erreur DSFR**, avec un récapitulatif cliquable en haut de page.
- **Éditeur intégré à Grist** : ajout de questions à partir des colonnes existantes, ou création de nouvelles colonnes ; aperçu interactif ; publication guidée.
- **En-tête et pied de page** configurables (bloc-marque, nom du service), message de confirmation, mentions sur les données personnelles.
- **Intégration** possible dans un autre site (iframe, sans en-tête ni pied de page).
- **Export et import** de la configuration, pour réutiliser un questionnaire dans un autre document.

## Démonstration

Questionnaire de démonstration (données fictives) :
<https://lab17bis.github.io/questionnaires/formulaire.html?grist=https%3A%2F%2Fgrist.numerique.gouv.fr%2Fo%2Flab17bis%2Fforms%2FeE8n5sNgSL8ej2cFgufnv4%2F7>

Présentation : <https://lab17bis.github.io/questionnaires/>

## Mise en place dans un document Grist

1. Créez la table qui recevra les réponses, ou laissez l'éditeur créer les colonnes.
2. Ajoutez une vue **Personnalisée** sur cette table, avec l'adresse `https://lab17bis.github.io/questionnaires/editeur.html`. Dans le panneau de droite, accordez l'**accès complet** au document.
3. Construisez le questionnaire, puis cliquez sur **Enregistrer**.
4. Ajoutez une page **Formulaire** Grist sur la même table, cliquez sur **Publier**, puis copiez le lien de partage. Cette étape ne se fait qu'une fois.
5. Dans l'onglet **Publication** de l'éditeur, collez ce lien et cliquez sur **Vérifier et connecter**. L'éditeur affiche le lien DSFR à diffuser.

Ne diffusez pas le lien du formulaire Grist natif : il ignore la logique conditionnelle.

## Fonctionnement

```
Personne qui répond ──> GitHub Pages : page DSFR vide (code seulement)
                    ──> Grist : questions et configuration (lecture)
                    ──> Grist : réponse enregistrée dans la table (écriture)
```

- La configuration du questionnaire est enregistrée en JSON dans la **description de la colonne `Config_questionnaire`** de la table. Ne supprimez pas cette colonne.
- La page publique passe par l'API de partage du formulaire Grist publié : `/api/s/<clé>/forms/<section>` pour lire, `/api/s/<clé>/tables/<table>/records` pour écrire.
- Ce lien de partage permet d'**ajouter** une réponse. Il ne permet **pas** de lire les réponses existantes, ni les autres tables, ni les autres documents.
- Les réponses ne passent jamais par GitHub.

## Sécurité et limites

- Le lien de partage permet d'écrire dans **toutes** les colonnes de la table, même celles absentes du questionnaire. Utilisez une **table dédiée aux réponses**. N'y placez aucune colonne qui déclenche une action, par exemple une case de validation.
- Les questions, les conditions et les textes sont **publics** : n'y mettez rien de confidentiel.
- Une question liée à une autre table (référence) rend la liste de cette table lisible.
- La logique conditionnelle et les champs obligatoires s'appliquent **dans le navigateur**. Ils guident la saisie mais ne constituent pas un contrôle côté serveur. La protection contre les envois automatisés se limite à un champ piège.
- Le questionnaire dépend du formulaire Grist publié : s'il est dépublié, le lien DSFR ne fonctionne plus.
- Pas encore de calculs, de score, de redirection selon les réponses, ni de pré-remplissage par l'adresse.
- Aucun audit RGAA n'a été mené : le pied de page indique « Accessibilité : non conforme ».

## Contenu du dépôt

| Fichier | Contenu |
| --- | --- |
| `index.html` | Page de présentation. |
| `editeur.html`, `js/editeur.js`, `css/editeur.css` | Éditeur (widget Grist). |
| `formulaire.html` | Page publique du questionnaire. |
| `js/moteur.js` | Modèle de configuration et évaluation des conditions, sans accès réseau. |
| `js/rendu.js` | Construction du questionnaire en composants DSFR, validation, étapes. |
| `css/commun.css` | Compléments au DSFR. |
| `exemples/` | Configurations d'exemple, sans aucune donnée. |

Le DSFR (version 1.15.4) est chargé depuis le CDN jsDelivr. Aucune étape de compilation : les fichiers sont servis tels quels par GitHub Pages.

## Écosystème

- **[Grist](https://grist.numerique.gouv.fr)** : tableur-base de données libre ([gristlabs/grist-core](https://github.com/gristlabs/grist-core)), proposé aux agents de l'État par la [DINUM](https://www.numerique.gouv.fr/) dans [La Suite numérique](https://lasuite.numerique.gouv.fr/).
- **[Système de design de l'État (DSFR)](https://www.systeme-de-design.gouv.fr/)** : composants et règles d'interface des sites de l'État ([GouvernementFR/dsfr](https://github.com/GouvernementFR/dsfr)).
- **[Communauté Grist francophone](https://forum.grist.libre.sh/)** : entraide et partage de widgets.
- Autres outils du Lab 17 bis : [catalogue de ressources et d'interventions](https://github.com/lab17bis/ressources), [suivi de projets](https://github.com/lab17bis/projets).

Le DSFR est réservé aux sites des services de l'État. Voir les [conditions d'utilisation](https://www.systeme-de-design.gouv.fr/utilisation-et-organisation/perimetre-d-application).

## Mots-clés

Grist, widget Grist, formulaire, questionnaire, enquête, logique conditionnelle, formulaire conditionnel, formulaire multi-étapes, DSFR, Système de design de l'État, La Suite numérique, DINUM, administration, service public, Éducation nationale, académie de Reims, innovation publique, alternative à Tally, logiciel libre.

## Licence

Code sous licence MIT (voir `LICENSE`). Réutilisation, adaptation et contributions bienvenues.

Contact : Lab 17 bis, <lab17bis@ac-reims.fr>

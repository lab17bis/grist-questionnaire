# Questionnaires DSFR pour Grist

Prototype du Lab 17 bis (académie de Reims).

Ce dépôt permet de construire un questionnaire au Système de design de l'État (DSFR), avec **logique conditionnelle**, dont les réponses sont enregistrées dans une table **Grist**.

Le dépôt ne contient que du code. Il ne contient aucune donnée ni aucune réponse.

## Les deux pages

| Page | Rôle | Où l'utiliser |
| --- | --- | --- |
| `editeur.html` | Construire le questionnaire : étapes, questions, textes, conditions, textes d'en-tête et de confirmation, aperçu, publication. | Dans Grist, comme vue « Personnalisée » (widget), avec l'accès complet au document. |
| `formulaire.html` | Afficher le questionnaire aux personnes qui répondent et envoyer leurs réponses à Grist. | Lien public, ou intégration dans une autre page (iframe). |

Adresses publiées (GitHub Pages) :

- éditeur : `https://lab17bis.github.io/questionnaires/editeur.html`
- questionnaire : `https://lab17bis.github.io/questionnaires/formulaire.html?grist=<lien du formulaire Grist publié>`

## Mise en place dans un document Grist

1. Créez la table qui recevra les réponses (ou laissez l'éditeur créer les colonnes).
2. Ajoutez une vue **Personnalisée** sur cette table, avec l'URL de `editeur.html`. Dans le panneau de droite, accordez l'**accès complet** au document.
3. Construisez le questionnaire, puis cliquez sur **Enregistrer**.
4. Ajoutez une page **Formulaire** Grist sur la même table, puis cliquez sur **Publier**. Copiez le lien de partage.
5. Dans l'onglet **Publication** de l'éditeur, collez ce lien et cliquez sur **Vérifier et connecter**. L'éditeur affiche le lien DSFR à diffuser.

Ne diffusez pas le lien du formulaire Grist natif : il ignore la logique conditionnelle.

## Logique conditionnelle

Chaque étape, question ou bloc de texte peut être affiché seulement sous condition.

- Une condition contient une ou plusieurs règles, combinées par ET (toutes vraies) ou OU (au moins une vraie).
- Une règle porte sur une question placée **avant**.
- Opérateurs selon le type de question : est / n'est pas, contient, supérieur / inférieur, avant / après, coché / non coché, renseigné / non renseigné.
- Une question masquée compte comme vide. Les conditions en cascade restent donc cohérentes.
- Les réponses aux questions masquées ne sont pas envoyées.
- Une étape masquée est sautée (équivalent d'un saut de page).

La logique s'applique dans le navigateur. Elle guide la personne qui répond. Elle ne constitue pas un contrôle côté serveur.

## Fonctionnement technique

- La configuration est enregistrée en JSON dans la **description de la colonne `Config_questionnaire`** de la table. Ne supprimez pas cette colonne.
- La page publique lit cette configuration et la structure des questions par l'API de partage du formulaire Grist publié (`/api/s/<clé>/forms/<section>`).
- Elle envoie la réponse par la même API (`/api/s/<clé>/tables/<table>/records`). Ce lien de partage permet d'ajouter une réponse. Il ne permet pas de lire les réponses existantes.
- Grist accepte ces appels depuis un autre site, sans cookie ni identifiant (vérifié sur grist.numerique.gouv.fr le 16 novembre 2026).
- Le DSFR (version 1.15.4) est chargé depuis le CDN jsDelivr.

| Fichier | Contenu |
| --- | --- |
| `js/moteur.js` | Modèle de configuration et évaluation des conditions (sans accès réseau). |
| `js/rendu.js` | Construction du questionnaire en composants DSFR, validation, étapes. |
| `js/editeur.js` | Widget Grist de configuration. |
| `exemples/` | Configurations d'exemple, sans données. |

## Limites connues

- Pas de calculs, de score, ni de redirection selon les réponses.
- Pas de pré-remplissage par l'URL.
- Le lien du questionnaire dépend du formulaire Grist publié : s'il est dépublié, le questionnaire DSFR ne fonctionne plus.
- La protection contre les envois automatisés se limite à un champ piège.
- Le pied de page indique « Accessibilité : non conforme » tant qu'aucun audit RGAA n'a été mené.

## Usage du DSFR

Le DSFR est réservé aux sites des services de l'État. Voir les [conditions d'utilisation du DSFR](https://www.systeme-de-design.gouv.fr/utilisation-et-organisation/perimetre-d-application).

## Licence

Code sous licence MIT (voir `LICENSE`).

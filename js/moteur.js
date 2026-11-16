/*
 * Moteur du questionnaire DSFR adossé à Grist.
 * - Modèle de configuration (version 1)
 * - Familles de champs déduites des types de colonnes Grist
 * - Évaluation de la logique conditionnelle (affichage des étapes, questions, textes)
 *
 * Aucun accès réseau ici : ce fichier est partagé par l'éditeur et la page publique.
 */
(function (global) {
  "use strict";

  var NOM_COLONNE_CONFIG = "Config_questionnaire";
  var VERSION = 1;

  /* ---------- Familles de champs ---------- */

  // Type de colonne Grist -> famille utilisée par le questionnaire.
  function famille(typeGrist) {
    var t = String(typeGrist || "Text").split(":")[0];
    switch (t) {
      case "Numeric":
      case "Int":
        return "nombre";
      case "Date":
      case "DateTime":
        return "date";
      case "Choice":
        return "choix";
      case "ChoiceList":
        return "choix_multiple";
      case "Bool":
        return "booleen";
      case "Ref":
        return "ref";
      case "RefList":
        return "ref_multiple";
      case "Attachments":
        return "fichier";
      default:
        return "texte";
    }
  }

  // Présentations possibles par famille (la première est la valeur par défaut).
  var AFFICHAGES = {
    texte: [
      ["court", "Texte court"],
      ["long", "Texte long (plusieurs lignes)"],
      ["courriel", "Adresse électronique"],
      ["telephone", "Numéro de téléphone"]
    ],
    nombre: [["nombre", "Nombre"]],
    date: [["date", "Date"]],
    choix: [
      ["radio", "Boutons radio"],
      ["liste", "Liste déroulante"]
    ],
    choix_multiple: [["cases", "Cases à cocher"]],
    booleen: [
      ["case", "Case à cocher"],
      ["ouinon", "Boutons Oui / Non"],
      ["interrupteur", "Interrupteur"]
    ],
    ref: [
      ["liste", "Liste déroulante"],
      ["radio", "Boutons radio"]
    ],
    ref_multiple: [["cases", "Cases à cocher"]],
    fichier: [["fichier", "Dépôt de fichiers"]]
  };

  /* ---------- Opérateurs de condition ---------- */

  var OPERATEURS = {
    egal: "est égal à",
    different: "est différent de",
    contient: "contient",
    ne_contient_pas: "ne contient pas",
    parmi: "est",
    hors: "n'est pas",
    contient_un: "contient au moins une de",
    contient_tous: "contient toutes",
    ne_contient_aucun: "ne contient aucune de",
    sup: "est supérieur à",
    sup_egal: "est supérieur ou égal à",
    inf: "est inférieur à",
    inf_egal: "est inférieur ou égal à",
    avant: "est avant le",
    apres: "est après le",
    vrai: "est coché (oui)",
    faux: "n'est pas coché (non)",
    rempli: "est renseigné",
    vide: "n'est pas renseigné"
  };

  var OPERATEURS_PAR_FAMILLE = {
    texte: ["egal", "different", "contient", "ne_contient_pas", "rempli", "vide"],
    nombre: ["egal", "different", "sup", "sup_egal", "inf", "inf_egal", "rempli", "vide"],
    date: ["egal", "avant", "apres", "rempli", "vide"],
    choix: ["parmi", "hors", "rempli", "vide"],
    ref: ["parmi", "hors", "rempli", "vide"],
    choix_multiple: ["contient_un", "contient_tous", "ne_contient_aucun", "rempli", "vide"],
    ref_multiple: ["contient_un", "contient_tous", "ne_contient_aucun", "rempli", "vide"],
    booleen: ["vrai", "faux"],
    fichier: ["rempli", "vide"]
  };

  var OPERATEURS_SANS_VALEUR = ["rempli", "vide", "vrai", "faux"];
  var OPERATEURS_LISTE = ["parmi", "hors", "contient_un", "contient_tous", "ne_contient_aucun"];

  /* ---------- Outils ---------- */

  function estVide(v) {
    return v === null || v === undefined || v === "" ||
      (Array.isArray(v) && v.length === 0);
  }

  function normaliser(s) {
    return String(s === null || s === undefined ? "" : s)
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
  }

  function enListe(v) {
    if (estVide(v)) { return []; }
    return Array.isArray(v) ? v : [v];
  }

  function nombre(v) {
    if (estVide(v)) { return null; }
    var n = Number(String(v).replace(",", "."));
    return isNaN(n) ? null : n;
  }

  /* ---------- Parcours de la configuration ---------- */

  // Liste ordonnée de tous les éléments, avec leur étape.
  function elementsOrdonnes(config) {
    var liste = [];
    (config.etapes || []).forEach(function (etape, iEtape) {
      (etape.elements || []).forEach(function (el) {
        liste.push({ element: el, etape: etape, indexEtape: iEtape });
      });
    });
    return liste;
  }

  function trouverElement(config, id) {
    var liste = elementsOrdonnes(config);
    for (var i = 0; i < liste.length; i++) {
      if (liste[i].element.id === id) { return liste[i].element; }
    }
    return null;
  }

  /* ---------- Évaluation ---------- */

  /*
   * valeur : valeur courante de la question (déjà normalisée en libellés pour
   *          les références et listes de choix).
   */
  function evaluerRegle(regle, valeur) {
    var op = regle.operateur;
    var attendu = regle.valeur;

    if (op === "rempli") { return !estVide(valeur); }
    if (op === "vide") { return estVide(valeur); }
    if (op === "vrai") { return valeur === true; }
    if (op === "faux") { return valeur !== true; }

    if (OPERATEURS_LISTE.indexOf(op) >= 0) {
      var attendus = enListe(attendu).map(normaliser);
      var actuels = enListe(valeur).map(normaliser);
      if (op === "parmi") {
        return actuels.length > 0 && actuels.some(function (a) { return attendus.indexOf(a) >= 0; });
      }
      if (op === "hors") {
        return !actuels.some(function (a) { return attendus.indexOf(a) >= 0; });
      }
      if (op === "contient_un") {
        return actuels.some(function (a) { return attendus.indexOf(a) >= 0; });
      }
      if (op === "contient_tous") {
        return attendus.length > 0 && attendus.every(function (a) { return actuels.indexOf(a) >= 0; });
      }
      if (op === "ne_contient_aucun") {
        return !actuels.some(function (a) { return attendus.indexOf(a) >= 0; });
      }
    }

    if (["sup", "sup_egal", "inf", "inf_egal"].indexOf(op) >= 0) {
      var a = nombre(valeur), b = nombre(attendu);
      if (a === null || b === null) { return false; }
      if (op === "sup") { return a > b; }
      if (op === "sup_egal") { return a >= b; }
      if (op === "inf") { return a < b; }
      return a <= b;
    }

    if (op === "avant" || op === "apres") {
      if (estVide(valeur) || estVide(attendu)) { return false; }
      // Dates au format AAAA-MM-JJ : la comparaison de chaînes suffit.
      return op === "avant" ? String(valeur) < String(attendu) : String(valeur) > String(attendu);
    }

    if (op === "egal" || op === "different") {
      // Les questions de type nombre fournissent un nombre : comparaison numérique.
      var egal = typeof valeur === "number" ?
        valeur === nombre(attendu) :
        normaliser(valeur) === normaliser(attendu);
      return op === "egal" ? egal : !egal;
    }

    if (op === "contient") { return normaliser(valeur).indexOf(normaliser(attendu)) >= 0; }
    if (op === "ne_contient_pas") { return normaliser(valeur).indexOf(normaliser(attendu)) < 0; }

    return true;
  }

  function evaluerCondition(condition, valeurs) {
    if (!condition || !condition.regles || condition.regles.length === 0) { return true; }
    var resultats = condition.regles.map(function (regle) {
      return evaluerRegle(regle, valeurs[regle.element]);
    });
    return condition.mode === "une" ?
      resultats.some(Boolean) :
      resultats.every(Boolean);
  }

  /*
   * Calcule ce qui est visible à partir des valeurs saisies.
   * Une question masquée compte comme vide pour les conditions suivantes :
   * les conditions en cascade restent cohérentes.
   *
   * valeursSaisies : { idElement: valeur }
   * Retourne { etapes: {id: bool}, elements: {id: bool}, valeurs: {id: valeur effective} }
   */
  function calculerVisibilite(config, valeursSaisies) {
    var resultat = { etapes: {}, elements: {}, valeurs: {} };
    (config.etapes || []).forEach(function (etape) {
      var etapeVisible = evaluerCondition(etape.condition, resultat.valeurs);
      resultat.etapes[etape.id] = etapeVisible;
      (etape.elements || []).forEach(function (el) {
        var visible = etapeVisible && evaluerCondition(el.condition, resultat.valeurs);
        resultat.elements[el.id] = visible;
        if (el.genre === "question") {
          resultat.valeurs[el.id] = visible ? valeursSaisies[el.id] : null;
        }
      });
    });
    return resultat;
  }

  /* ---------- Contrôle de cohérence (éditeur) ---------- */

  // Signale les règles qui pointent vers une question absente ou placée après.
  function verifierConfig(config) {
    var problemes = [];
    var vues = {};
    var ids = {};
    elementsOrdonnes(config).forEach(function (o) { ids[o.element.id] = o.element; });

    function verifierRegles(condition, ou, avant) {
      if (!condition || !condition.regles) { return; }
      condition.regles.forEach(function (r) {
        if (!ids[r.element]) {
          problemes.push(ou + " : une règle vise une question supprimée.");
        } else if (!avant[r.element]) {
          problemes.push(ou + " : une règle vise une question placée après. Déplacez la question ou la règle.");
        } else if (OPERATEURS_SANS_VALEUR.indexOf(r.operateur) < 0 && estVide(r.valeur)) {
          problemes.push(ou + " : une règle n'a pas de valeur.");
        }
      });
    }

    (config.etapes || []).forEach(function (etape, i) {
      var nomEtape = "Étape " + (i + 1) + (etape.titre ? " « " + etape.titre + " »" : "");
      var avantEtape = Object.assign({}, vues);
      verifierRegles(etape.condition, nomEtape, avantEtape);
      (etape.elements || []).forEach(function (el) {
        var nom = el.genre === "question" ? "Question « " + (el.libelle || el.colonne) + " »" : "Bloc de texte";
        verifierRegles(el.condition, nom, vues);
        if (el.genre === "question") { vues[el.id] = true; }
      });
    });
    return problemes;
  }

  /* ---------- Identifiants ---------- */

  function nouvelId(prefixe) {
    return (prefixe || "x") + Math.random().toString(36).slice(2, 8);
  }

  /* ---------- Lien public ---------- */

  // Décompose un lien de formulaire Grist publié :
  // https://hote/o/organisation/forms/CLE/IDSECTION
  function analyserLienGrist(lien) {
    try {
      var u = new URL(String(lien).trim());
      var m = u.pathname.match(/^(?:\/o\/([^/]+))?\/forms\/([^/]+)\/(\d+)/);
      if (!m) { return null; }
      var org = m[1] || "";
      // Sur getgrist.com, l'organisation peut être dans le sous-domaine.
      return {
        origine: u.origin,
        organisation: org,
        cle: m[2],
        section: Number(m[3]),
        base: u.origin + (org ? "/o/" + org : "") + "/api/s/" + m[2]
      };
    } catch (e) {
      return null;
    }
  }

  global.QuestionnaireMoteur = {
    NOM_COLONNE_CONFIG: NOM_COLONNE_CONFIG,
    VERSION: VERSION,
    AFFICHAGES: AFFICHAGES,
    OPERATEURS: OPERATEURS,
    OPERATEURS_PAR_FAMILLE: OPERATEURS_PAR_FAMILLE,
    OPERATEURS_SANS_VALEUR: OPERATEURS_SANS_VALEUR,
    OPERATEURS_LISTE: OPERATEURS_LISTE,
    famille: famille,
    estVide: estVide,
    elementsOrdonnes: elementsOrdonnes,
    trouverElement: trouverElement,
    evaluerRegle: evaluerRegle,
    evaluerCondition: evaluerCondition,
    calculerVisibilite: calculerVisibilite,
    verifierConfig: verifierConfig,
    nouvelId: nouvelId,
    analyserLienGrist: analyserLienGrist
  };
})(typeof window !== "undefined" ? window : globalThis);

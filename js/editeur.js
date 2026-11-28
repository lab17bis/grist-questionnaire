/*
 * Éditeur de questionnaire DSFR : widget personnalisé Grist (accès complet au document).
 *
 * La configuration (étapes, questions, textes, logique conditionnelle) est enregistrée
 * en JSON dans la description de la colonne technique « Config_questionnaire » de la table.
 * La page publique la lit à travers le lien de partage du formulaire Grist publié.
 */
(function () {
  "use strict";

  var M = window.QuestionnaireMoteur;
  var R = window.QuestionnaireRendu;
  var esc = R.echapper;

  var E = {
    tableId: null,
    tableRef: null,
    colonnes: [],          // colonnes de la table (hors colonnes techniques)
    colConfig: null,       // colonne Config_questionnaire si elle existe
    config: null,
    selection: null,       // { type: "etape" | "element", id }
    modifie: false,
    vue: "questions",
    choixModifies: {},     // colId -> nouvelle liste de choix
    refValues: {}          // colId -> [[id, libellé]]
  };

  // Barre commune de l'éditeur (commun/barre.js) : Réglages, En-tête et pied, Aperçu, Publication.
  var BL = window.BarreLab, PAGE_USAGE = false;
  var BARRE = BL ? BL.creer(document.body, {
    nom: "Widget questionnaire", idEtat: "etat", idEnregistrer: "enregistrer", actif: E.vue,
    onglets: [{ id: "reglages", libelle: "Réglages", sous: [{ id: "questions", libelle: "Questions" }, { id: "textes", libelle: "Textes" }, { id: "json", libelle: "Export et import" }] },
      { id: "page", libelle: "En-tête et pied" }, { id: "apercu", libelle: "Aperçu" }, { id: "publication", libelle: "Publication" }],
    surChoix: function (i) { E.vue = i; afficher(); }
  }) : null;
  function blocMode() { /* pas de page d'usage ici : la page des personnes est le formulaire public */ }

  var TYPES_NOUVELLE_QUESTION = [
    ["Text|court", "Texte court"],
    ["Text|long", "Texte long"],
    ["Text|courriel", "Adresse électronique"],
    ["Text|telephone", "Numéro de téléphone"],
    ["Text|lien", "Adresse web (lien)"],
    ["Text|heure", "Heure"],
    ["Numeric|nombre", "Nombre"],
    ["Int|nombre", "Nombre entier"],
    ["Int|echelle", "Note sur une échelle"],
    ["Date|date", "Date"],
    ["DateTime|datetime", "Date et heure"],
    ["Choice|radio", "Choix unique"],
    ["ChoiceList|cases", "Choix multiples"],
    ["ChoiceList|classement", "Classement par ordre"],
    ["Bool|ouinon", "Oui / Non"],
    ["Bool|case", "Case à cocher (accord)"]
  ];

  // Grist refuse les fichiers déposés par une personne anonyme : ces colonnes ne sont pas proposées.
  function estFichier(c) { return M.famille(c.type) === "fichier"; }

  var NOMS_FAMILLES = {
    texte: "Texte", nombre: "Nombre", date: "Date", choix: "Choix unique",
    choix_multiple: "Choix multiples", booleen: "Oui / Non", ref: "Référence",
    ref_multiple: "Références", fichier: "Fichiers"
  };

  var NOMS_MEDIAS = { image: "Image", audio: "Audio", video: "Vidéo", pdf: "Document PDF" };

  var TYPES_MEDIA = [
    ["image", "Image"],
    ["audio", "Son (lecteur audio)"],
    ["video", "Vidéo (lecteur vidéo)"],
    ["pdf", "Document PDF"]
  ];

  var STYLES_TEXTE = [
    ["paragraphe", "Paragraphe"],
    ["intertitre", "Intertitre"],
    ["encadre", "Mise en avant (encadré)"],
    ["information", "Information (alerte bleue)"]
  ];

  /* ---------- Utilitaires ---------- */

  function $(sel, racine) { return (racine || document).querySelector(sel); }

  function colonnesEnLignes(t) {
    var lignes = [];
    var cles = Object.keys(t);
    (t.id || []).forEach(function (_, i) {
      var l = {};
      cles.forEach(function (k) { l[k] = t[k][i]; });
      lignes.push(l);
    });
    return lignes;
  }

  function json(s, defaut) {
    try { return s ? JSON.parse(s) : defaut; } catch (e) { return defaut; }
  }

  function message(type, texte) {
    var zone = $("#message");
    if (!texte) { zone.innerHTML = ""; return; }
    zone.innerHTML = "<div class=\"fr-alert fr-alert--" + type + " fr-alert--sm\"><p>" + esc(texte) + "</p></div>";
    if (type === "success") {
      setTimeout(function () { if (zone.textContent.indexOf(texte) >= 0) { zone.innerHTML = ""; } }, 4000);
    }
  }

  function marquerModifie(v) {
    E.modifie = v !== false;
    var etat = $("#etat");
    if (E.modifie) {
      etat.className = "fr-badge fr-badge--sm fr-badge--warning";
      etat.textContent = "Non enregistré";
    } else {
      etat.className = "fr-badge fr-badge--sm fr-badge--success";
      etat.textContent = "Enregistré";
    }
  }

  function colonne(colId) {
    return E.colonnes.find(function (c) { return c.colId === colId; }) || null;
  }

  function typeElement(el) {
    var c = el.colonne && colonne(el.colonne);
    return c ? c.type : (el.type || "Text");
  }

  function choixElement(el) {
    if (el.colonne && E.choixModifies[el.colonne]) { return E.choixModifies[el.colonne]; }
    var c = el.colonne && colonne(el.colonne);
    if (c) { return json(c.widgetOptions, {}).choices || []; }
    return el.choix || [];
  }

  function libelleElement(el) {
    if (el.genre === "texte") {
      var t = el.titre || el.texte || "";
      return t.length > 60 ? t.slice(0, 60) + "…" : (t || "Bloc de texte vide");
    }
    if (el.genre === "media") {
      var m = el.titre || el.adresse || "";
      return "Média : " + (m.length > 50 ? m.slice(0, 50) + "…" : (m || "adresse à renseigner"));
    }
    if (el.genre === "matrice") { return el.libelle || "Tableau sans titre"; }
    return el.libelle || el.colonne || "Question sans libellé";
  }

  function toutesQuestions() {
    return M.elementsOrdonnes(E.config).filter(function (o) { return o.element.genre === "question"; });
  }

  // Questions placées avant l'élément (ou avant l'étape) : seules cibles possibles d'une règle.
  function questionsAvant(selection) {
    var liste = [];
    var etapes = E.config.etapes;
    for (var i = 0; i < etapes.length; i++) {
      if (selection.type === "etape" && etapes[i].id === selection.id) { return liste; }
      var els = etapes[i].elements || [];
      for (var j = 0; j < els.length; j++) {
        if (selection.type === "element" && els[j].id === selection.id) { return liste; }
        if (els[j].genre === "question") { liste.push(els[j]); }
      }
    }
    return liste;
  }

  function trouverEtape(id) { return E.config.etapes.find(function (e) { return e.id === id; }); }

  function etapeDeLElement(id) {
    return E.config.etapes.find(function (e) {
      return (e.elements || []).some(function (el) { return el.id === id; });
    });
  }

  function objetChoisi() {
    if (!E.selection) { return null; }
    if (E.selection.type === "etape") { return trouverEtape(E.selection.id); }
    return M.trouverElement(E.config, E.selection.id);
  }

  function colonnesUtilisees() {
    var u = {};
    toutesQuestions().forEach(function (o) {
      if (o.element.colonne) { u[o.element.colonne] = true; }
      if (o.element.colonneAutre) { u[o.element.colonneAutre] = true; }
    });
    M.elementsOrdonnes(E.config).forEach(function (o) {
      if (o.element.genre === "matrice") {
        (o.element.lignes || []).forEach(function (l) { if (l.colonne) { u[l.colonne] = true; } });
      }
    });
    return u;
  }

  // Colonnes ajoutées par le questionnaire lui-même (précision « Autre », lignes de tableau).
  function colonnesCompagnes() {
    var u = {};
    M.elementsOrdonnes(E.config).forEach(function (o) {
      var el = o.element;
      if (el.genre === "question" && el.colonneAutre) { u[el.colonneAutre] = true; }
      if (el.genre === "matrice") { (el.lignes || []).forEach(function (l) { if (l.colonne) { u[l.colonne] = true; } }); }
    });
    return u;
  }

  function choixAffiches(el) {
    var lib = el.libelleAutre || M.LIBELLE_AUTRE;
    return choixElement(el).filter(function (c) { return !(el.autre && c === lib); });
  }

  function resumeCondition(cond) {
    if (!cond || !cond.regles || !cond.regles.length) { return ""; }
    var morceaux = cond.regles.map(function (r) {
      var q = M.trouverElement(E.config, r.element);
      var nom = q ? "« " + (q.libelle || q.colonne) + " »" : "(question supprimée)";
      var op = M.OPERATEURS[r.operateur] || r.operateur;
      var val = "";
      if (M.OPERATEURS_SANS_VALEUR.indexOf(r.operateur) < 0) {
        var v = Array.isArray(r.valeur) ? r.valeur.join(" ou ") : (r.valeur || "…");
        val = " « " + v + " »";
      }
      return nom + " " + op + val;
    });
    return morceaux.join(cond.mode === "une" ? " OU " : " ET ");
  }

  function sanitizerColId(libelle) {
    var s = String(libelle || "Question").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
    if (!/^[A-Za-z]/.test(s)) { s = "Q_" + s; }
    return s.slice(0, 40) || "Question";
  }

  /* ---------- Chargement ---------- */

  function configParDefaut() {
    var elements = E.colonnes.filter(function (c) { return !c.isFormula && !estFichier(c); }).map(function (c) {
      return {
        id: M.nouvelId("q"), genre: "question", colonne: c.colId,
        libelle: c.label || c.colId, aide: c.description || "", obligatoire: false,
        type: c.type, choix: json(c.widgetOptions, {}).choices || undefined
      };
    });
    return {
      version: M.VERSION,
      titre: E.tableId,
      introduction: "",
      page: { marque: "République\nfrançaise", titre: "", sousTitre: "", boutons: [], pied: { accessibilite: "non conforme" } },
      envoi: {
        bouton: "Envoyer",
        titreConfirmation: "Votre réponse a bien été envoyée",
        messageConfirmation: "Merci pour votre participation.",
        autreReponse: false
      },
      mentionObligatoire: "asterisque",
      mentionsDonnees: "",
      etapes: [{ id: M.nouvelId("e"), titre: "", description: "", condition: null, elements: elements }]
    };
  }

  async function chargerMeta() {
    var tables = colonnesEnLignes(await grist.docApi.fetchTable("_grist_Tables"));
    var table = tables.find(function (t) { return t.tableId === E.tableId; });
    E.tableRef = table ? table.id : null;
    var cols = colonnesEnLignes(await grist.docApi.fetchTable("_grist_Tables_column"))
      .filter(function (c) { return c.parentId === E.tableRef; });
    E.colConfig = cols.find(function (c) { return c.colId === M.NOM_COLONNE_CONFIG; }) || null;
    E.colonnes = cols.filter(function (c) {
      return c.colId !== M.NOM_COLONNE_CONFIG && c.colId !== "manualSort" &&
        c.colId.indexOf("gristHelper_") !== 0;
    });
    E.toutesColonnes = cols;
  }

  async function demarrer(tableId) {
    if (!tableId || tableId === E.tableId) { return; }
    E.tableId = tableId;
    await chargerMeta();
    var enregistree = E.colConfig && json(E.colConfig.description, null);
    E.config = enregistree && enregistree.etapes ? enregistree : configParDefaut();
    E.selection = null;
    E.choixModifies = {};
    marquerModifie(!enregistree);
    if (!enregistree) {
      message("info", "Aucune configuration enregistrée : un questionnaire a été préparé à partir des colonnes de la table « " +
        tableId + " ». Ajustez-le puis enregistrez.");
      proposerExemple();
    }
    afficher();
  }

  /* ---------- Démarrage avec l'exemple ---------- */

  // Sur une table sans réglages, l'éditeur propose de partir d'un questionnaire d'exemple :
  // il crée les colonnes manquantes, charge l'exemple, et il ne reste qu'à enregistrer.
  function proposerExemple() {
    var z = $("#message");
    z.insertAdjacentHTML("beforeend", "<p class=\"fr-mt-1w\"><button type=\"button\" class=\"fr-btn fr-btn--sm fr-btn--secondary\" id=\"ed-exemple\">" +
      "Partir du questionnaire d'exemple (inscription à un atelier)</button></p>");
    $("#ed-exemple").addEventListener("click", function () { chargerExemple().catch(function (e) { message("error", "Chargement de l'exemple impossible : " + (e.message || e)); }); });
  }

  async function chargerExemple() {
    var ex = await fetch("exemples/inscription-atelier.json").then(function (r) { return r.json(); });
    var existantes = {};
    E.toutesColonnes.forEach(function (c) { existantes[c.colId] = true; });
    var actions = [];
    ex.etapes.forEach(function (et) {
      et.elements.forEach(function (el) {
        if (el.genre !== "question" || !el.colonne || existantes[el.colonne]) { return; }
        var info = { type: el.type || "Text", label: el.libelle || el.colonne };
        if (el.choix && el.choix.length) { info.widgetOptions = JSON.stringify({ choices: el.choix }); }
        actions.push(["AddColumn", E.tableId, el.colonne, info]);
        existantes[el.colonne] = true;
      });
    });
    if (actions.length) { await grist.docApi.applyUserActions(actions); }
    await chargerMeta();
    E.config = ex;
    E.selection = null;
    E.choixModifies = {};
    marquerModifie(true);
    afficher();
    message("info", "Questionnaire d'exemple chargé et colonnes créées. Vérifiez-le, puis cliquez sur « Enregistrer ».");
  }

  /* ---------- Vue « Questions » ---------- */

  function htmlBoutonIcone(action, icone, titre, attrs) {
    return "<button type=\"button\" class=\"fr-btn fr-btn--tertiary-no-outline fr-btn--sm " + icone + "\" data-action=\"" +
      action + "\" title=\"" + esc(titre) + "\" " + (attrs || "") + ">" + esc(titre) + "</button>";
  }

  function htmlStructure() {
    var utilisees = colonnesUtilisees();
    var libres = E.colonnes.filter(function (c) { return !utilisees[c.colId] && !c.isFormula && !estFichier(c); });
    var html = "";
    E.config.etapes.forEach(function (etape, i) {
      var choisie = E.selection && E.selection.type === "etape" && E.selection.id === etape.id;
      html += "<div class=\"ed-etape" + (choisie ? " est-choisi" : "") + "\" data-etape=\"" + etape.id + "\">";
      html += "<div class=\"ed-etape__entete\">" +
        "<button type=\"button\" class=\"ed-choisir\" data-action=\"choisir-etape\" data-id=\"" + etape.id + "\">" +
        "<span class=\"ed-etape__titre\">Étape " + (i + 1) + (etape.titre ? " · " + esc(etape.titre) : "") + "</span>" +
        (etape.condition && etape.condition.regles && etape.condition.regles.length ?
          " <span class=\"fr-badge fr-badge--sm fr-badge--purple-glycine\">Conditionnelle</span>" : "") +
        "</button>" +
        htmlBoutonIcone("monter-etape", "fr-icon-arrow-up-line", "Monter l'étape", "data-id=\"" + etape.id + "\"" + (i === 0 ? " disabled" : "")) +
        htmlBoutonIcone("descendre-etape", "fr-icon-arrow-down-line", "Descendre l'étape", "data-id=\"" + etape.id + "\"" + (i === E.config.etapes.length - 1 ? " disabled" : "")) +
        htmlBoutonIcone("supprimer-etape", "fr-icon-delete-line", "Supprimer l'étape", "data-id=\"" + etape.id + "\"") +
        "</div>";
      html += "<ol class=\"ed-liste\" data-etape=\"" + etape.id + "\">";
      if (!(etape.elements || []).length) {
        html += "<li class=\"ed-vide\">Étape vide : ajoutez une question ou un texte (ou glissez un élément ici).</li>";
      }
      (etape.elements || []).forEach(function (el) {
        var choisi = E.selection && E.selection.type === "element" && E.selection.id === el.id;
        var badges = "";
        if (el.genre === "question") {
          badges += "<span class=\"fr-badge fr-badge--sm\">" + esc(NOMS_FAMILLES[M.famille(typeElement(el))]) + "</span>";
          if (el.obligatoire) { badges += "<span class=\"fr-badge fr-badge--sm fr-badge--info\">Obligatoire</span>"; }
          if (el.aCreer) { badges += "<span class=\"fr-badge fr-badge--sm fr-badge--new\">Nouvelle colonne</span>"; }
        } else if (el.genre === "matrice") {
          badges += "<span class=\"fr-badge fr-badge--sm\">Tableau</span>";
          if (el.obligatoire) { badges += "<span class=\"fr-badge fr-badge--sm fr-badge--info\">Obligatoire</span>"; }
        } else if (el.genre === "media") {
          badges += "<span class=\"fr-badge fr-badge--sm fr-badge--grey\">" + esc(NOMS_MEDIAS[el.type] || "Média") + "</span>";
        } else {
          badges += "<span class=\"fr-badge fr-badge--sm fr-badge--grey\">Texte</span>";
        }
        if (el.condition && el.condition.regles && el.condition.regles.length) {
          badges += "<span class=\"fr-badge fr-badge--sm fr-badge--purple-glycine\">Conditionnelle</span>";
        }
        html += "<li class=\"ed-item" + (choisi ? " est-choisi" : "") + "\" draggable=\"true\" data-id=\"" + el.id + "\">" +
          "<span class=\"ed-poignee\" aria-hidden=\"true\" title=\"Glisser pour déplacer\">⋮⋮</span>" +
          "<button type=\"button\" class=\"ed-choisir\" data-action=\"choisir-element\" data-id=\"" + el.id + "\">" +
          "<span class=\"ed-item__libelle\">" + esc(libelleElement(el)) + "</span>" +
          "<span class=\"ed-item__meta\">" + badges + "</span></button>" +
          htmlBoutonIcone("monter-element", "fr-icon-arrow-up-line", "Monter", "data-id=\"" + el.id + "\"") +
          htmlBoutonIcone("descendre-element", "fr-icon-arrow-down-line", "Descendre", "data-id=\"" + el.id + "\"") +
          htmlBoutonIcone("supprimer-element", "fr-icon-delete-line", "Retirer du questionnaire", "data-id=\"" + el.id + "\"") +
          "</li>";
      });
      html += "</ol>";
      html += "<div class=\"ed-ajouts\">" +
        "<label class=\"fr-sr-only\" for=\"ajout-" + etape.id + "\">Ajouter une question à l'étape " + (i + 1) + "</label>" +
        "<select class=\"fr-select\" id=\"ajout-" + etape.id + "\" data-action=\"ajouter-question\" data-etape=\"" + etape.id + "\">" +
        "<option value=\"\" selected>+ Ajouter une question…</option>";
      if (libres.length) {
        html += "<optgroup label=\"Colonnes existantes non utilisées\">" + libres.map(function (c) {
          return "<option value=\"col:" + esc(c.colId) + "\">" + esc(c.label || c.colId) + "</option>";
        }).join("") + "</optgroup>";
      }
      html += "<optgroup label=\"Nouvelle question (crée une colonne)\">" + TYPES_NOUVELLE_QUESTION.map(function (t) {
        return "<option value=\"new:" + t[0] + "\">" + esc(t[1]) + "</option>";
      }).join("") + "</optgroup></select>" +
        "<button type=\"button\" class=\"fr-btn fr-btn--sm fr-btn--secondary fr-icon-add-line fr-btn--icon-left\" data-action=\"ajouter-texte\" data-etape=\"" +
        etape.id + "\">Texte</button>" +
        "<button type=\"button\" class=\"fr-btn fr-btn--sm fr-btn--secondary fr-icon-add-line fr-btn--icon-left\" data-action=\"ajouter-matrice\" data-etape=\"" +
        etape.id + "\">Tableau</button>" +
        "<button type=\"button\" class=\"fr-btn fr-btn--sm fr-btn--secondary fr-icon-add-line fr-btn--icon-left\" data-action=\"ajouter-media\" data-etape=\"" +
        etape.id + "\">Média</button></div>";
      html += "</div>";
    });
    html += "<button type=\"button\" class=\"fr-btn fr-btn--secondary fr-icon-add-line fr-btn--icon-left\" data-action=\"ajouter-etape\">Ajouter une étape</button>";
    return html;
  }

  function champTexte(prop, libelle, valeur, opts) {
    opts = opts || {};
    var id = "p-" + prop.replace(/\./g, "-");
    var controle = opts.multiligne ?
      "<textarea class=\"fr-input\" id=\"" + id + "\" rows=\"" + (opts.lignes || 3) + "\" data-prop=\"" + prop + "\">" + esc(valeur) + "</textarea>" :
      "<input class=\"fr-input\" type=\"" + (opts.type || "text") + "\" id=\"" + id + "\" data-prop=\"" + prop + "\" value=\"" + esc(valeur) + "\">";
    return "<div class=\"fr-input-group\"><label class=\"fr-label\" for=\"" + id + "\">" + esc(libelle) +
      (opts.aide ? "<span class=\"fr-hint-text\">" + esc(opts.aide) + "</span>" : "") + "</label>" + controle + "</div>";
  }

  function champSelect(prop, libelle, valeur, choix, aide) {
    var id = "p-" + prop.replace(/\./g, "-");
    return "<div class=\"fr-select-group\"><label class=\"fr-label\" for=\"" + id + "\">" + esc(libelle) +
      (aide ? "<span class=\"fr-hint-text\">" + esc(aide) + "</span>" : "") + "</label>" +
      "<select class=\"fr-select\" id=\"" + id + "\" data-prop=\"" + prop + "\">" +
      choix.map(function (c) {
        return "<option value=\"" + esc(c[0]) + "\"" + (String(c[0]) === String(valeur) ? " selected" : "") + ">" + esc(c[1]) + "</option>";
      }).join("") + "</select></div>";
  }

  function champCase(prop, libelle, coche, aide) {
    var id = "p-" + prop.replace(/\./g, "-");
    return "<div class=\"fr-checkbox-group\"><input type=\"checkbox\" id=\"" + id + "\" data-prop=\"" + prop + "\"" +
      (coche ? " checked" : "") + "><label class=\"fr-label\" for=\"" + id + "\">" + esc(libelle) +
      (aide ? "<span class=\"fr-hint-text\">" + esc(aide) + "</span>" : "") + "</label></div>";
  }

  function htmlValeurRegle(regle, i, cible) {
    if (!cible || M.OPERATEURS_SANS_VALEUR.indexOf(regle.operateur) >= 0) { return ""; }
    var fam = M.famille(typeElement(cible));
    if ((fam === "choix" || fam === "choix_multiple") && M.OPERATEURS_LISTE.indexOf(regle.operateur) >= 0) {
      var choisies = Array.isArray(regle.valeur) ? regle.valeur : (regle.valeur ? [regle.valeur] : []);
      var choix = choixElement(cible);
      if (!choix.length) { return "<p class=\"fr-text--sm\">Cette question n'a pas encore de choix.</p>"; }
      return "<fieldset class=\"fr-fieldset\"><legend class=\"fr-fieldset__legend fr-fieldset__legend--regular fr-text--sm\">Valeurs</legend>" +
        "<div class=\"ed-regle__valeurs\">" + choix.map(function (c, k) {
          var id = "r" + i + "-v" + k;
          return "<div class=\"fr-checkbox-group fr-checkbox-group--sm\"><input type=\"checkbox\" id=\"" + id + "\" data-regle=\"" + i +
            "\" data-rprop=\"valeur-liste\" value=\"" + esc(c) + "\"" + (choisies.indexOf(c) >= 0 ? " checked" : "") +
            "><label class=\"fr-label\" for=\"" + id + "\">" + esc(c) + "</label></div>";
        }).join("") + "</div></fieldset>";
    }
    var type = fam === "nombre" ? "number" : (fam === "date" ? "date" : "text");
    var aide = M.OPERATEURS_LISTE.indexOf(regle.operateur) >= 0 ? "Plusieurs valeurs : séparez-les par un point-virgule." : "";
    var valeur = Array.isArray(regle.valeur) ? regle.valeur.join(" ; ") : (regle.valeur === undefined || regle.valeur === null ? "" : regle.valeur);
    return "<div class=\"fr-input-group\"><label class=\"fr-label fr-text--sm\" for=\"r" + i + "-valeur\">Valeur" +
      (aide ? "<span class=\"fr-hint-text\">" + aide + "</span>" : "") + "</label>" +
      "<input class=\"fr-input\" type=\"" + type + "\" id=\"r" + i + "-valeur\" data-regle=\"" + i + "\" data-rprop=\"valeur\" value=\"" + esc(valeur) + "\"></div>";
  }

  function htmlCondition(obj) {
    var avant = questionsAvant(E.selection);
    var cond = obj.condition;
    var actif = !!(cond && cond.regles);
    var html = "<h3 class=\"fr-h6 ed-section-titre\">Logique conditionnelle</h3>";
    if (!avant.length && !actif) {
      return html + "<p class=\"fr-text--sm\">Aucune question n'est placée avant : ajoutez une question plus haut pour créer une condition.</p>";
    }
    html += "<div class=\"fr-toggle\"><input type=\"checkbox\" class=\"fr-toggle__input\" id=\"cond-actif\" data-action=\"condition-activer\"" +
      (actif ? " checked" : "") + "><label class=\"fr-toggle__label\" for=\"cond-actif\" data-fr-checked-label=\"Oui\" data-fr-unchecked-label=\"Non\">" +
      (E.selection.type === "etape" ? "Afficher cette étape seulement sous condition" : "Afficher seulement sous condition") + "</label></div>";
    if (!actif) { return html; }

    html += "<div class=\"fr-select-group\"><label class=\"fr-label\" for=\"cond-mode\">Afficher si</label>" +
      "<select class=\"fr-select\" id=\"cond-mode\" data-action=\"condition-mode\">" +
      "<option value=\"toutes\"" + (cond.mode !== "une" ? " selected" : "") + ">toutes les règles sont vraies (ET)</option>" +
      "<option value=\"une\"" + (cond.mode === "une" ? " selected" : "") + ">au moins une règle est vraie (OU)</option></select></div>";

    cond.regles.forEach(function (regle, i) {
      var cible = M.trouverElement(E.config, regle.element);
      var fam = cible ? M.famille(typeElement(cible)) : "texte";
      var ops = M.OPERATEURS_PAR_FAMILLE[fam] || [];
      html += "<div class=\"ed-regle\">" +
        "<div class=\"fr-select-group\"><label class=\"fr-label fr-text--sm\" for=\"r" + i + "-q\">Règle " + (i + 1) + " : question</label>" +
        "<select class=\"fr-select\" id=\"r" + i + "-q\" data-regle=\"" + i + "\" data-rprop=\"element\">" +
        (cible ? "" : "<option value=\"\" selected>Choisir une question</option>") +
        avant.map(function (q) {
          return "<option value=\"" + q.id + "\"" + (q.id === regle.element ? " selected" : "") + ">" + esc(q.libelle || q.colonne) + "</option>";
        }).join("") + "</select></div>" +
        "<div class=\"fr-select-group\"><label class=\"fr-label fr-text--sm\" for=\"r" + i + "-op\">Condition</label>" +
        "<select class=\"fr-select\" id=\"r" + i + "-op\" data-regle=\"" + i + "\" data-rprop=\"operateur\">" +
        ops.map(function (op) {
          return "<option value=\"" + op + "\"" + (op === regle.operateur ? " selected" : "") + ">" + esc(M.OPERATEURS[op]) + "</option>";
        }).join("") + "</select></div>" +
        htmlValeurRegle(regle, i, cible) +
        "<div><button type=\"button\" class=\"fr-btn fr-btn--sm fr-btn--tertiary fr-icon-delete-line fr-btn--icon-left\" data-action=\"regle-supprimer\" data-regle=\"" + i + "\">Supprimer la règle</button></div>" +
        "</div>";
    });
    html += "<button type=\"button\" class=\"fr-btn fr-btn--sm fr-btn--secondary fr-icon-add-line fr-btn--icon-left fr-mb-2w\" data-action=\"regle-ajouter\">Ajouter une règle</button>";
    var resume = resumeCondition(cond);
    if (resume) {
      html += "<p class=\"fr-text--sm ed-resume\"><strong>Affiché si :</strong> " + esc(resume) + "</p>";
    }
    return html;
  }

  function htmlProprietes() {
    var obj = objetChoisi();
    if (!obj) {
      return "<h2 class=\"fr-h5\">Mode d'emploi</h2>" +
        "<ol class=\"fr-text--sm\">" +
        "<li>Choisissez une étape ou une question à gauche pour la modifier.</li>" +
        "<li>Ajoutez des questions : une colonne existante ou une nouvelle colonne (créée à l'enregistrement).</li>" +
        "<li>Pour la logique conditionnelle, sélectionnez une question ou une étape, puis activez « Afficher seulement sous condition ».</li>" +
        "<li>Vérifiez dans l'onglet « Aperçu », puis cliquez sur « Enregistrer ».</li>" +
        "<li>Dans l'onglet « Publication », connectez le formulaire Grist publié pour obtenir le lien à diffuser.</li>" +
        "</ol>";
    }
    var html = "";
    if (E.selection.type === "etape") {
      var index = E.config.etapes.indexOf(obj) + 1;
      html += "<h2 class=\"fr-h5\">Étape " + index + "</h2>";
      html += champTexte("titre", "Titre de l'étape", obj.titre || "", { aide: "Affiché dans l'indicateur d'étapes." });
      html += champTexte("description", "Texte d'introduction de l'étape", obj.description || "", { multiligne: true, aide: "Facultatif. **gras** et [lien](https://…) acceptés." });
      html += htmlCondition(obj);
      return html;
    }

    if (obj.genre === "texte") {
      html += "<h2 class=\"fr-h5\">Bloc de texte</h2>";
      html += champSelect("style", "Présentation", obj.style || "paragraphe", STYLES_TEXTE);
      html += champTexte("titre", "Titre", obj.titre || "", { aide: "Facultatif (obligatoire pour un intertitre)." });
      if (obj.style !== "intertitre") {
        html += champTexte("texte", "Texte", obj.texte || "", { multiligne: true, lignes: 5, aide: "Une ligne vide sépare deux paragraphes. **gras** et [lien](https://…) acceptés." });
      }
    } else if (obj.genre === "media") {
      html += "<h2 class=\"fr-h5\">Média</h2>";
      html += champSelect("type", "Type de média", obj.type || "image", TYPES_MEDIA);
      html += champTexte("adresse", "Adresse du fichier", obj.adresse || "", {
        type: "url",
        aide: "Doit commencer par https://. Pour un fichier déposé dans Grist : adresse de téléchargement de la pièce jointe (le document doit être lisible publiquement)."
      });
      html += champTexte("titre", "Légende (facultatif)", obj.titre || "");
      if ((obj.type || "image") === "image") {
        html += champTexte("description", "Texte alternatif de l'image", obj.description || "", { aide: "Obligatoire : décrit l'image pour les personnes qui ne la voient pas." });
      }
      if (obj.type === "audio" || obj.type === "video") {
        html += champTexte("transcription", "Transcription", obj.transcription || "", { multiligne: true, lignes: 5, aide: "Obligatoire pour l'accessibilité (RGAA). S'affiche dans un bloc repliable." });
      }
      if (obj.type === "pdf") {
        html += champSelect("affichagePdf", "Présentation", obj.affichagePdf || "integre", [
          ["integre", "Document affiché dans la page + lien de téléchargement"],
          ["lien", "Lien de téléchargement seulement"]
        ]);
      }
    } else if (obj.genre === "matrice") {
      html += "<h2 class=\"fr-h5\">Tableau de choix</h2>";
      html += "<p class=\"fr-text--sm\">Une réponse par ligne. Chaque ligne crée une colonne de choix dans la table Grist, à l'enregistrement.</p>";
      html += champTexte("libelle", "Intitulé du tableau", obj.libelle || "");
      html += champTexte("aide", "Texte d'aide", obj.aide || "");
      html += champCase("obligatoire", "Une réponse par ligne obligatoire", !!obj.obligatoire);
      html += champTexte("lignesTexte", "Lignes", (obj.lignes || []).map(function (l) { return l.libelle; }).join("\n"), {
        multiligne: true, lignes: 4, aide: "Une ligne par sujet à évaluer."
      });
      html += champTexte("colonnesTexte", "Colonnes (réponses possibles)", (obj.colonnesChoix || []).join("\n"), {
        multiligne: true, lignes: 4, aide: "Une réponse par ligne, par exemple : Pas d'accord, D'accord."
      });
    } else {
      var type = typeElement(obj);
      var fam = M.famille(type);
      html += "<h2 class=\"fr-h5\">Question</h2>";
      html += "<p class=\"fr-text--sm\">" + (obj.aCreer ?
        "Nouvelle colonne <strong>" + esc(NOMS_FAMILLES[fam]) + "</strong>, créée à l'enregistrement." :
        "Colonne Grist : <code>" + esc(obj.colonne) + "</code> · " + esc(NOMS_FAMILLES[fam]) + " (" + esc(type) + ")") + "</p>";
      html += champTexte("libelle", "Intitulé de la question", obj.libelle || "");
      html += champTexte("aide", "Texte d'aide", obj.aide || "", { aide: "Facultatif. S'affiche sous l'intitulé." });
      html += champCase("obligatoire", "Réponse obligatoire", !!obj.obligatoire,
        fam === "booleen" && obj.affichage !== "ouinon" ? "La case devra être cochée." : "S'applique seulement si la question est affichée.");
      html += champSelect("prerempli", "Si la réponse est préremplie par l'adresse", obj.prerempli || "modifiable", [
        ["modifiable", "Modifiable par la personne"], ["fige", "Affichée, non modifiable"], ["masquee", "Masquée (la valeur est quand même envoyée)"]],
        "Lien de la forme ?pre_" + (obj.colonne || "Colonne") + "=valeur. Si la valeur n'est pas reconnue, la question reste ordinaire.");
      var affichages = M.AFFICHAGES[fam] || [];
      if (affichages.length > 1) {
        html += champSelect("affichage", "Présentation", obj.affichage || M.affichageParDefaut(fam, type), affichages);
      }
      if (fam === "texte" && obj.affichage !== "long") {
        html += champTexte("indication", "Exemple de saisie (facultatif)", obj.indication || "", { aide: "Le DSFR recommande de placer l'exemple dans le texte d'aide." });
      }
      if (fam === "texte") {
        html += champTexte("longueurMax", "Nombre maximal de caractères (facultatif)", obj.longueurMax || "", { type: "number" });
      }
      if (fam === "nombre" && obj.affichage === "echelle") {
        html += champTexte("min", "Note la plus basse", obj.min === undefined ? "" : obj.min, { type: "number", aide: "Par défaut 1." });
        html += champTexte("max", "Note la plus haute", obj.max === undefined ? "" : obj.max, { type: "number", aide: "Par défaut 5. Onze notes au plus." });
        html += champTexte("libelleMin", "Sens de la note la plus basse (facultatif)", obj.libelleMin || "", { aide: "Par exemple : Pas du tout satisfait." });
        html += champTexte("libelleCentre", "Sens de la note du milieu (facultatif)", obj.libelleCentre || "", { aide: "Affiché seulement si le nombre de notes est impair, par exemple : Neutre." });
        html += champTexte("libelleMax", "Sens de la note la plus haute (facultatif)", obj.libelleMax || "", { aide: "Par exemple : Tout à fait satisfait." });
      } else if (fam === "nombre") {
        html += champTexte("min", "Valeur minimale (facultatif)", obj.min === undefined ? "" : obj.min, { type: "number" });
        html += champTexte("max", "Valeur maximale (facultatif)", obj.max === undefined ? "" : obj.max, { type: "number" });
      }
      if (fam === "choix" || fam === "choix_multiple") {
        html += champTexte("choix", "Choix proposés", choixAffiches(obj).join("\n"), {
          multiligne: true, lignes: 5,
          aide: "Un choix par ligne. À l'enregistrement, la liste de choix de la colonne Grist est mise à jour."
        });
      }
      var affiche = obj.affichage || M.affichageParDefaut(fam, type);
      if ((fam === "choix_multiple" || fam === "ref_multiple") && affiche !== "classement") {
        html += champTexte("choixMin", "Nombre minimal de choix (facultatif)", obj.choixMin || "", { type: "number", aide: "Par exemple 1." });
        html += champTexte("choixMax", "Nombre maximal de choix (facultatif)", obj.choixMax || "", { type: "number", aide: "Par exemple 3 : la personne ne peut pas en cocher davantage." });
      }
      if ((fam === "choix" || fam === "choix_multiple") && affiche !== "classement") {
        html += champCase("autre", "Ajouter un choix « Autre » avec précision", !!obj.autre,
          "Un champ libre apparaît quand « Autre » est choisi ; la précision va dans une colonne Grist dédiée.");
        if (obj.autre) { html += champTexte("libelleAutre", "Libellé du choix « Autre »", obj.libelleAutre || "", { aide: "Par défaut : Autre." }); }
      }
      if (fam === "choix" || fam === "choix_multiple" || fam === "ref" || fam === "ref_multiple") {
        html += champCase("aleatoire", "Présenter les choix dans un ordre aléatoire", !!obj.aleatoire,
          affiche === "classement" ? "L'ordre de départ change à chaque affichage." : "L'ordre change à chaque affichage, pour éviter de favoriser le premier choix.");
      }
      if (fam === "texte" || fam === "nombre" || fam === "date") {
        html += champTexte("defaut", "Réponse par défaut (facultatif)", obj.defaut === undefined ? "" : obj.defaut, {
          type: fam === "date" ? (affiche === "datetime" ? "datetime-local" : "date") : (affiche === "heure" ? "time" : (fam === "nombre" ? "number" : "text")),
          aide: "Pré-remplit la réponse ; la personne peut la modifier."
        });
      } else if (fam === "choix") {
        html += champSelect("defaut", "Réponse par défaut (facultatif)", obj.defaut || "", [["", "Aucune"]].concat(choixAffiches(obj).map(function (c) { return [c, c]; })));
      } else if (fam === "choix_multiple") {
        html += champTexte("defaut", "Réponses cochées par défaut (facultatif)", Array.isArray(obj.defaut) ? obj.defaut.join("\n") : (obj.defaut || ""), {
          multiligne: true, lignes: 3,
          aide: affiche === "classement" ? "Ordre de départ proposé, un choix par ligne." : "Un choix par ligne."
        });
      } else if (fam === "booleen") {
        html += champCase("defaut", "Coché ou « Oui » par défaut", obj.defaut === true);
      }
      if (fam === "ref" || fam === "ref_multiple") {
        html += "<p class=\"fr-text--sm\">Les choix proviennent de la table liée dans Grist.</p>";
      }
    }
    var etapeActuelle = etapeDeLElement(obj.id);
    html += champSelect("_etape", "Étape", etapeActuelle ? etapeActuelle.id : "", E.config.etapes.map(function (e, i) {
      return [e.id, "Étape " + (i + 1) + (e.titre ? " · " + e.titre : "")];
    }));
    html += htmlCondition(obj);
    return html;
  }

  function afficherQuestions() {
    var vue = $("#vue");
    vue.innerHTML = "<div class=\"ed-grille\"><div class=\"ed-structure\" id=\"structure\"></div>" +
      "<div class=\"ed-panneau ed-proprietes\" id=\"proprietes\"></div></div>";
    rafraichirStructure();
    rafraichirProprietes();
  }

  function rafraichirStructure() {
    var s = $("#structure");
    if (s) { s.innerHTML = htmlStructure(); }
  }

  function rafraichirProprietes() {
    var p = $("#proprietes");
    if (p) { p.innerHTML = htmlProprietes(); }
  }

  /* ---------- Vue « Textes » ---------- */

  function afficherTextes() {
    var c = E.config;
    c.envoi = c.envoi || {};
    var html = "<div class=\"ed-panneau ed-textes\">";
    html += "<h2 class=\"fr-h5\">Présentation du questionnaire</h2>";
    html += champTexte("c.titre", "Titre du questionnaire", c.titre || "");
    html += champTexte("c.introduction", "Texte d'introduction", c.introduction || "", { multiligne: true, lignes: 4, aide: "Affiché sur la première étape. **gras** et [lien](https://…) acceptés." });
    html += champSelect("c.mentionObligatoire", "Signalement des champs obligatoires", c.mentionObligatoire || "asterisque", [
      ["asterisque", "Astérisque (*) sur les champs obligatoires"],
      ["facultatif", "« Sauf mention contraire, tous les champs sont obligatoires » + (facultatif)"]
    ]);
    html += "<h2 class=\"fr-h5 ed-section-titre\">Envoi</h2>";
    html += champTexte("c.envoi.bouton", "Libellé du bouton d'envoi", c.envoi.bouton || "Envoyer");
    html += champTexte("c.envoi.titreConfirmation", "Titre du message de confirmation", c.envoi.titreConfirmation || "");
    html += champTexte("c.envoi.messageConfirmation", "Message de confirmation", c.envoi.messageConfirmation || "", { multiligne: true });
    html += champCase("c.envoi.autreReponse", "Proposer d'envoyer une autre réponse", !!c.envoi.autreReponse);
    c.ouverture = c.ouverture || {};
    html += "<h2 class=\"fr-h5 ed-section-titre\">Période de réponse</h2>";
    html += "<p class=\"fr-text--sm\">Facultatif. Avant l'ouverture ou après la clôture, la page n'affiche qu'un message et n'envoie rien. Ce contrôle se fait dans le navigateur : il guide les personnes, il n'empêche pas un envoi fabriqué à la main. Pour une limite stricte, dépubliez le formulaire Grist à la clôture (ou utilisez un outil qui contrôle les dates dans Grist, comme grist-consultation).</p>";
    html += champTexte("c.ouverture.debut", "Réponses acceptées à partir du (facultatif)", c.ouverture.debut || "", { type: "datetime-local" });
    html += champTexte("c.ouverture.fin", "Réponses acceptées jusqu'au (facultatif)", c.ouverture.fin || "", { type: "datetime-local", aide: "Date et heure de clôture, heure de l'appareil de la personne qui répond." });
    html += champTexte("c.ouverture.messageApres", "Message après la clôture (facultatif)", c.ouverture.messageApres || "", { multiligne: true, lignes: 2, aide: "Par défaut : « Les réponses étaient acceptées jusqu'au … »." });
    html += "<h2 class=\"fr-h5 ed-section-titre\">Données personnelles</h2>";
    html += champTexte("c.mentionsDonnees", "Mentions sur le traitement des données", c.mentionsDonnees || "", {
      multiligne: true, lignes: 5,
      aide: "Affichées sous le formulaire : finalité, responsable, durée de conservation, droits et contact."
    });
    html += "</div>";
    $("#vue").innerHTML = html;
  }

  /* ---------- Vue « En-tête et pied » ---------- */

  // Anciennes configurations : « entete » devient « page » (réglages communs aux outils).
  function migrerPage(c) {
    if (c.page) { return c.page; }
    var e = c.entete || {};
    c.page = {
      marque: e.marque !== undefined ? e.marque : "République\nfrançaise",
      titre: e.service || "", sousTitre: e.sousTitre || "",
      boutons: [], pied: { texte: e.piedDePage || "", accessibilite: "non conforme" }
    };
    delete c.entete;
    return c.page;
  }

  function afficherPage() {
    var z = document.createElement("div");
    z.className = "ed-panneau ed-textes";
    $("#vue").innerHTML = "";
    $("#vue").appendChild(z);
    window.PageEditeur.monter(z, migrerPage(E.config), function () { marquerModifie(true); });
  }

  /* ---------- Vue « Aperçu » ---------- */

  async function chargerRefValues() {
    for (var i = 0; i < E.colonnes.length; i++) {
      var c = E.colonnes[i];
      var fam = M.famille(c.type);
      if ((fam !== "ref" && fam !== "ref_multiple") || E.refValues[c.colId]) { continue; }
      try {
        var tableLiee = c.type.split(":")[1];
        var donnees = await grist.docApi.fetchTable(tableLiee);
        var colVisible = (E.toutesColonnesDoc || []).find(function (x) { return x.id === c.visibleCol; });
        var cle = colVisible ? colVisible.colId : "id";
        E.refValues[c.colId] = (donnees.id || []).map(function (id, k) { return [id, cle === "id" ? id : donnees[cle][k]]; })
          .filter(function (r) { return r[1] !== null && r[1] !== ""; });
      } catch (e) {
        E.refValues[c.colId] = [];
      }
    }
  }

  function champsPourRendu() {
    var champs = {};
    E.colonnes.forEach(function (c) {
      champs[c.colId] = {
        type: c.type,
        choix: E.choixModifies[c.colId] || json(c.widgetOptions, {}).choices || [],
        refValues: E.refValues[c.colId] || []
      };
    });
    return champs;
  }

  async function afficherApercu() {
    $("#vue").innerHTML = "<div class=\"fr-notice fr-notice--info fr-mb-2w\"><div class=\"fr-container\"><div class=\"fr-notice__body\">" +
      "<p class=\"fr-notice__title\">Aperçu interactif : la logique conditionnelle fonctionne, rien n'est enregistré.</p></div></div></div>" +
      "<div class=\"ed-apercu\" id=\"apercu\"></div>";
    if (!E.toutesColonnesDoc) {
      E.toutesColonnesDoc = colonnesEnLignes(await grist.docApi.fetchTable("_grist_Tables_column"));
    }
    await chargerRefValues();
    R.monter($("#apercu"), { config: E.config, champs: champsPourRendu(), apercu: true });
  }

  /* ---------- Vue « Publication » ---------- */

  function lienPublic() {
    var lien = E.config.publication && E.config.publication.lienGrist;
    if (!lien) { return null; }
    var u = new URL("formulaire.html", location.href);
    u.search = "?grist=" + encodeURIComponent(lien);
    return u.href;
  }

  function afficherPublication() {
    var pub = E.config.publication || {};
    var lien = lienPublic();
    var html = "<div class=\"ed-panneau ed-textes\">";
    html += "<h2 class=\"fr-h5\">1. Publier le formulaire Grist (une seule fois)</h2>" +
      "<ol class=\"fr-text--sm\">" +
      "<li>Dans Grist : <strong>Ajouter</strong> › <strong>Ajouter une page</strong> › <strong>Formulaire</strong>, sur la table « " + esc(E.tableId) + " ».</li>" +
      "<li>Cliquez sur <strong>Publier</strong>, puis sur <strong>Partager</strong>, et copiez le lien.</li>" +
      "<li>Ne diffusez pas ce lien Grist : il ne connaît pas la logique conditionnelle. Diffusez le lien DSFR (point 3).</li>" +
      "</ol>";
    html += "<h2 class=\"fr-h5 ed-section-titre\">2. Connecter le formulaire publié</h2>";
    html += "<div class=\"fr-input-group\"><label class=\"fr-label\" for=\"lien-grist\">Lien du formulaire Grist publié" +
      "<span class=\"fr-hint-text\">Exemple : https://grist.numerique.gouv.fr/o/organisation/forms/…/7</span></label>" +
      "<input class=\"fr-input\" type=\"url\" id=\"lien-grist\" value=\"" + esc(pub.lienGrist || "") + "\"></div>";
    html += "<button type=\"button\" class=\"fr-btn fr-icon-link fr-btn--icon-left\" data-action=\"connecter\">Vérifier et connecter</button>";
    html += "<div id=\"controles\" class=\"fr-mt-2w\" aria-live=\"polite\"></div>";
    html += "<h2 class=\"fr-h5 ed-section-titre\">3. Lien à diffuser</h2>";
    if (lien) {
      var iframe = "<iframe src=\"" + lien + "&integre=1\" title=\"" + esc(E.config.titre || "Questionnaire") +
        "\" style=\"width:100%;height:900px;border:0\"></iframe>";
      html += "<div class=\"fr-input-group\"><label class=\"fr-label\" for=\"lien-public\">Lien public du questionnaire DSFR</label>" +
        "<input class=\"fr-input ed-code\" type=\"text\" readonly id=\"lien-public\" value=\"" + esc(lien) + "\"></div>" +
        "<ul class=\"fr-btns-group fr-btns-group--inline fr-btns-group--sm\">" +
        "<li><button type=\"button\" class=\"fr-btn fr-btn--secondary\" data-action=\"copier\" data-cible=\"lien-public\">Copier le lien</button></li>" +
        "<li><a class=\"fr-btn fr-btn--tertiary\" href=\"" + esc(lien) + "\" target=\"_blank\" rel=\"noopener\" title=\"Ouvrir le questionnaire - nouvelle fenêtre\">Ouvrir le questionnaire</a></li></ul>" +
        "<div class=\"fr-input-group\"><label class=\"fr-label\" for=\"code-integration\">Code d'intégration (iframe, sans en-tête ni pied de page)</label>" +
        "<textarea class=\"fr-input ed-code\" readonly rows=\"3\" id=\"code-integration\">" + esc(iframe) + "</textarea></div>";
    } else {
      html += "<p class=\"fr-text--sm\">Le lien apparaîtra ici une fois le formulaire connecté.</p>";
    }
    html += "<div class=\"fr-callout fr-mt-3w\"><h3 class=\"fr-callout__title\">Public ou réservé ?</h3><p class=\"fr-callout__text fr-text--sm\">Le lien ci-dessus est public : toute personne qui l'a peut répondre, sans compte. Pour un questionnaire interne, ne le diffusez pas : invitez les personnes dans le document Grist (<strong>Partager</strong>, rôle Éditeur) et envoyez-leur l'adresse de la page Grist qui contient le formulaire.</p></div>";
    html += "</div>";
    $("#vue").innerHTML = html;
  }

  function afficherJson() {
    var html = "<div class=\"ed-panneau ed-textes\">";
    html += "<h2 class=\"fr-h5\">Export et import de la configuration</h2>" +
      "<p class=\"fr-text--sm\">Copiez ce texte pour réutiliser la structure dans un autre document. Il ne contient aucune réponse.</p>" +
      "<div class=\"fr-input-group\"><label class=\"fr-label\" for=\"config-json\">Configuration (JSON)</label>" +
      "<textarea class=\"fr-input ed-code\" rows=\"6\" id=\"config-json\">" + esc(JSON.stringify(E.config, null, 2)) + "</textarea></div>" +
      "<ul class=\"fr-btns-group fr-btns-group--inline fr-btns-group--sm\">" +
      "<li><button type=\"button\" class=\"fr-btn fr-btn--secondary\" data-action=\"copier\" data-cible=\"config-json\">Copier</button></li>" +
      "<li><button type=\"button\" class=\"fr-btn fr-btn--tertiary\" data-action=\"importer\">Remplacer par le texte ci-dessus</button></li></ul>";
    html += "</div>";
    $("#vue").innerHTML = html;
  }

  async function connecter() {
    var zone = $("#controles");
    var lien = $("#lien-grist").value.trim();
    var cible = M.analyserLienGrist(lien);
    var lignes = [];
    function rendre(type) {
      zone.innerHTML = "<div class=\"fr-alert fr-alert--" + type + " fr-alert--sm\"><ul class=\"ed-controles\">" +
        lignes.map(function (l) { return "<li>" + l + "</li>"; }).join("") + "</ul></div>";
    }
    if (!cible) {
      lignes.push("Ce lien n'est pas un lien de formulaire Grist publié (il doit contenir « /forms/ »).");
      return rendre("error");
    }
    try {
      var sections = colonnesEnLignes(await grist.docApi.fetchTable("_grist_Views_section"));
      var section = sections.find(function (s) { return s.id === cible.section; });
      if (!section || section.parentKey !== "form") {
        lignes.push("Ce formulaire n'existe pas dans ce document. Vérifiez que vous avez copié le lien du bon document.");
        return rendre("error");
      }
      if (section.tableRef !== E.tableRef) {
        lignes.push("Ce formulaire porte sur une autre table. Il doit porter sur la table « " + esc(E.tableId) + " ».");
        return rendre("error");
      }
      lignes.push("Formulaire trouvé sur la table « " + esc(E.tableId) + " ».");
      if (!json(section.shareOptions, {}).publish) {
        lignes.push("Le formulaire n'est pas publié : cliquez sur « Publier » dans la page du formulaire Grist.");
        return rendre("error");
      }
      lignes.push("Formulaire publié.");

      var publicationAvant = E.config.publication;
      E.config.publication = { lienGrist: lien };
      await enregistrer(true);

      // La colonne de configuration et les colonnes de référence doivent faire partie
      // du formulaire publié pour être lisibles à travers le lien de partage.
      var champsSection = colonnesEnLignes(await grist.docApi.fetchTable("_grist_Views_section_field"))
        .filter(function (f) { return f.parentId === cible.section; });
      var presentes = {};
      champsSection.forEach(function (f) { presentes[f.colRef] = true; });
      var utilisees = colonnesUtilisees();
      var aAjouter = E.toutesColonnes.filter(function (c) {
        if (presentes[c.id]) { return false; }
        if (c.colId === M.NOM_COLONNE_CONFIG) { return true; }
        if (colonnesCompagnes()[c.colId]) { return true; }
        var fam = M.famille(c.type);
        return utilisees[c.colId] && (fam === "ref" || fam === "ref_multiple");
      });
      if (aAjouter.length) {
        await grist.docApi.applyUserActions(aAjouter.map(function (c, k) {
          return ["AddRecord", "_grist_Views_section_field", null, { parentId: cible.section, colRef: c.id, parentPos: 1000 + k }];
        }));
        lignes.push("Colonnes ajoutées au formulaire publié : " + aAjouter.map(function (c) { return esc(c.colId); }).join(", ") + ".");
      }

      // Test réel, comme le ferait un visiteur anonyme.
      var reponse = await fetch(cible.base + "/forms/" + cible.section);
      if (!reponse.ok) {
        // Lien refusé : on ne garde pas un lien à diffuser qui ne marche pas.
        E.config.publication = publicationAvant;
        await enregistrer(true);
        lignes.push("Le formulaire n'est pas lisible publiquement (erreur " + reponse.status + "). " +
          "Copiez le lien donné par le bouton « Partager » de la page du formulaire Grist publié.");
        return rendre("error");
      }
      var form = await reponse.json();
      var champConfig = Object.values(form.formFieldsById).find(function (f) { return f.colId === M.NOM_COLONNE_CONFIG; });
      var lue = champConfig && json(champConfig.description, null);
      if (!lue || lue.majLe !== E.config.majLe) {
        lignes.push("La configuration n'est pas encore lisible à travers le lien public. Réessayez dans quelques secondes.");
        return rendre("warning");
      }
      lignes.push("Configuration lisible à travers le lien public : le questionnaire DSFR est prêt.");
      rendre("success");
      afficherPublication();
      $("#controles").innerHTML = zone.innerHTML;
    } catch (e) {
      lignes.push("Erreur : " + esc(e.message || e));
      rendre("error");
    }
  }

  /* ---------- Enregistrement ---------- */

  async function enregistrer(silencieux) {
    var problemes = M.verifierConfig(E.config);
    var bouton = $("#enregistrer");
    bouton.disabled = true;
    try {
      // 1. Créer les nouvelles colonnes.
      var nouvelles = toutesQuestions().map(function (o) { return o.element; }).filter(function (el) { return el.aCreer; });
      if (nouvelles.length) {
        var res = await grist.docApi.applyUserActions(nouvelles.map(function (el) {
          var info = { type: el.aCreer.type, label: el.libelle || "Question" };
          if (el.choix && el.choix.length) {
            var lesChoix = el.choix.slice();
            var libAutre = el.libelleAutre || M.LIBELLE_AUTRE;
            if (el.autre && lesChoix.indexOf(libAutre) < 0) { lesChoix.push(libAutre); }
            info.widgetOptions = JSON.stringify({ choices: lesChoix });
          }
          if (el.affichage === "lien") { info.widgetOptions = JSON.stringify({ widget: "HyperLink" }); }
          return ["AddColumn", E.tableId, sanitizerColId(el.libelle), info];
        }));
        nouvelles.forEach(function (el, i) {
          el.colonne = res.retValues[i].colId;
          el.type = el.aCreer.type;
          delete el.aCreer;
        });
      }

      // 1b. Colonnes compagnes : précision du choix « Autre » et une colonne de choix par ligne de tableau.
      var compagnes = [];
      toutesQuestions().forEach(function (o) {
        if (o.element.autre && o.element.colonne && !o.element.colonneAutre) { compagnes.push({ el: o.element }); }
      });
      M.elementsOrdonnes(E.config).forEach(function (o) {
        if (o.element.genre !== "matrice") { return; }
        (o.element.lignes || []).forEach(function (l) { if (!l.colonne) { compagnes.push({ m: o.element, l: l }); } });
      });
      if (compagnes.length) {
        var resC = await grist.docApi.applyUserActions(compagnes.map(function (c) {
          if (c.el) {
            var nomQ = c.el.libelle || "Question";
            return ["AddColumn", E.tableId, sanitizerColId(nomQ + " precision"), { type: "Text", label: nomQ + " (précision)" }];
          }
          var nomM = (c.m.libelle || "Tableau") + " - " + c.l.libelle;
          return ["AddColumn", E.tableId, sanitizerColId(nomM), { type: "Choice", label: nomM, widgetOptions: JSON.stringify({ choices: c.m.colonnesChoix || [] }) }];
        }));
        compagnes.forEach(function (c, i) {
          if (c.el) { c.el.colonneAutre = resC.retValues[i].colId; } else { c.l.colonne = resC.retValues[i].colId; }
        });
      }

      // 1c. Les choix des colonnes existantes suivent le tableau (colonnes) et l'option « Autre ».
      M.elementsOrdonnes(E.config).forEach(function (o) {
        var el = o.element;
        if (el.genre === "matrice") {
          (el.lignes || []).forEach(function (l) {
            var cc = colonne(l.colonne);
            if (cc && JSON.stringify(json(cc.widgetOptions, {}).choices || []) !== JSON.stringify(el.colonnesChoix || [])) {
              E.choixModifies[l.colonne] = (el.colonnesChoix || []).slice();
            }
          });
        } else if (el.genre === "question" && el.autre && el.colonne && colonne(el.colonne)) {
          var libA = el.libelleAutre || M.LIBELLE_AUTRE;
          var base = (E.choixModifies[el.colonne] || json(colonne(el.colonne).widgetOptions, {}).choices || []).filter(function (x) { return x !== libA; });
          E.choixModifies[el.colonne] = base.concat([libA]);
        }
      });

      // 2. Mettre à jour les listes de choix modifiées.
      var actions = [];
      Object.keys(E.choixModifies).forEach(function (colId) {
        var c = colonne(colId);
        if (!c) { return; }
        var opts = json(c.widgetOptions, {});
        opts.choices = E.choixModifies[colId];
        actions.push(["ModifyColumn", E.tableId, colId, { widgetOptions: JSON.stringify(opts) }]);
      });

      // 3. Garder un instantané du type et des choix dans la configuration (secours).
      toutesQuestions().forEach(function (o) {
        var el = o.element;
        el.type = typeElement(el);
        var ch = choixElement(el);
        if (ch.length) { el.choix = ch; } else { delete el.choix; }
      });

      // 4. Écrire la configuration dans la description de la colonne technique.
      migrerPage(E.config);
      E.config.version = M.VERSION;
      E.config.majLe = new Date().toISOString();
      if (!E.colConfig) {
        actions.push(["AddColumn", E.tableId, M.NOM_COLONNE_CONFIG, { type: "Text", label: M.NOM_COLONNE_CONFIG }]);
      }
      actions.push(["ModifyColumn", E.tableId, M.NOM_COLONNE_CONFIG, { description: JSON.stringify(E.config) }]);
      await grist.docApi.applyUserActions(actions);

      E.choixModifies = {};
      await chargerMeta();
      E.toutesColonnesDoc = null;
      marquerModifie(false);
      if (problemes.length) {
        message("warning", "Enregistré, mais à vérifier : " + problemes.join(" "));
      } else if (!silencieux) {
        message("success", "Questionnaire enregistré.");
      }
      if (E.vue === "questions") { afficherQuestions(); }
    } catch (e) {
      message("error", "Échec de l'enregistrement : " + (e.message || e));
      throw e;
    } finally {
      bouton.disabled = false;
    }
  }

  /* ---------- Actions de structure ---------- */

  function deplacer(liste, objet, sens) {
    var i = liste.indexOf(objet);
    var j = i + sens;
    if (i < 0 || j < 0 || j >= liste.length) { return false; }
    liste.splice(i, 1);
    liste.splice(j, 0, objet);
    return true;
  }

  function deplacerElement(id, sens) {
    var etape = etapeDeLElement(id);
    var el = M.trouverElement(E.config, id);
    if (deplacer(etape.elements, el, sens)) { return; }
    // En bout d'étape : passer à l'étape voisine.
    var k = E.config.etapes.indexOf(etape) + sens;
    if (k < 0 || k >= E.config.etapes.length) { return; }
    etape.elements.splice(etape.elements.indexOf(el), 1);
    var voisine = E.config.etapes[k];
    voisine.elements = voisine.elements || [];
    if (sens < 0) { voisine.elements.push(el); } else { voisine.elements.unshift(el); }
  }

  function supprimerReferences(id) {
    // Les règles qui visaient l'élément supprimé sont retirées.
    function nettoyer(obj) {
      if (obj.condition && obj.condition.regles) {
        obj.condition.regles = obj.condition.regles.filter(function (r) { return r.element !== id; });
        if (!obj.condition.regles.length) { obj.condition = null; }
      }
    }
    E.config.etapes.forEach(function (e) { nettoyer(e); (e.elements || []).forEach(nettoyer); });
  }

  function ajouterQuestion(idEtape, valeur) {
    var etape = trouverEtape(idEtape);
    var el;
    if (valeur.indexOf("col:") === 0) {
      var c = colonne(valeur.slice(4));
      el = {
        id: M.nouvelId("q"), genre: "question", colonne: c.colId, libelle: c.label || c.colId,
        aide: c.description || "", obligatoire: false, type: c.type
      };
    } else {
      var p = valeur.slice(4).split("|");
      var typeGrist = p[0] === "DateTime" ? "DateTime:Europe/Paris" : p[0];
      el = {
        id: M.nouvelId("q"), genre: "question", colonne: null, libelle: "Nouvelle question",
        aide: "", obligatoire: false, type: typeGrist, affichage: p[1], aCreer: { type: typeGrist }
      };
      if (p[0] === "Choice" || p[0] === "ChoiceList") { el.choix = ["Option 1", "Option 2"]; }
    }
    etape.elements = etape.elements || [];
    etape.elements.push(el);
    E.selection = { type: "element", id: el.id };
  }

  /* ---------- Événements ---------- */

  function surClic(ev) {
    var b = ev.target.closest("[data-action]");
    if (!b || b.tagName === "SELECT" || (b.tagName === "INPUT" && b.type !== "button")) { return; }
    var action = b.getAttribute("data-action");
    var id = b.getAttribute("data-id");
    var structureChangee = true;

    switch (action) {
      case "choisir-etape": E.selection = { type: "etape", id: id }; structureChangee = false; break;
      case "choisir-element": E.selection = { type: "element", id: id }; structureChangee = false; break;
      case "monter-etape": deplacer(E.config.etapes, trouverEtape(id), -1); break;
      case "descendre-etape": deplacer(E.config.etapes, trouverEtape(id), 1); break;
      case "supprimer-etape":
        var etape = trouverEtape(id);
        if (E.config.etapes.length === 1) { message("warning", "Un questionnaire garde au moins une étape."); return; }
        var cible = E.config.etapes[E.config.etapes.indexOf(etape) === 0 ? 1 : E.config.etapes.indexOf(etape) - 1];
        cible.elements = (cible.elements || []).concat(etape.elements || []);
        E.config.etapes.splice(E.config.etapes.indexOf(etape), 1);
        supprimerReferences(id);
        if ((etape.elements || []).length) {
          message("info", "Étape supprimée : ses éléments ont été déplacés dans l'étape voisine.");
        }
        E.selection = null;
        break;
      case "monter-element": deplacerElement(id, -1); break;
      case "descendre-element": deplacerElement(id, 1); break;
      case "supprimer-element":
        var e = etapeDeLElement(id);
        e.elements = e.elements.filter(function (x) { return x.id !== id; });
        supprimerReferences(id);
        if (E.selection && E.selection.id === id) { E.selection = null; }
        message("info", "Élément retiré du questionnaire. La colonne Grist et ses données sont conservées.");
        break;
      case "ajouter-texte":
        var et = trouverEtape(b.getAttribute("data-etape"));
        var t = { id: M.nouvelId("t"), genre: "texte", style: "paragraphe", titre: "", texte: "", condition: null };
        et.elements = et.elements || [];
        et.elements.push(t);
        E.selection = { type: "element", id: t.id };
        break;
      case "ajouter-matrice":
        var em = trouverEtape(b.getAttribute("data-etape"));
        var mx = { id: M.nouvelId("m"), genre: "matrice", libelle: "Nouveau tableau", aide: "", obligatoire: false,
          lignes: [{ libelle: "Ligne 1", colonne: null }, { libelle: "Ligne 2", colonne: null }],
          colonnesChoix: ["Pas d'accord", "D'accord"], condition: null };
        em.elements = em.elements || [];
        em.elements.push(mx);
        E.selection = { type: "element", id: mx.id };
        break;
      case "ajouter-media":
        var ei = trouverEtape(b.getAttribute("data-etape"));
        var md = { id: M.nouvelId("i"), genre: "media", type: "image", adresse: "", titre: "", description: "", condition: null };
        ei.elements = ei.elements || [];
        ei.elements.push(md);
        E.selection = { type: "element", id: md.id };
        break;
      case "ajouter-etape":
        var n = { id: M.nouvelId("e"), titre: "Nouvelle étape", description: "", condition: null, elements: [] };
        E.config.etapes.push(n);
        E.selection = { type: "etape", id: n.id };
        break;
      case "regle-ajouter":
        var o = objetChoisi();
        var avant = questionsAvant(E.selection);
        var q = avant[avant.length - 1];
        if (!q) { message("warning", "Aucune question n'est placée avant cet élément."); return; }
        o.condition.regles.push({ element: q.id, operateur: M.OPERATEURS_PAR_FAMILLE[M.famille(typeElement(q))][0], valeur: null });
        break;
      case "regle-supprimer":
        var oo = objetChoisi();
        oo.condition.regles.splice(Number(b.getAttribute("data-regle")), 1);
        if (!oo.condition.regles.length) { oo.condition = null; }
        break;
      case "enregistrer": return;
      case "connecter": connecter(); return;
      case "copier":
        var champ = document.getElementById(b.getAttribute("data-cible"));
        champ.select();
        if (navigator.clipboard) {
          navigator.clipboard.writeText(champ.value).then(function () { message("success", "Copié."); },
            function () { document.execCommand("copy"); message("success", "Copié."); });
        } else { document.execCommand("copy"); message("success", "Copié."); }
        return;
      case "importer":
        try {
          var importee = JSON.parse($("#config-json").value);
          if (!importee.etapes) { throw new Error("aucune étape"); }
          delete importee.publication;
          importee.publication = E.config.publication;
          E.config = importee;
          E.selection = null;
          marquerModifie(true);
          message("success", "Configuration importée. Vérifiez les colonnes puis enregistrez.");
        } catch (err) {
          message("error", "Texte invalide : " + err.message);
        }
        return;
      default: return;
    }
    if (structureChangee) { marquerModifie(true); }
    rafraichirStructure();
    rafraichirProprietes();
  }

  function definir(objet, chemin, valeur) {
    var parties = chemin.split(".");
    var o = objet;
    for (var i = 0; i < parties.length - 1; i++) {
      o[parties[i]] = o[parties[i]] || {};
      o = o[parties[i]];
    }
    o[parties[parties.length - 1]] = valeur;
  }

  function surSaisie(ev, finale) {
    var t = ev.target;

    // Changement d'onglet
    if (t.name === "onglet") { if (finale) { E.vue = t.value; afficher(); } return; }

    // Ajout de question
    if (t.getAttribute("data-action") === "ajouter-question") {
      if (finale && t.value) {
        ajouterQuestion(t.getAttribute("data-etape"), t.value);
        marquerModifie(true);
        rafraichirStructure();
        rafraichirProprietes();
        var champLibelle = $("#p-libelle");
        if (champLibelle) { champLibelle.focus(); champLibelle.select(); }
      }
      return;
    }

    // Activation / mode de condition
    if (t.getAttribute("data-action") === "condition-activer") {
      var obj = objetChoisi();
      if (t.checked) {
        var avant = questionsAvant(E.selection);
        var q = avant[avant.length - 1];
        obj.condition = { mode: "toutes", regles: q ? [{ element: q.id, operateur: M.OPERATEURS_PAR_FAMILLE[M.famille(typeElement(q))][0], valeur: null }] : [] };
      } else {
        obj.condition = null;
      }
      marquerModifie(true);
      rafraichirStructure();
      rafraichirProprietes();
      return;
    }
    if (t.getAttribute("data-action") === "condition-mode") {
      objetChoisi().condition.mode = t.value;
      marquerModifie(true);
      rafraichirProprietes();
      return;
    }

    // Règles
    if (t.hasAttribute("data-regle")) {
      var regle = objetChoisi().condition.regles[Number(t.getAttribute("data-regle"))];
      var rprop = t.getAttribute("data-rprop");
      if (rprop === "element") {
        regle.element = t.value;
        var cible = M.trouverElement(E.config, t.value);
        regle.operateur = M.OPERATEURS_PAR_FAMILLE[M.famille(typeElement(cible))][0];
        regle.valeur = null;
      } else if (rprop === "operateur") {
        regle.operateur = t.value;
        if (M.OPERATEURS_SANS_VALEUR.indexOf(t.value) >= 0) { regle.valeur = null; }
      } else if (rprop === "valeur-liste") {
        var cases = document.querySelectorAll("[data-regle=\"" + t.getAttribute("data-regle") + "\"][data-rprop=\"valeur-liste\"]:checked");
        regle.valeur = Array.prototype.map.call(cases, function (c) { return c.value; });
      } else if (rprop === "valeur") {
        if (M.OPERATEURS_LISTE.indexOf(regle.operateur) >= 0) {
          regle.valeur = t.value.split(";").map(function (s) { return s.trim(); }).filter(Boolean);
        } else {
          regle.valeur = t.value;
        }
      }
      marquerModifie(true);
      if (finale && rprop !== "valeur") { rafraichirProprietes(); }
      else {
        var resume = $(".ed-resume");
        if (resume) { resume.innerHTML = "<strong>Affiché si :</strong> " + esc(resumeCondition(objetChoisi().condition)); }
      }
      if (finale) { rafraichirStructure(); }
      return;
    }

    // Propriétés
    var prop = t.getAttribute("data-prop");
    if (!prop) { return; }
    var valeur = t.type === "checkbox" ? t.checked : t.value;

    if (prop.indexOf("c.") === 0) {
      definir(E.config, prop.slice(2), valeur);
      marquerModifie(true);
      return;
    }

    var o = objetChoisi();
    if (!o) { return; }
    if (prop === "_etape") {
      if (!finale) { return; }
      var source = etapeDeLElement(o.id);
      var dest = trouverEtape(valeur);
      if (source !== dest) {
        source.elements.splice(source.elements.indexOf(o), 1);
        dest.elements = dest.elements || [];
        dest.elements.push(o);
      }
    } else if (prop === "choix") {
      var liste = valeur.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
      if (o.colonne && !o.aCreer) { E.choixModifies[o.colonne] = liste; }
      o.choix = liste;
    } else if (prop === "lignesTexte") {
      var libs = valeur.split("\n").map(function (x) { return x.trim(); }).filter(Boolean);
      var anciennes = o.lignes || [], parLibelle = {}, prises = {};
      anciennes.forEach(function (l) { parLibelle[l.libelle] = l; });
      var nouvelles = libs.map(function (t, i) {
        var l = parLibelle[t];
        if (l && !prises[t]) { prises[t] = true; return l; }
        var vieille = anciennes[i];
        if (vieille && libs.indexOf(vieille.libelle) < 0 && vieille.colonne) { return { libelle: t, colonne: vieille.colonne }; }
        return { libelle: t, colonne: null };
      });
      o.lignes = nouvelles;
    } else if (prop === "colonnesTexte") {
      o.colonnesChoix = valeur.split("\n").map(function (x) { return x.trim(); }).filter(Boolean);
    } else if (["min", "max", "longueurMax", "choixMin", "choixMax"].indexOf(prop) >= 0) {
      if (valeur === "") { delete o[prop]; } else { o[prop] = Number(valeur); }
    } else {
      o[prop] = valeur;
    }
    marquerModifie(true);
    if (t.tagName === "SELECT" || t.type === "checkbox") {
      rafraichirStructure();
      if (finale) { rafraichirProprietes(); }
    } else {
      // Saisie de texte : on ne remplace que l'intitulé, pour ne pas perdre un clic en cours sur un bouton voisin.
      var libelleListe = document.querySelector(".ed-item.est-choisi .ed-item__libelle");
      if (libelleListe) { libelleListe.textContent = libelleElement(o); }
    }
  }

  /* ---------- Glisser-déposer des éléments ---------- */

  // En complément des boutons Monter / Descendre : on prend un élément avec la souris et on le dépose
  // avant ou après un autre, ou dans une étape vide.
  var glisse = null;

  function effacerRepereDepot() {
    Array.prototype.forEach.call(document.querySelectorAll(".depot-avant, .depot-apres, .depot-fin"), function (n) {
      n.classList.remove("depot-avant", "depot-apres", "depot-fin");
    });
  }

  document.addEventListener("dragstart", function (ev) {
    var li = ev.target.closest && ev.target.closest("li.ed-item");
    if (!li) { return; }
    glisse = li.getAttribute("data-id");
    li.classList.add("est-glisse");
    if (ev.dataTransfer) { ev.dataTransfer.effectAllowed = "move"; ev.dataTransfer.setData("text/plain", glisse); }
  });
  document.addEventListener("dragover", function (ev) {
    if (!glisse) { return; }
    var li = ev.target.closest && ev.target.closest("li.ed-item");
    var etape = ev.target.closest && ev.target.closest(".ed-etape");
    if (!li && !etape) { return; }
    ev.preventDefault();
    effacerRepereDepot();
    if (li && li.getAttribute("data-id") !== glisse) {
      var r = li.getBoundingClientRect();
      li.classList.add(ev.clientY > r.top + r.height / 2 ? "depot-apres" : "depot-avant");
    } else if (!li) {
      etape.classList.add("depot-fin");
    }
  });
  document.addEventListener("drop", function (ev) {
    if (!glisse) { return; }
    var li = ev.target.closest && ev.target.closest("li.ed-item");
    var etape = ev.target.closest && ev.target.closest(".ed-etape");
    if (!li && !etape) { return; }
    ev.preventDefault();
    var id = glisse;
    var source = etapeDeLElement(id);
    var el = M.trouverElement(E.config, id);
    if (!source || !el) { return; }
    var destEtape, position;
    if (li && li.getAttribute("data-id") !== id) {
      var cibleId = li.getAttribute("data-id");
      destEtape = etapeDeLElement(cibleId);
      var r = li.getBoundingClientRect();
      source.elements.splice(source.elements.indexOf(el), 1);
      position = destEtape.elements.findIndex(function (x) { return x.id === cibleId; }) + (ev.clientY > r.top + r.height / 2 ? 1 : 0);
      destEtape.elements.splice(position, 0, el);
    } else if (!li) {
      destEtape = trouverEtape(etape.getAttribute("data-etape"));
      source.elements.splice(source.elements.indexOf(el), 1);
      destEtape.elements = destEtape.elements || [];
      destEtape.elements.push(el);
    } else {
      return;
    }
    E.selection = { type: "element", id: id };
    marquerModifie(true);
    rafraichirStructure();
    rafraichirProprietes();
    var libelle = libelleElement(el);
    message("info", "« " + libelle + " » déplacé. Vérifiez les conditions qui en dépendent.");
  });
  document.addEventListener("dragend", function () {
    glisse = null;
    effacerRepereDepot();
    Array.prototype.forEach.call(document.querySelectorAll(".est-glisse"), function (n) { n.classList.remove("est-glisse"); });
  });

  /* ---------- Affichage général ---------- */

  function afficher() {
    if (PAGE_USAGE) { E.vue = "apercu"; }
    if (BARRE) { BARRE.choisir(E.vue); }
    if (!E.config) { return; }
    if (E.vue === "questions") { afficherQuestions(); }
    else if (E.vue === "textes") { afficherTextes(); }
    else if (E.vue === "json") { afficherJson(); }
    else if (E.vue === "page") { afficherPage(); }
    else if (E.vue === "apercu") { afficherApercu(); }
    else { afficherPublication(); }
  }

  document.addEventListener("click", surClic);
  document.addEventListener("input", function (ev) { surSaisie(ev, false); });
  document.addEventListener("change", function (ev) { surSaisie(ev, true); });
  $("#enregistrer").addEventListener("click", function () { enregistrer(false).catch(function () {}); });

  window.addEventListener("beforeunload", function (ev) {
    if (E.modifie) { ev.preventDefault(); ev.returnValue = ""; }
  });

  /* ---------- Démarrage ---------- */

  if (typeof grist === "undefined") {
    $("#etat").textContent = "Hors de Grist";
    $("#vue").innerHTML = "<div class=\"fr-alert fr-alert--info\"><h1 class=\"fr-alert__title\">Ce widget s'utilise dans Grist</h1>" +
      "<p>Ajoutez une vue « Personnalisée » sur la table des réponses, avec l'URL de cette page et l'accès « complet » au document.</p></div>";
    return;
  }

  grist.ready({ requiredAccess: "full", allowSelectBy: false });
  grist.onRecords(function () {
    grist.selectedTable.getTableId().then(demarrer).catch(function (e) {
      message("error", "Impossible de lire la table : " + (e.message || e));
    });
  });
  // Premier chargement, même si la table est vide.
  setTimeout(function () {
    if (!E.tableId) {
      grist.selectedTable.getTableId().then(demarrer).catch(function () {
        message("warning", "Accordez l'accès complet au document au widget (panneau de droite).");
      });
    }
  }, 800);
})();

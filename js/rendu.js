/*
 * Rendu DSFR d'un questionnaire.
 * Utilisé par la page publique (formulaire.html) et par l'aperçu de l'éditeur.
 *
 * QuestionnaireRendu.monter(conteneur, {
 *   config,            // configuration (voir moteur.js)
 *   champs,            // { colId: { type, choix: [..], refValues: [[id, libellé], ..] } }
 *   apercu,            // true : rien n'est envoyé
 *   envoyer,           // async (champsGrist, fichiersParColonne) => void ; lève une Error en cas d'échec
 *   titrePage          // true : met à jour document.title à chaque étape
 * })
 */
(function (global) {
  "use strict";

  var M = global.QuestionnaireMoteur;

  /* ---------- Outils DOM ---------- */

  function h(tag, attrs, enfants) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) { return; }
        if (k === "class") { el.className = v; }
        else if (k === "text") { el.textContent = v; }
        else if (k === "html") { el.innerHTML = v; }
        else if (k.slice(0, 2) === "on" && typeof v === "function") { el.addEventListener(k.slice(2), v); }
        else { el.setAttribute(k, v === true ? "" : v); }
      });
    }
    (enfants || []).forEach(function (e) {
      if (e === null || e === undefined || e === false) { return; }
      el.appendChild(typeof e === "string" ? document.createTextNode(e) : e);
    });
    return el;
  }

  function echapper(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // Mise en forme minimale et sûre : paragraphes, retours à la ligne,
  // **gras** et liens [texte](https://…).
  function formater(texte) {
    var paragraphes = String(texte || "").trim().split(/\n\s*\n/);
    return paragraphes.filter(function (p) { return p.trim(); }).map(function (p) {
      var s = echapper(p.trim());
      s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\)/g, function (_, lib, url) {
        var externe = url.indexOf("mailto:") !== 0;
        return "<a href=\"" + url + "\"" + (externe ?
          " target=\"_blank\" rel=\"noopener\" title=\"" + lib + " - nouvelle fenêtre\"" : "") +
          ">" + lib + "</a>";
      });
      s = s.replace(/\n/g, "<br>");
      return "<p>" + s + "</p>";
    }).join("");
  }

  function messages(id) {
    return h("div", { class: "fr-messages-group", id: id + "-messages", "aria-live": "polite" });
  }

  /* ---------- Construction d'une question ---------- */

  function construireQuestion(el, champ, options, compteur) {
    var fam = M.famille(champ.type);
    var id = "q-" + el.id;
    var affichage = el.affichage || (M.AFFICHAGES[fam] || [[""]])[0][0];
    var obligatoire = !!el.obligatoire;
    var mention = options.mentionObligatoire || "asterisque";
    var choix = champ.choix || el.choix || [];
    var refValues = champ.refValues || [];

    function libelle(tag, attrs) {
      var enfants = [el.libelle || el.colonne];
      if (obligatoire && mention === "asterisque") {
        enfants.push(h("span", { class: "qd-obligatoire", "aria-hidden": "true", text: " *" }));
      }
      if (!obligatoire && mention === "facultatif") {
        enfants.push(" (facultatif)");
      }
      if (el.aide) { enfants.push(h("span", { class: "fr-hint-text", text: el.aide })); }
      return h(tag, attrs, enfants);
    }

    var q = {
      element: el, famille: fam, id: id, conteneur: null,
      lire: function () { return null; },          // valeur pour l'envoi
      lirePourCondition: null,                     // valeur pour les conditions
      afficherErreur: function () {},
      effacerErreur: function () {},
      focus: function () {}
    };

    function groupeSimple(classeGroupe, controle) {
      var groupe = h("div", { class: classeGroupe, id: id + "-groupe" }, [
        libelle("label", { class: "fr-label", for: id }),
        controle,
        messages(id)
      ]);
      controle.setAttribute("aria-describedby", id + "-messages");
      q.conteneur = groupe;
      q.focus = function () { controle.focus(); };
      q.afficherErreur = function (msg) {
        groupe.classList.add(classeGroupe + "--error");
        controle.classList.add(classeGroupe.replace("-group", "") + "--error");
        controle.setAttribute("aria-invalid", "true");
        groupe.querySelector(".fr-messages-group").innerHTML =
          "<p class=\"fr-message fr-message--error\">" + echapper(msg) + "</p>";
      };
      q.effacerErreur = function () {
        groupe.classList.remove(classeGroupe + "--error");
        controle.classList.remove(classeGroupe.replace("-group", "") + "--error");
        controle.removeAttribute("aria-invalid");
        groupe.querySelector(".fr-messages-group").innerHTML = "";
      };
      return groupe;
    }

    function fieldset(elements, inline) {
      var fs = h("fieldset", {
        class: "fr-fieldset", id: id + "-groupe",
        "aria-labelledby": id + "-legende " + id + "-messages"
      }, [libelle("legend", { class: "fr-fieldset__legend fr-fieldset__legend--regular", id: id + "-legende" })]
        .concat(elements.map(function (e) {
          return h("div", { class: "fr-fieldset__element" + (inline ? " fr-fieldset__element--inline" : "") }, [e]);
        }))
        .concat([messages(id)]));
      if (obligatoire) { fs.setAttribute("aria-required", "true"); }
      q.conteneur = fs;
      q.focus = function () { var i = fs.querySelector("input"); if (i) { i.focus(); } };
      q.afficherErreur = function (msg) {
        fs.classList.add("fr-fieldset--error");
        fs.querySelector(".fr-messages-group").innerHTML =
          "<p class=\"fr-message fr-message--error\">" + echapper(msg) + "</p>";
      };
      q.effacerErreur = function () {
        fs.classList.remove("fr-fieldset--error");
        fs.querySelector(".fr-messages-group").innerHTML = "";
      };
      return fs;
    }

    function radio(nom, valeur, texte, i) {
      var rid = id + "-" + i;
      return h("div", { class: "fr-radio-group" }, [
        h("input", { type: "radio", id: rid, name: nom, value: valeur }),
        h("label", { class: "fr-label", for: rid, text: texte })
      ]);
    }

    function caseACocher(nom, valeur, texte, i) {
      var cid = id + "-" + i;
      return h("div", { class: "fr-checkbox-group" }, [
        h("input", { type: "checkbox", id: cid, name: nom, value: valeur }),
        h("label", { class: "fr-label", for: cid, text: texte })
      ]);
    }

    var noeud;

    if (fam === "texte" || fam === "nombre" || fam === "date") {
      var controle;
      if (fam === "texte" && affichage === "long") {
        controle = h("textarea", { class: "fr-input", id: id, name: id, rows: "5" });
      } else {
        var type = "text", extra = {};
        if (fam === "nombre") { type = "text"; extra.inputmode = champ.type === "Int" ? "numeric" : "decimal"; }
        if (fam === "date") { type = "date"; }
        if (affichage === "courriel") { type = "email"; extra.autocomplete = "email"; extra.spellcheck = "false"; }
        if (affichage === "telephone") { type = "tel"; extra.autocomplete = "tel"; }
        controle = h("input", Object.assign({ class: "fr-input", type: type, id: id, name: id }, extra));
      }
      if (el.indication) { controle.setAttribute("placeholder", el.indication); }
      if (fam === "texte" && el.longueurMax) { controle.setAttribute("maxlength", String(el.longueurMax)); }
      if (obligatoire) { controle.setAttribute("aria-required", "true"); }
      noeud = groupeSimple("fr-input-group", controle);
      q.lire = function () {
        var v = controle.value.trim();
        if (v === "") { return null; }
        if (fam === "nombre") {
          var n = Number(v.replace(/\s/g, "").replace(",", "."));
          return isNaN(n) ? v : n;
        }
        return v;
      };
    }

    else if ((fam === "choix" || fam === "ref") && affichage === "liste") {
      var select = h("select", { class: "fr-select", id: id, name: id },
        [h("option", { value: "", selected: true, text: "Sélectionner une option" })]
          .concat(fam === "choix" ?
            choix.map(function (c) { return h("option", { value: c, text: c }); }) :
            refValues.map(function (r) { return h("option", { value: String(r[0]), text: String(r[1]) }); })));
      if (obligatoire) { select.setAttribute("aria-required", "true"); }
      noeud = groupeSimple("fr-select-group", select);
      q.lire = function () {
        if (!select.value) { return null; }
        return fam === "ref" ? Number(select.value) : select.value;
      };
      if (fam === "ref") {
        q.lirePourCondition = function () {
          return select.value ? select.options[select.selectedIndex].text : null;
        };
      }
    }

    else if (fam === "choix" || fam === "ref") {
      var items = fam === "choix" ?
        choix.map(function (c, i) { return radio(id, c, c, i); }) :
        refValues.map(function (r, i) { return radio(id, String(r[0]), String(r[1]), i); });
      noeud = fieldset(items, false);
      q.lire = function () {
        var c = noeud.querySelector("input:checked");
        if (!c) { return null; }
        return fam === "ref" ? Number(c.value) : c.value;
      };
      if (fam === "ref") {
        q.lirePourCondition = function () {
          var c = noeud.querySelector("input:checked");
          return c ? noeud.querySelector("label[for=\"" + c.id + "\"]").textContent : null;
        };
      }
    }

    else if (fam === "choix_multiple" || fam === "ref_multiple") {
      var cases = fam === "choix_multiple" ?
        choix.map(function (c, i) { return caseACocher(id, c, c, i); }) :
        refValues.map(function (r, i) { return caseACocher(id, String(r[0]), String(r[1]), i); });
      noeud = fieldset(cases, false);
      q.lire = function () {
        var vals = Array.prototype.map.call(noeud.querySelectorAll("input:checked"), function (c) {
          return fam === "ref_multiple" ? Number(c.value) : c.value;
        });
        return vals.length ? vals : null;
      };
      if (fam === "ref_multiple") {
        q.lirePourCondition = function () {
          return Array.prototype.map.call(noeud.querySelectorAll("input:checked"), function (c) {
            return noeud.querySelector("label[for=\"" + c.id + "\"]").textContent;
          });
        };
      }
    }

    else if (fam === "booleen" && affichage === "ouinon") {
      noeud = fieldset([radio(id, "oui", "Oui", "oui"), radio(id, "non", "Non", "non")], true);
      q.lire = function () {
        var c = noeud.querySelector("input:checked");
        return c ? c.value === "oui" : null;
      };
    }

    else if (fam === "booleen" && affichage === "interrupteur") {
      var inter = h("input", { type: "checkbox", class: "fr-toggle__input", id: id, name: id, "aria-describedby": id + "-messages" });
      noeud = h("div", { class: "fr-toggle", id: id + "-groupe" }, [
        inter,
        libelle("label", { class: "fr-toggle__label", for: id, "data-fr-checked-label": "Oui", "data-fr-unchecked-label": "Non" }),
        messages(id)
      ]);
      q.conteneur = noeud;
      q.focus = function () { inter.focus(); };
      q.lire = function () { return inter.checked; };
      q.afficherErreur = function (msg) {
        noeud.querySelector(".fr-messages-group").innerHTML = "<p class=\"fr-message fr-message--error\">" + echapper(msg) + "</p>";
      };
      q.effacerErreur = function () { noeud.querySelector(".fr-messages-group").innerHTML = ""; };
    }

    else if (fam === "booleen") {
      var coche = h("input", { type: "checkbox", id: id, name: id, "aria-describedby": id + "-messages" });
      if (obligatoire) { coche.setAttribute("aria-required", "true"); }
      noeud = h("div", { class: "fr-checkbox-group", id: id + "-groupe" }, [
        coche,
        libelle("label", { class: "fr-label", for: id }),
        messages(id)
      ]);
      q.conteneur = noeud;
      q.focus = function () { coche.focus(); };
      q.lire = function () { return coche.checked; };
      q.afficherErreur = function (msg) {
        noeud.classList.add("fr-checkbox-group--error");
        noeud.querySelector(".fr-messages-group").innerHTML = "<p class=\"fr-message fr-message--error\">" + echapper(msg) + "</p>";
      };
      q.effacerErreur = function () {
        noeud.classList.remove("fr-checkbox-group--error");
        noeud.querySelector(".fr-messages-group").innerHTML = "";
      };
    }

    else if (fam === "fichier") {
      var fichier = h("input", { class: "fr-upload", type: "file", id: id, name: id, multiple: true });
      noeud = h("div", { class: "fr-upload-group", id: id + "-groupe" }, [
        libelle("label", { class: "fr-label", for: id }),
        fichier,
        messages(id)
      ]);
      fichier.setAttribute("aria-describedby", id + "-messages");
      q.conteneur = noeud;
      q.focus = function () { fichier.focus(); };
      q.lire = function () { return fichier.files && fichier.files.length ? Array.prototype.slice.call(fichier.files) : null; };
      q.lirePourCondition = function () { return fichier.files && fichier.files.length ? ["fichier"] : null; };
      q.afficherErreur = function (msg) {
        noeud.classList.add("fr-upload-group--error");
        noeud.querySelector(".fr-messages-group").innerHTML = "<p class=\"fr-message fr-message--error\">" + echapper(msg) + "</p>";
      };
      q.effacerErreur = function () {
        noeud.classList.remove("fr-upload-group--error");
        noeud.querySelector(".fr-messages-group").innerHTML = "";
      };
    }

    if (!q.lirePourCondition) { q.lirePourCondition = q.lire; }
    q.noeud = h("div", { class: "qd-element", "data-element": el.id }, [noeud]);
    return q;
  }

  /* ---------- Validation ---------- */

  var RE_COURRIEL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function valider(q) {
    var el = q.element;
    var v = q.lire();
    var fam = q.famille;
    if (el.obligatoire) {
      if (fam === "booleen" && el.affichage !== "ouinon") {
        if (v !== true) { return "Cochez la case pour continuer."; }
      } else if (M.estVide(v)) {
        if (fam === "choix" || fam === "ref" || fam === "booleen") { return "Sélectionnez une réponse."; }
        if (fam === "choix_multiple" || fam === "ref_multiple") { return "Sélectionnez au moins une réponse."; }
        if (fam === "fichier") { return "Ajoutez au moins un fichier."; }
        if (fam === "date") { return "Saisissez une date."; }
        return "Ce champ est obligatoire. Saisissez une réponse.";
      }
    }
    if (M.estVide(v)) { return null; }
    if (fam === "texte" && el.affichage === "courriel" && !RE_COURRIEL.test(v)) {
      return "Saisissez une adresse électronique valide, par exemple : nom@domaine.fr";
    }
    if (fam === "nombre") {
      if (typeof v !== "number") { return "Saisissez un nombre, par exemple : 12"; }
      if (el.min !== undefined && el.min !== null && el.min !== "" && v < Number(el.min)) { return "Saisissez un nombre supérieur ou égal à " + el.min + "."; }
      if (el.max !== undefined && el.max !== null && el.max !== "" && v > Number(el.max)) { return "Saisissez un nombre inférieur ou égal à " + el.max + "."; }
    }
    if (fam === "texte" && el.longueurMax && String(v).length > Number(el.longueurMax)) {
      return "Votre réponse dépasse " + el.longueurMax + " caractères.";
    }
    return null;
  }

  /* ---------- Conversion vers Grist ---------- */

  function versGrist(q, v, typeGrist) {
    var fam = q.famille;
    if (fam === "date") {
      var p = String(v).split("-");
      return Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])) / 1000;
    }
    if (fam === "nombre" && String(typeGrist).indexOf("Int") === 0) { return Math.round(v); }
    if (fam === "choix_multiple" || fam === "ref_multiple") { return ["L"].concat(v); }
    return v;
  }

  /* ---------- Montage ---------- */

  function monter(conteneur, options) {
    var config = options.config || {};
    var champs = options.champs || {};
    var mention = config.mentionObligatoire || "asterisque";
    var questions = {};
    var etapes = config.etapes || [];
    var etapeCourante = null;
    var envoiEnCours = false;

    conteneur.innerHTML = "";
    conteneur.classList.add("qd-questionnaire");

    var titre = h("h1", { class: "qd-titre", text: config.titre || "Questionnaire" });
    var intro = config.introduction ? h("div", { class: "fr-text--lead qd-intro", html: formater(config.introduction) }) : null;
    var phraseObligatoire = null;
    var auMoinsUnObligatoire = M.elementsOrdonnes(config).some(function (o) { return o.element.genre === "question" && o.element.obligatoire; });
    if (mention === "asterisque" && auMoinsUnObligatoire) {
      phraseObligatoire = h("p", { class: "fr-text--sm qd-mention", text: "Les champs marqués d'un astérisque (*) sont obligatoires." });
    } else if (mention === "facultatif") {
      phraseObligatoire = h("p", { class: "fr-text--sm qd-mention", text: "Sauf mention contraire, tous les champs sont obligatoires." });
    }

    var zoneAlerte = h("div", { class: "qd-alerte", tabindex: "-1" });
    var stepper = h("div", { class: "fr-stepper qd-stepper" });
    var formulaire = h("form", { class: "qd-form", novalidate: true });
    var piege = h("div", { class: "qd-piege", "aria-hidden": "true" }, [
      h("label", { for: "qd-site", text: "Ne pas remplir" }),
      h("input", { type: "text", id: "qd-site", name: "site_web", tabindex: "-1", autocomplete: "off" })
    ]);
    formulaire.appendChild(piege);

    var sections = {};
    etapes.forEach(function (etape) {
      var section = h("section", { class: "qd-etape", "data-etape": etape.id, hidden: true });
      if (etape.description) { section.appendChild(h("div", { class: "qd-etape-description", html: formater(etape.description) })); }
      (etape.elements || []).forEach(function (el) {
        if (el.genre === "question") {
          var champ = champs[el.colonne] || { type: el.type, choix: el.choix };
          var q = construireQuestion(el, champ, { mentionObligatoire: mention });
          q.typeGrist = champ.type || el.type;
          questions[el.id] = q;
          section.appendChild(q.noeud);
        } else if (el.genre === "texte") {
          var bloc;
          if (el.style === "encadre") {
            bloc = h("div", { class: "fr-callout" }, [
              el.titre ? h("h3", { class: "fr-callout__title", text: el.titre }) : null,
              h("div", { class: "fr-callout__text", html: formater(el.texte) })
            ]);
          } else if (el.style === "information") {
            bloc = h("div", { class: "fr-alert fr-alert--info" + (el.titre ? "" : " fr-alert--sm") }, [
              el.titre ? h("h3", { class: "fr-alert__title", text: el.titre }) : null,
              h("div", { html: formater(el.texte) })
            ]);
          } else if (el.style === "intertitre") {
            bloc = h("h3", { class: "fr-h5 qd-intertitre", text: el.titre || el.texte || "" });
          } else {
            bloc = h("div", { class: "qd-paragraphe" }, [
              el.titre ? h("h3", { class: "fr-h6", text: el.titre }) : null,
              h("div", { html: formater(el.texte) })
            ]);
          }
          section.appendChild(h("div", { class: "qd-element", "data-element": el.id }, [bloc]));
        }
      });
      sections[etape.id] = section;
      formulaire.appendChild(section);
    });

    var boutonPrecedent = h("button", { type: "button", class: "fr-btn fr-btn--secondary fr-icon-arrow-left-line fr-btn--icon-left", text: "Précédent" });
    var boutonSuivant = h("button", { type: "submit", class: "fr-btn fr-icon-arrow-right-line fr-btn--icon-right", text: "Suivant" });
    var actions = h("ul", { class: "fr-btns-group fr-btns-group--inline-md fr-btns-group--right qd-actions" }, [
      h("li", {}, [boutonPrecedent]),
      h("li", {}, [boutonSuivant])
    ]);
    formulaire.appendChild(actions);

    var mentions = config.mentionsDonnees ? h("div", { class: "fr-text--xs qd-mentions-donnees", html: formater(config.mentionsDonnees) }) : null;

    [titre, intro, phraseObligatoire, zoneAlerte, stepper, formulaire, mentions].forEach(function (n) {
      if (n) { conteneur.appendChild(n); }
    });

    /* --- Logique --- */

    function valeursSaisies() {
      var v = {};
      Object.keys(questions).forEach(function (id) { v[id] = questions[id].lirePourCondition(); });
      return v;
    }

    var visibilite = { etapes: {}, elements: {} };

    function etapesVisibles() {
      return etapes.filter(function (e) { return visibilite.etapes[e.id]; });
    }

    function appliquerVisibilite() {
      visibilite = M.calculerVisibilite(config, valeursSaisies());
      Array.prototype.forEach.call(formulaire.querySelectorAll(".qd-element"), function (n) {
        var vis = visibilite.elements[n.getAttribute("data-element")] !== false;
        if (vis) { n.removeAttribute("hidden"); } else { n.setAttribute("hidden", ""); }
      });
      var visibles = etapesVisibles();
      if (!etapeCourante || !visibilite.etapes[etapeCourante]) {
        etapeCourante = visibles.length ? visibles[0].id : null;
      }
      afficherEtape(false);
    }

    function afficherEtape(deplacerFocus) {
      var visibles = etapesVisibles();
      var index = visibles.findIndex(function (e) { return e.id === etapeCourante; });
      Object.keys(sections).forEach(function (id) {
        if (id === etapeCourante) { sections[id].removeAttribute("hidden"); }
        else { sections[id].setAttribute("hidden", ""); }
      });
      var etape = visibles[index];
      var total = visibles.length;

      // Indicateur d'étapes DSFR (uniquement s'il y a plusieurs étapes).
      stepper.innerHTML = "";
      if (total > 1 && etape) {
        stepper.removeAttribute("hidden");
        stepper.className = "fr-stepper qd-stepper";
        var titreEtape = etape.titre || ("Étape " + (index + 1));
        stepper.appendChild(h("h2", { class: "fr-stepper__title", tabindex: "-1" }, [
          titreEtape + " ",
          h("span", { class: "fr-stepper__state", text: "Étape " + (index + 1) + " sur " + total })
        ]));
        stepper.appendChild(h("div", { class: "fr-stepper__steps", "data-fr-current-step": String(index + 1), "data-fr-steps": String(total) }));
        if (index < total - 1) {
          stepper.appendChild(h("p", { class: "fr-stepper__details" }, [
            h("span", { class: "fr-text--bold", text: "Étape suivante : " }),
            visibles[index + 1].titre || ("Étape " + (index + 2))
          ]));
        }
      } else if (etape && etape.titre && etapes.length === 1) {
        stepper.removeAttribute("hidden");
        stepper.className = "qd-titre-etape-unique";
        stepper.appendChild(h("h2", { class: "fr-h4", tabindex: "-1", text: etape.titre }));
      } else {
        stepper.setAttribute("hidden", "");
      }

      if (intro) { intro.hidden = index > 0; }
      boutonPrecedent.parentNode.hidden = index <= 0;
      var derniere = index === total - 1;
      boutonSuivant.textContent = derniere ? (config.envoi && config.envoi.bouton || "Envoyer") : "Suivant";
      boutonSuivant.className = "fr-btn " + (derniere ? "" : "fr-icon-arrow-right-line fr-btn--icon-right");

      if (options.titrePage && etape) {
        document.title = (total > 1 ? (etape.titre || "Étape " + (index + 1)) + " – Étape " + (index + 1) + " sur " + total + " – " : "") +
          (config.titre || "Questionnaire");
      }
      if (deplacerFocus) {
        var cible = stepper.querySelector("h2") || titre;
        if (!cible.hasAttribute("tabindex")) { cible.setAttribute("tabindex", "-1"); }
        cible.focus();
        if (cible.scrollIntoView) { cible.scrollIntoView({ block: "start" }); }
      }
    }

    function questionsDeLEtape(idEtape) {
      var etape = etapes.find(function (e) { return e.id === idEtape; });
      return (etape && etape.elements || []).filter(function (el) {
        return el.genre === "question" && visibilite.elements[el.id];
      }).map(function (el) { return questions[el.id]; });
    }

    function afficherResumeErreurs(erreurs) {
      zoneAlerte.innerHTML = "";
      if (!erreurs.length) { return; }
      var liste = h("ul", {}, erreurs.map(function (e) {
        return h("li", {}, [h("a", {
          href: "#" + e.q.id, text: (e.q.element.libelle || e.q.element.colonne) + " : " + e.message,
          onclick: function (ev) { ev.preventDefault(); e.q.focus(); }
        })]);
      }));
      zoneAlerte.appendChild(h("div", { class: "fr-alert fr-alert--error fr-mb-4w", role: "alert" }, [
        h("h2", { class: "fr-alert__title", text: erreurs.length > 1 ?
          "Le formulaire contient " + erreurs.length + " erreurs" : "Le formulaire contient une erreur" }),
        liste
      ]));
    }

    function validerEtape(idEtape) {
      var erreurs = [];
      questionsDeLEtape(idEtape).forEach(function (q) {
        var msg = valider(q);
        if (msg) { q.afficherErreur(msg); erreurs.push({ q: q, message: msg }); }
        else { q.effacerErreur(); }
      });
      afficherResumeErreurs(erreurs);
      if (erreurs.length) {
        zoneAlerte.focus();
        if (zoneAlerte.scrollIntoView) { zoneAlerte.scrollIntoView({ block: "start" }); }
      }
      return erreurs.length === 0;
    }

    function donneesAEnvoyer() {
      var champsGrist = {};
      var fichiers = {};
      Object.keys(questions).forEach(function (id) {
        if (!visibilite.elements[id]) { return; }
        var q = questions[id];
        var v = q.lire();
        if (M.estVide(v)) { return; }
        if (q.famille === "booleen" && v === false && q.element.affichage !== "ouinon") { return; }
        if (q.famille === "fichier") { fichiers[q.element.colonne] = v; return; }
        champsGrist[q.element.colonne] = versGrist(q, v, q.typeGrist);
      });
      return { champs: champsGrist, fichiers: fichiers };
    }

    function afficherSucces() {
      var env = config.envoi || {};
      conteneur.innerHTML = "";
      var enfants = [
        h("h1", { class: "qd-titre", text: config.titre || "Questionnaire" }),
        h("div", { class: "fr-alert fr-alert--success fr-mb-4w", role: "status", tabindex: "-1" }, [
          h("h2", { class: "fr-alert__title", text: env.titreConfirmation || "Votre réponse a bien été envoyée" }),
          env.messageConfirmation ? h("div", { html: formater(env.messageConfirmation) }) : h("p", { text: "Merci pour votre participation." })
        ])
      ];
      if (env.autreReponse) {
        enfants.push(h("button", {
          type: "button", class: "fr-btn fr-btn--secondary", text: "Envoyer une autre réponse",
          onclick: function () { monter(conteneur, options); }
        }));
      }
      enfants.forEach(function (n) { conteneur.appendChild(n); });
      var alerte = conteneur.querySelector(".fr-alert");
      alerte.focus();
      if (options.titrePage) { document.title = (env.titreConfirmation || "Réponse envoyée") + " – " + (config.titre || "Questionnaire"); }
    }

    function afficherErreurEnvoi(message) {
      zoneAlerte.innerHTML = "";
      zoneAlerte.appendChild(h("div", { class: "fr-alert fr-alert--error fr-mb-4w", role: "alert" }, [
        h("h2", { class: "fr-alert__title", text: "Votre réponse n'a pas pu être envoyée" }),
        h("p", { text: message || "Une erreur est survenue. Vérifiez votre connexion puis réessayez." })
      ]));
      zoneAlerte.focus();
    }

    async function envoyer() {
      if (envoiEnCours) { return; }
      var piegeRempli = formulaire.querySelector("#qd-site").value !== "";
      var donnees = donneesAEnvoyer();
      if (options.apercu) {
        zoneAlerte.innerHTML = "";
        zoneAlerte.appendChild(h("div", { class: "fr-alert fr-alert--info fr-mb-4w", role: "status" }, [
          h("h2", { class: "fr-alert__title", text: "Aperçu : rien n'a été enregistré" }),
          h("p", { text: "Données qui seraient envoyées à Grist :" }),
          h("pre", { class: "qd-apercu-donnees", text: JSON.stringify(donnees.champs, null, 2) +
            (Object.keys(donnees.fichiers).length ? "\n+ fichiers : " + Object.keys(donnees.fichiers).join(", ") : "") })
        ]));
        zoneAlerte.focus();
        return;
      }
      if (piegeRempli) { afficherSucces(); return; }
      envoiEnCours = true;
      boutonSuivant.disabled = true;
      boutonSuivant.textContent = "Envoi en cours…";
      try {
        await options.envoyer(donnees.champs, donnees.fichiers);
        afficherSucces();
      } catch (e) {
        envoiEnCours = false;
        boutonSuivant.disabled = false;
        afficherEtape(false);
        afficherErreurEnvoi(e && e.message);
      }
    }

    formulaire.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!validerEtape(etapeCourante)) { return; }
      var visibles = etapesVisibles();
      var index = visibles.findIndex(function (e) { return e.id === etapeCourante; });
      if (index < visibles.length - 1) {
        etapeCourante = visibles[index + 1].id;
        afficherEtape(true);
      } else {
        envoyer();
      }
    });

    boutonPrecedent.addEventListener("click", function () {
      var visibles = etapesVisibles();
      var index = visibles.findIndex(function (e) { return e.id === etapeCourante; });
      if (index > 0) {
        zoneAlerte.innerHTML = "";
        etapeCourante = visibles[index - 1].id;
        afficherEtape(true);
      }
    });

    function surChangement(ev) {
      var n = ev.target.closest && ev.target.closest(".qd-element");
      if (n) {
        var q = questions[n.getAttribute("data-element")];
        if (q && n.querySelector(".fr-message--error") && !valider(q)) { q.effacerErreur(); }
      }
      appliquerVisibilite();
    }
    formulaire.addEventListener("input", surChangement);
    formulaire.addEventListener("change", surChangement);

    if (!etapes.length) {
      formulaire.hidden = true;
      conteneur.appendChild(h("p", { text: "Ce questionnaire ne contient encore aucune étape." }));
    }
    appliquerVisibilite();

    return {
      rafraichir: appliquerVisibilite,
      allerA: function (idEtape) {
        if (visibilite.etapes[idEtape]) { etapeCourante = idEtape; afficherEtape(false); }
      }
    };
  }

  global.QuestionnaireRendu = {
    monter: monter,
    formater: formater,
    echapper: echapper,
    h: h
  };
})(typeof window !== "undefined" ? window : globalThis);

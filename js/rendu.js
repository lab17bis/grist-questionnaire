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

  /* ---------- Outils des questions ---------- */

  // Nombre minimal et maximal de choix ; null quand aucune borne n'est réglée.
  function bornesChoix(el) {
    var b = Number(el.choixMin) > 0 ? Math.round(Number(el.choixMin)) : 0;
    var t = Number(el.choixMax) > 0 ? Math.round(Number(el.choixMax)) : 0;
    return (b || t) ? { min: b, max: t } : null;
  }

  function texteBornes(b) {
    var pluriel = function (n) { return n + " réponse" + (n > 1 ? "s" : ""); };
    if (b.min && b.max) { return b.min === b.max ? "Sélectionnez exactement " + pluriel(b.min) + "." : "Sélectionnez entre " + b.min + " et " + pluriel(b.max) + "."; }
    if (b.min) { return "Sélectionnez au moins " + pluriel(b.min) + "."; }
    return "Sélectionnez au plus " + pluriel(b.max) + ".";
  }

  function listeDefaut(el) {
    var d = el.defaut;
    if (Array.isArray(d)) { return d; }
    return String(d === undefined || d === null ? "" : d).split("\n").map(function (x) { return x.trim(); }).filter(Boolean);
  }

  /* ---------- Classement par ordre ---------- */

  // Liste d'éléments à ordonner : boutons Monter et Descendre (clavier, tactile) et glisser-déposer à la souris.
  // La réponse est la liste ordonnée complète, enregistrée dans une seule cellule (liste de choix de Grist).
  function construireClassement(el, fam, id, choix, refValues, fieldset, q) {
    var elements = fam === "choix_multiple" ?
      choix.map(function (c) { return { valeur: c, texte: c }; }) :
      refValues.map(function (r) { return { valeur: r[0], texte: String(r[1]) }; });
    var touche = false;
    if (el.defaut) {
      var ordre = listeDefaut(el);
      elements.sort(function (a, b) {
        var i = ordre.indexOf(String(a.texte)), j = ordre.indexOf(String(b.texte));
        return (i < 0 ? 999 : i) - (j < 0 ? 999 : j);
      });
      touche = true;
    }
    var liste = h("ol", { class: "qd-classement", id: id + "-liste" });
    var statut = h("p", { class: "fr-sr-only", role: "status", "aria-live": "polite" });
    var garder = h("button", { type: "button", class: "fr-btn fr-btn--secondary fr-btn--sm qd-garder", text: "Garder cet ordre" });
    var noeud;

    function diffuser() { noeud.dispatchEvent(new Event("change", { bubbles: true })); }
    function numeroter() {
      var n = liste.children.length;
      Array.prototype.forEach.call(liste.children, function (li, i) {
        li.querySelector(".qd-rang").textContent = String(i + 1);
        li.querySelector("[data-sens=\"-1\"]").disabled = i === 0;
        li.querySelector("[data-sens=\"1\"]").disabled = i === n - 1;
      });
    }
    function marquer() { touche = true; garder.hidden = true; }
    function annoncer(li) {
      var rang = Array.prototype.indexOf.call(liste.children, li) + 1;
      statut.textContent = li.getAttribute("data-texte") + " : position " + rang + " sur " + liste.children.length + ".";
    }
    function deplacer(li, sens) {
      var ref = sens < 0 ? li.previousElementSibling : (li.nextElementSibling && li.nextElementSibling.nextElementSibling);
      if (sens < 0 && !ref) { return; }
      if (sens > 0 && !li.nextElementSibling) { return; }
      liste.insertBefore(li, ref);
      marquer(); numeroter(); annoncer(li);
      var bouton = li.querySelector("[data-sens=\"" + sens + "\"]");
      if (bouton.disabled) { bouton = li.querySelector("[data-sens=\"" + (-sens) + "\"]"); }
      bouton.focus();
      diffuser();
    }
    function bouton(sens, icone, texte, li) {
      return h("button", {
        type: "button", class: "fr-btn fr-btn--tertiary-no-outline fr-btn--sm " + icone,
        "data-sens": String(sens), title: texte, text: texte, onclick: function () { deplacer(li, sens); }
      });
    }
    elements.forEach(function (e) {
      var li = h("li", { class: "qd-classement__item", draggable: "true", "data-valeur": String(e.valeur), "data-texte": e.texte });
      [h("span", { class: "qd-rang", "aria-hidden": "true" }),
       h("span", { class: "qd-classement__texte", text: e.texte }),
       h("span", { class: "qd-classement__boutons" }, [
         bouton(-1, "fr-icon-arrow-up-line", "Monter « " + e.texte + " »", li),
         bouton(1, "fr-icon-arrow-down-line", "Descendre « " + e.texte + " »", li)])
      ].forEach(function (n) { li.appendChild(n); });
      liste.appendChild(li);
    });

    var glisse = null;
    liste.addEventListener("dragstart", function (ev) {
      var li = ev.target.closest && ev.target.closest("li");
      if (!li) { return; }
      glisse = li;
      li.classList.add("qd-glisse");
      if (ev.dataTransfer) { ev.dataTransfer.effectAllowed = "move"; ev.dataTransfer.setData("text/plain", li.getAttribute("data-texte")); }
    });
    liste.addEventListener("dragover", function (ev) {
      if (!glisse) { return; }
      ev.preventDefault();
      var li = ev.target.closest && ev.target.closest("li");
      if (!li || li === glisse) { return; }
      var r = li.getBoundingClientRect();
      liste.insertBefore(glisse, ev.clientY > r.top + r.height / 2 ? li.nextElementSibling : li);
    });
    liste.addEventListener("drop", function (ev) { if (glisse) { ev.preventDefault(); } });
    liste.addEventListener("dragend", function () {
      if (!glisse) { return; }
      glisse.classList.remove("qd-glisse");
      var li = glisse; glisse = null;
      marquer(); numeroter(); annoncer(li); diffuser();
    });
    garder.addEventListener("click", function () { marquer(); statut.textContent = "Ordre conservé."; diffuser(); });
    if (touche) { garder.hidden = true; }

    var aide = h("p", { class: "fr-hint-text qd-classement__aide", text: "Classez du premier au dernier : déplacez les éléments avec la souris ou avec les boutons." });
    noeud = fieldset([aide, liste, garder, statut], false);
    numeroter();
    q.focus = function () { var b = liste.querySelector("button:not([disabled])"); if (b) { b.focus(); } };
    q.lire = function () {
      if (!touche) { return null; }
      return Array.prototype.map.call(liste.children, function (li) {
        var v = li.getAttribute("data-valeur");
        return fam === "ref_multiple" ? Number(v) : v;
      });
    };
    q.lirePourCondition = function () {
      if (!touche) { return null; }
      return Array.prototype.map.call(liste.children, function (li) { return li.getAttribute("data-texte"); });
    };
    return noeud;
  }

  /* ---------- Tableau de choix (matrice) ---------- */

  // Une ligne par sujet, une colonne par choix : une réponse par ligne, enregistrée dans une colonne Grist par ligne.
  function construireMatrice(el, options) {
    var id = "q-" + el.id;
    var lignes = el.lignes || [], colonnes = el.colonnesChoix || [];
    var mention = options.mentionObligatoire || "asterisque";
    var obligatoire = !!el.obligatoire;
    var enteteLegende = [el.libelle || "Tableau"];
    if (obligatoire && mention === "asterisque") { enteteLegende.push(h("span", { class: "qd-obligatoire", "aria-hidden": "true", text: " *" })); }
    if (!obligatoire && mention === "facultatif") { enteteLegende.push(" (facultatif)"); }
    if (el.aide) { enteteLegende.push(h("span", { class: "fr-hint-text", text: el.aide })); }

    var tete = h("tr", {}, [h("td", { class: "qd-matrice__coin" }, [h("span", { class: "fr-sr-only", text: "Sujet" })])]
      .concat(colonnes.map(function (c) { return h("th", { scope: "col", text: c }); })));
    var corps = lignes.map(function (l, i) {
      return h("tr", {}, [h("th", { scope: "row", text: l.libelle })].concat(colonnes.map(function (c, j) {
        var rid = id + "-" + i + "-" + j;
        return h("td", {}, [h("div", { class: "fr-radio-group fr-radio-group--sm qd-matrice__radio" }, [
          h("input", { type: "radio", id: rid, name: id + "-" + i, value: c }),
          h("label", { class: "fr-label", for: rid }, [h("span", { class: "fr-sr-only", text: l.libelle + " : " + c })])
        ])]);
      })));
    });
    var tableau = h("div", { class: "qd-matrice-cadre" }, [
      h("table", { class: "qd-matrice" }, [
        h("caption", { class: "fr-sr-only", text: el.libelle || "Tableau" }),
        h("thead", {}, [tete]),
        h("tbody", {}, corps)
      ])
    ]);
    var fs = h("fieldset", { class: "fr-fieldset", id: id + "-groupe", "aria-labelledby": id + "-legende " + id + "-messages" }, [
      h("legend", { class: "fr-fieldset__legend fr-fieldset__legend--regular", id: id + "-legende" }, enteteLegende),
      h("div", { class: "fr-fieldset__element" }, [tableau]),
      messages(id)
    ]);
    if (obligatoire) { fs.setAttribute("aria-required", "true"); }

    function lireMatrice() {
      var res = {};
      lignes.forEach(function (l, i) {
        var c = fs.querySelector("input[name=\"" + id + "-" + i + "\"]:checked");
        if (c) { res[l.colonne || ("ligne" + i)] = c.value; }
      });
      return res;
    }
    var q = {
      element: el, famille: "matrice", id: id, conteneur: fs,
      lireMatrice: lireMatrice,
      lire: function () { var r = lireMatrice(); return Object.keys(r).length ? r : null; },
      lirePourCondition: function () { return null; },
      complet: function () { return Object.keys(lireMatrice()).length === lignes.length; },
      focus: function () { var i = fs.querySelector("input"); if (i) { i.focus(); } },
      afficherErreur: function (msg) {
        fs.classList.add("fr-fieldset--error");
        fs.querySelector(".fr-messages-group").innerHTML = "<p class=\"fr-message fr-message--error\">" + echapper(msg) + "</p>";
      },
      effacerErreur: function () {
        fs.classList.remove("fr-fieldset--error");
        fs.querySelector(".fr-messages-group").innerHTML = "";
      }
    };
    q.noeud = h("div", { class: "qd-element", "data-element": el.id }, [fs]);
    return q;
  }

  /* ---------- Média (image, audio, vidéo, PDF) ---------- */

  // L'adresse doit commencer par https:// ; sinon rien n'est affiché (sauf un avertissement dans l'aperçu).
  function construireMedia(el, options) {
    var url = M.adresseSure(el.adresse);
    var noeud = null;
    var transcription = el.transcription ? h("details", { class: "qd-transcription" }, [
      h("summary", { text: "Transcription" }),
      h("div", { html: formater(el.transcription) })
    ]) : null;
    var legende = el.titre ? h("p", { class: "fr-text--sm qd-media__legende", text: el.titre }) : null;
    if (!url) {
      if (options.apercu) {
        noeud = h("div", { class: "fr-alert fr-alert--warning fr-alert--sm" }, [h("p", { text: "Média non affiché : l'adresse doit commencer par https://." })]);
      }
    } else if (el.type === "image") {
      noeud = h("figure", { class: "fr-content-media qd-media" }, [
        h("div", { class: "fr-content-media__img" }, [h("img", { class: "fr-responsive-img", src: url, alt: el.description || "", loading: "lazy" })]),
        el.titre ? h("figcaption", { class: "fr-content-media__caption", text: el.titre }) : null
      ]);
    } else if (el.type === "audio") {
      noeud = h("div", { class: "qd-media" }, [legende, h("audio", { controls: true, preload: "none", src: url }), transcription]);
    } else if (el.type === "video") {
      noeud = h("div", { class: "qd-media" }, [legende, h("video", { controls: true, preload: "metadata", playsinline: true, src: url, class: "qd-video" }), transcription]);
    } else if (el.type === "pdf") {
      noeud = h("div", { class: "qd-media" }, [
        legende,
        el.affichagePdf === "lien" ? null : h("iframe", { class: "qd-pdf", src: url, title: el.titre || "Document PDF", loading: "lazy" }),
        h("a", { class: "fr-link fr-icon-download-line fr-link--icon-left", href: url, target: "_blank", rel: "noopener",
          text: "Ouvrir ou télécharger le document" + (el.titre ? " : " + el.titre : "") + " (nouvelle fenêtre)" })
      ]);
    }
    return noeud ? h("div", { class: "qd-element", "data-element": el.id }, [noeud]) : null;
  }

  /* ---------- Construction d'une question ---------- */

  // Préremplissage par l'adresse : ?pre_<Colonne>=valeur remplit la question liée à cette colonne Grist
  // (par exemple ?pre_Code=K7P2QX pour un lien de vote personnel). La personne peut encore modifier la valeur.
  function valeurPreremplie(colonne) {
    if (!colonne) { return null; }
    try {
      var params = new URLSearchParams(location.search);
      var h = location.hash.indexOf("?") >= 0 ? location.hash.slice(location.hash.indexOf("?") + 1) : "";
      var ph = new URLSearchParams(h);
      var v = params.get("pre_" + colonne);
      if (v === null) { v = ph.get("pre_" + colonne); }
      return v === null ? null : String(v).slice(0, 500);
    } catch (e) { return null; }
  }

  function construireQuestion(el, champ, options, compteur) {
    var pre = valeurPreremplie(el.colonne);
    if (pre !== null) { el = Object.assign({}, el, { defaut: pre }); }
    var fam = M.famille(champ.type);
    var id = "q-" + el.id;
    var affichage = el.affichage || M.affichageParDefaut(fam, champ.type);
    var obligatoire = !!el.obligatoire;
    var mention = options.mentionObligatoire || "asterisque";
    var LIB_AUTRE = el.libelleAutre || M.LIBELLE_AUTRE;
    var avecAutre = !!el.autre && (fam === "choix" || fam === "choix_multiple");
    var choix = (champ.choix || el.choix || []).filter(function (c) { return !(avecAutre && c === LIB_AUTRE); });
    var refValues = champ.refValues || [];
    var bornes = ((fam === "choix_multiple" || fam === "ref_multiple") && affichage !== "classement") ? bornesChoix(el) : null;
    if (el.aleatoire) { choix = M.melanger(choix); refValues = M.melanger(refValues); }
    var champAutre = null;

    function libelle(tag, attrs) {
      var enfants = [el.libelle || el.colonne];
      if (obligatoire && mention === "asterisque") {
        enfants.push(h("span", { class: "qd-obligatoire", "aria-hidden": "true", text: " *" }));
      }
      if (!obligatoire && mention === "facultatif") {
        enfants.push(" (facultatif)");
      }
      var aide = [el.aide, bornes && texteBornes(bornes)].filter(Boolean).join(" ");
      if (aide) { enfants.push(h("span", { class: "fr-hint-text", text: aide })); }
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

    function bornesEchelle(e) {
      var b = Number(e.min), t = Number(e.max);
      if (e.min === undefined || e.min === "" || isNaN(b)) { b = 1; }
      if (e.max === undefined || e.max === "" || isNaN(t)) { t = 5; }
      b = Math.round(b); t = Math.round(t);
      if (t < b) { t = b; }
      if (t - b > 10) { t = b + 10; }
      return [b, t];
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

    q.affichage = affichage;

    // Option « Autre » : un champ de précision qui apparaît quand elle est choisie.
    function zoneAutre(estChoisi) {
      champAutre = h("input", { class: "fr-input", type: "text", id: id + "-autre", name: id + "-autre", maxlength: "200", autocomplete: "off" });
      var groupe = h("div", { class: "fr-input-group qd-autre", hidden: true }, [
        h("label", { class: "fr-label", for: id + "-autre", text: "Précisez" }), champAutre
      ]);
      var maj = function () { if (estChoisi()) { groupe.removeAttribute("hidden"); } else { groupe.setAttribute("hidden", ""); } };
      q.autreChoisi = estChoisi;
      q.lireAutre = function () { var v = champAutre.value.trim(); return v || null; };
      return { groupe: groupe, maj: maj };
    }
    function brancherAutre(za, noeudCible, evenementSur) {
      noeudCible.insertBefore(za.groupe, noeudCible.querySelector(".fr-messages-group"));
      evenementSur.addEventListener("change", za.maj);
      za.maj();
    }

    var noeud;

    if (fam === "nombre" && affichage === "echelle") {
      var bas = bornesEchelle(el)[0], haut = bornesEchelle(el)[1], notes = [];
      for (var n = bas; n <= haut; n += 1) {
        var texteNote = String(n);
        if (n === bas && el.libelleMin) { texteNote += " – " + el.libelleMin; }
        if (n === haut && el.libelleMax) { texteNote += " – " + el.libelleMax; }
        if (el.libelleCentre && (haut - bas) % 2 === 0 && haut > bas && n === bas + (haut - bas) / 2) { texteNote += " – " + el.libelleCentre; }
        notes.push(radio(id, String(n), texteNote, n - bas));
      }
      noeud = fieldset(notes, true);
      noeud.classList.add("q-echelle");
      if (el.defaut !== undefined && el.defaut !== null && el.defaut !== "") {
        Array.prototype.forEach.call(noeud.querySelectorAll("input"), function (i) { if (i.value === String(el.defaut)) { i.checked = true; } });
      }
      q.lire = function () {
        var c = noeud.querySelector("input:checked");
        return c ? Number(c.value) : null;
      };
    }

    else if (fam === "texte" || fam === "nombre" || fam === "date") {
      var controle;
      if (fam === "texte" && affichage === "long") {
        controle = h("textarea", { class: "fr-input", id: id, name: id, rows: "5" });
      } else {
        var type = "text", extra = {};
        if (fam === "nombre") { type = "text"; extra.inputmode = champ.type === "Int" ? "numeric" : "decimal"; }
        if (fam === "date") { type = affichage === "datetime" ? "datetime-local" : "date"; }
        if (affichage === "lien") { type = "url"; extra.autocomplete = "url"; extra.spellcheck = "false"; extra.inputmode = "url"; }
        if (affichage === "heure") { type = "time"; }
        if (affichage === "courriel") { type = "email"; extra.autocomplete = "email"; extra.spellcheck = "false"; }
        if (affichage === "telephone") { type = "tel"; extra.autocomplete = "tel"; }
        controle = h("input", Object.assign({ class: "fr-input", type: type, id: id, name: id }, extra));
      }
      if (el.indication) { controle.setAttribute("placeholder", el.indication); }
      if (el.defaut !== undefined && el.defaut !== null && el.defaut !== "") { controle.value = String(el.defaut); }
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
      if (fam === "date" && affichage === "datetime") {
        q.lirePourCondition = function () { var v = q.lire(); return v ? String(v).slice(0, 10) : null; };
      }
    }

    else if ((fam === "choix" || fam === "ref") && affichage === "liste") {
      var select = h("select", { class: "fr-select", id: id, name: id },
        [h("option", { value: "", selected: true, text: "Sélectionner une option" })]
          .concat(fam === "choix" ?
            choix.concat(avecAutre ? [LIB_AUTRE] : []).map(function (c) { return h("option", { value: c, text: c }); }) :
            refValues.map(function (r) { return h("option", { value: String(r[0]), text: String(r[1]) }); })));
      if (obligatoire) { select.setAttribute("aria-required", "true"); }
      if (fam === "choix" && el.defaut) { select.value = String(el.defaut); if (select.value !== String(el.defaut)) { select.value = ""; } }
      // Référence : la valeur par défaut (ou préremplie) est l'identifiant de la ligne ou son libellé affiché.
      if (fam === "ref" && el.defaut) {
        Array.prototype.forEach.call(select.options, function (o) { if (o.value && (o.value === String(el.defaut) || o.text === String(el.defaut))) { select.value = o.value; } });
      }
      noeud = groupeSimple("fr-select-group", select);
      if (avecAutre) { brancherAutre(zoneAutre(function () { return select.value === LIB_AUTRE; }), noeud, select); }
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
      if (avecAutre) { items.push(radio(id, LIB_AUTRE, LIB_AUTRE, "autre")); }
      noeud = fieldset(items, false);
      if (fam === "choix" && el.defaut) {
        Array.prototype.forEach.call(noeud.querySelectorAll("input"), function (i) { if (i.value === String(el.defaut)) { i.checked = true; } });
      }
      if (fam === "ref" && el.defaut) {
        Array.prototype.forEach.call(noeud.querySelectorAll("input"), function (i) {
          var lab = noeud.querySelector("label[for=\"" + i.id + "\"]");
          if (i.value === String(el.defaut) || (lab && lab.textContent === String(el.defaut))) { i.checked = true; }
        });
      }
      if (avecAutre) {
        brancherAutre(zoneAutre(function () { var c = noeud.querySelector("input:checked"); return !!c && c.value === LIB_AUTRE; }), noeud, noeud);
      }
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

    else if ((fam === "choix_multiple" || fam === "ref_multiple") && affichage === "classement") {
      noeud = construireClassement(el, fam, id, choix, refValues, fieldset, q);
    }

    else if (fam === "choix_multiple" || fam === "ref_multiple") {
      var cases = fam === "choix_multiple" ?
        choix.map(function (c, i) { return caseACocher(id, c, c, i); }) :
        refValues.map(function (r, i) { return caseACocher(id, String(r[0]), String(r[1]), i); });
      if (avecAutre) { cases.push(caseACocher(id, LIB_AUTRE, LIB_AUTRE, "autre")); }
      noeud = fieldset(cases, false);
      if (fam === "choix_multiple" && el.defaut) {
        var parDefaut = listeDefaut(el);
        Array.prototype.forEach.call(noeud.querySelectorAll("input"), function (i) { if (parDefaut.indexOf(i.value) >= 0) { i.checked = true; } });
      }
      if (avecAutre) {
        brancherAutre(zoneAutre(function () {
          return Array.prototype.some.call(noeud.querySelectorAll("input:checked"), function (c) { return c.value === LIB_AUTRE; });
        }), noeud, noeud);
      }
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
      if (el.defaut === true) { noeud.querySelector("input[value=oui]").checked = true; }
      q.lire = function () {
        var c = noeud.querySelector("input:checked");
        return c ? c.value === "oui" : null;
      };
    }

    else if (fam === "booleen" && affichage === "interrupteur") {
      var inter = h("input", { type: "checkbox", class: "fr-toggle__input", id: id, name: id, "aria-describedby": id + "-messages" });
      if (el.defaut === true) { inter.checked = true; }
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
      if (el.defaut === true) { coche.checked = true; }
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
    if (fam === "matrice") {
      return el.obligatoire && !q.complet() ? "Répondez à chaque ligne du tableau." : null;
    }
    if (el.obligatoire) {
      if (fam === "booleen" && el.affichage !== "ouinon") {
        if (v !== true) { return "Cochez la case pour continuer."; }
      } else if (M.estVide(v)) {
        if (fam === "choix" || fam === "ref" || fam === "booleen") { return "Sélectionnez une réponse."; }
        if (el.affichage === "classement") { return "Classez les éléments : déplacez-en un ou cliquez sur « Garder cet ordre »."; }
        if (fam === "choix_multiple" || fam === "ref_multiple") { return "Sélectionnez au moins une réponse."; }
        if (fam === "fichier") { return "Ajoutez au moins un fichier."; }
        if (fam === "date") { return "Saisissez une date."; }
        return "Ce champ est obligatoire. Saisissez une réponse.";
      }
    }
    if (M.estVide(v)) { return null; }
    if (q.autreChoisi && q.autreChoisi() && !q.lireAutre()) { return "Précisez votre réponse dans le champ « Précisez »."; }
    if ((fam === "choix_multiple" || fam === "ref_multiple") && el.affichage !== "classement" && Array.isArray(v)) {
      var bn = bornesChoix(el);
      if (bn && ((bn.min && v.length < bn.min) || (bn.max && v.length > bn.max))) { return texteBornes(bn); }
    }
    if (fam === "texte" && el.affichage === "lien" && !/^https?:\/\/\S+\.\S+$/i.test(v)) {
      return "Saisissez une adresse web complète, par exemple : https://exemple.fr";
    }
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
    if (fam === "date" && q.affichage === "datetime") {
      var instant = Date.parse(String(v));
      return isNaN(instant) ? v : Math.round(instant / 1000);
    }
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
    var auMoinsUnObligatoire = M.elementsOrdonnes(config).some(function (o) { return (o.element.genre === "question" || o.element.genre === "matrice") && o.element.obligatoire; });
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
        } else if (el.genre === "matrice") {
          var qm = construireMatrice(el, { mentionObligatoire: mention });
          questions[el.id] = qm;
          section.appendChild(qm.noeud);
        } else if (el.genre === "media") {
          var blocMedia = construireMedia(el, { apercu: !!options.apercu });
          if (blocMedia) { section.appendChild(blocMedia); }
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

    var boutonPrecedent = h("button", { type: "button", class: "fr-btn fr-btn--secondary", text: "Précédent" });
    var boutonSuivant = h("button", { type: "submit", class: "fr-btn", text: "Suivant" });
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
        return (el.genre === "question" || el.genre === "matrice") && visibilite.elements[el.id];
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
        if (q.famille === "matrice") {
          var rep = q.lireMatrice();
          Object.keys(rep).forEach(function (c) { champsGrist[c] = rep[c]; });
          return;
        }
        var v = q.lire();
        if (M.estVide(v)) { return; }
        if (q.famille === "booleen" && v === false && q.element.affichage !== "ouinon") { return; }
        if (q.famille === "fichier") { fichiers[q.element.colonne] = v; return; }
        champsGrist[q.element.colonne] = versGrist(q, v, q.typeGrist);
        if (q.autreChoisi && q.autreChoisi() && q.element.colonneAutre) {
          var precision = q.lireAutre();
          if (precision) { champsGrist[q.element.colonneAutre] = precision; }
        }
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

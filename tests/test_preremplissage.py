"""Préremplissage par l'adresse : ?pre_<Colonne>=valeur (lien de vote personnel de grist-consultation, par exemple).
Lancer un serveur à la racine (python3 -m http.server PORT), puis : PORT=… python3 tests/test_preremplissage.py"""
import os, sys
from playwright.sync_api import sync_playwright
ok = ko = 0
def verifier(nom, cond):
    global ok, ko
    print(('OK   ' if cond else 'ÉCHEC ') + nom); ok += bool(cond); ko += (not cond)
q = lambda id, **kw: dict({'id': id, 'genre': 'question'}, **kw)
config = {'titre': 'Vote', 'etapes': [{'id': 'e1', 'titre': 'E', 'elements': [
    q('c', colonne='Code', libelle='Votre code', type='Text', obligatoire=True),
    q('v', colonne='Valeur', libelle='Note', type='Choice', choix=['1', '2', '3']),
    q('n', colonne='Commentaire', libelle='Commentaire', type='Text')]}]}
champs = {'Code': {'type': 'Text'}, 'Valeur': {'type': 'Choice', 'choix': ['1', '2', '3']}, 'Commentaire': {'type': 'Text'}}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROME') or None, args=['--no-sandbox'])
    pg = b.new_page(); erreurs = []
    pg.on('pageerror', lambda e: erreurs.append(str(e)))
    base = f'http://localhost:{os.environ.get("PORT", 8790)}/tests/rendu.html'
    pg.goto(base + '?pre_Code=K7P2QX&pre_Valeur=2&autre=1')
    pg.evaluate('([c, ch]) => monterTest(c, ch)', [config, champs])
    verifier('texte prérempli depuis l\'adresse', pg.get_by_label('Votre code').input_value() == 'K7P2QX')
    verifier('choix prérempli depuis l\'adresse', pg.get_by_label('2', exact=True).is_checked() if pg.get_by_label('2', exact=True).count() else False)
    verifier('question sans paramètre laissée vide', pg.get_by_label('Commentaire').input_value() == '')
    pg.get_by_label('Votre code').fill('AUTRE1')
    pg.get_by_role('button', name='Envoyer').click(); pg.wait_for_timeout(300)
    env = pg.evaluate('window.ENVOYES')
    verifier('valeur préremplie modifiable et envoyée', env and env[-1].get('Code') == 'AUTRE1')
    pg.goto(base + '#/formulaire?pre_Code=H4SH01')
    pg.evaluate('([c, ch]) => monterTest(c, ch)', [config, champs])
    verifier('paramètre lu aussi après le #', pg.get_by_label('Votre code').input_value() == 'H4SH01')
    pg.goto(base)
    pg.evaluate('([c, ch]) => monterTest(c, ch)', [config, champs])
    verifier('sans paramètre : rien de prérempli', pg.get_by_label('Votre code').input_value() == '')
    # Références (liste ou boutons) : préremplies par l'identifiant de la ligne ou par son libellé.
    cref = {'titre': 'Vote', 'etapes': [{'id': 'e1', 'titre': 'E', 'elements': [
        q('k', colonne='Consultation', libelle='Consultation', type='Ref:Consultations', affichage='liste'),
        q('p', colonne='Proposition', libelle='Proposition', type='Ref:Propositions', affichage='radio')]}]}
    chref = {'Consultation': {'type': 'Ref:Consultations', 'refValues': [[1, 'Budget'], [4, 'Outils']]},
             'Proposition': {'type': 'Ref:Propositions', 'refValues': [[18, 'Outil A'], [19, 'Outil B']]}}
    pg.goto(base + '?pre_Consultation=4&pre_Proposition=Outil%20B')
    pg.evaluate('([c, ch]) => monterTest(c, ch)', [cref, chref])
    verifier('référence en liste préremplie par son identifiant', pg.get_by_label('Consultation').input_value() == '4')
    verifier('référence en boutons préremplie par son libellé', pg.get_by_label('Outil B').is_checked())
    pg.get_by_role('button', name='Envoyer').click(); pg.wait_for_timeout(300)
    env = pg.evaluate('window.ENVOYES')
    verifier('références préremplies envoyées comme identifiants', env and env[-1].get('Consultation') == 4 and env[-1].get('Proposition') == 19)
    pg.goto(base + '?pre_Consultation=99')
    pg.evaluate('([c, ch]) => monterTest(c, ch)', [cref, chref])
    verifier('référence inconnue : rien de prérempli', pg.get_by_label('Consultation').input_value() == '')
    # Réponse préremplie figée ou masquée (réglage de la question)
    cfig = {'titre': 'Vote', 'etapes': [{'id': 'e1', 'titre': 'E', 'elements': [
        q('k', colonne='Consultation', libelle='Consultation', type='Ref:Consultations', affichage='liste', prerempli='masquee', obligatoire=True),
        q('p', colonne='Proposition', libelle='Proposition', type='Ref:Propositions', affichage='radio', prerempli='fige', obligatoire=True),
        q('c', colonne='Code', libelle='Votre code', type='Text', prerempli='fige')]}]}
    pg.goto(base + '?pre_Consultation=4&pre_Proposition=19&pre_Code=K7P2QX')
    pg.evaluate('([c, ch]) => monterTest(c, ch)', [cfig, chref])
    verifier('préremplie masquée : question cachée', not pg.locator('[data-element=k]').is_visible())
    verifier('préremplie figée : visible, non modifiable, avec mention', pg.get_by_label('Outil B').is_disabled() and pg.get_by_label('Votre code').is_disabled() and 'fixée par le lien' in pg.locator('body').inner_text())
    pg.get_by_role('button', name='Envoyer').click(); pg.wait_for_timeout(300)
    env = pg.evaluate('window.ENVOYES')
    verifier('figée et masquée : valeurs envoyées', env and env[-1].get('Consultation') == 4 and env[-1].get('Proposition') == 19 and env[-1].get('Code') == 'K7P2QX')
    pg.goto(base + '?pre_Consultation=99')
    pg.evaluate('([c, ch]) => monterTest(c, ch)', [cfig, chref])
    verifier('masquée mais valeur inconnue : la question reste visible', pg.locator('[data-element=k]').is_visible())
    # Période de réponse
    cper = {'titre': 'Sondage', 'etapes': config['etapes'], 'ouverture': {'fin': '2020-01-01T12:00'}}
    pg.goto(base); pg.evaluate('([c, ch]) => monterTest(c, ch)', [cper, champs])
    t = pg.locator('body').inner_text()
    verifier('après la clôture : message, pas de formulaire', 'Ce questionnaire est clos' in t and "1 janvier 2020 à 12 h 00" in t and pg.locator('form').count() == 0)
    cper['ouverture'] = {'debut': '2999-01-01T09:00'}
    pg.evaluate('([c, ch]) => monterTest(c, ch)', [cper, champs])
    verifier('avant l\'ouverture : message, pas de formulaire', "pas encore ouvert" in pg.locator('body').inner_text() and pg.locator('form').count() == 0)
    cper['ouverture'] = {'debut': '2020-01-01T09:00', 'fin': '2999-01-01', 'messageApres': 'Fini.'}
    pg.evaluate('([c, ch]) => monterTest(c, ch)', [cper, champs])
    verifier('pendant la période : formulaire affiché', pg.locator('form').count() == 1)
    proche = pg.evaluate("() => { const d = new Date(Date.now() + 60000); const z = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + 'T' + z(d.getHours()) + ':' + z(d.getMinutes()); }")
    cper['ouverture'] = {'fin': proche}
    pg.evaluate('([c, ch]) => monterTest(c, ch)', [cper, champs])
    pg.get_by_label('Votre code').fill('ABC')
    pg.evaluate("() => { const r = Date.now; Date.now = () => r() + 180000; const D = Date; window.Date = class extends D { constructor(...a) { if (!a.length) { super(D.now() + 180000); } else { super(...a); } } }; }")
    pg.get_by_role('button', name='Envoyer').click(); pg.wait_for_timeout(300)
    verifier('clôture en cours de saisie : rien n\'est envoyé, message affiché', not pg.evaluate('window.ENVOYES').__len__() and "n'a pas été envoyée" in pg.locator('body').inner_text())
    verifier('clôture en cours de saisie : rien n\'est envoyé', pg.evaluate("""() => { const p = QuestionnaireRendu.periodeReponse({fin: '2020-01-01'}, new Date()); return !!p && p.titre === 'Ce questionnaire est clos'; }"""))
    verifier('aucune erreur JavaScript', not erreurs)
    if erreurs: print(erreurs)
    b.close()
print(f'{ok} réussis, {ko} échoués'); sys.exit(1 if ko else 0)

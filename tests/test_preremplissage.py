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
    verifier('aucune erreur JavaScript', not erreurs)
    if erreurs: print(erreurs)
    b.close()
print(f'{ok} réussis, {ko} échoués'); sys.exit(1 if ko else 0)

"""Test de l'éditeur du questionnaire « dans Grist » (API Grist simulée, tests/grist-mock.js) :
nouveaux types, options, tableau, média, colonnes créées, glisser-déposer.
Lancer un serveur à la racine (python3 -m http.server PORT), puis : PORT=… python3 tests/test_editeur.py"""
import os, re, json
from playwright.sync_api import sync_playwright
ok = ko = 0
def verifier(nom, cond):
    global ok, ko
    print(('OK   ' if cond else 'ÉCHEC ') + nom); ok += bool(cond); ko += (not cond)
RACINE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
mockjs = open(os.path.join(RACINE, 'tests', 'grist-mock.js')).read()
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROME') or None, args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 1400, 'height': 1100})
    erreurs = []
    pg.on('pageerror', lambda e: erreurs.append(str(e)))
    pg.route('https://docs.getgrist.com/grist-plugin-api.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body=mockjs))
    pg.route(re.compile(r'^https://cdn\.jsdelivr\.net/'), lambda r: r.abort())
    mock = {'tables': {'T': {'colonnes': {'Nom': {'type': 'Text'}, 'Themes': {'type': 'ChoiceList', 'widgetOptions': json.dumps({'choices': ['A', 'B', 'C']})}}, 'lignes': []}},
            'table': 'T', 'utilisateur': {'email': 'a@exemple.fr', 'nom': 'A'}}
    pg.add_init_script('window.MOCK = ' + json.dumps(mock) + ';')
    pg.goto(f'http://localhost:{os.environ.get("PORT", 8790)}/editeur.html')
    pg.wait_for_selector('li.ed-item')
    cfg = lambda: json.loads(pg.evaluate('window.MOCK.tables.T.colonnes.Config_questionnaire && window.MOCK.tables.T.colonnes.Config_questionnaire.description') or 'null')
    cols = lambda: pg.evaluate('window.MOCK.tables.T.colonnes')
    etape = pg.evaluate('document.querySelector(".ed-liste").getAttribute("data-etape")')

    # Ajouts : types nouveaux
    for val in ['new:DateTime|datetime', 'new:ChoiceList|classement', 'new:Text|lien', 'new:Text|heure']:
        pg.select_option(f'#ajout-{etape}', val)
    pg.locator(f'[data-action="ajouter-matrice"]').first.click()
    pg.locator('#p-lignesTexte').fill('Accueil\nRapidité')
    pg.locator('#p-colonnesTexte').fill('Non\nOui')
    pg.locator('#p-libelle').fill('Avis')
    pg.locator(f'[data-action="ajouter-media"]').first.click()
    pg.locator('#p-adresse').fill('https://exemple.fr/a.png')
    pg.locator('#p-description').fill('Schéma')
    verifier('structure : 6 éléments + 2 de départ', pg.locator('li.ed-item').count() == 2 + 6 - 0 or pg.locator('li.ed-item').count() == 8)

    # Options sur la colonne Themes : Autre, bornes, aléatoire
    pg.locator('li.ed-item', has_text='Themes').locator('.ed-choisir').click()
    pg.locator('#p-autre').check()
    pg.locator('#p-choixMin').fill('1'); pg.locator('#p-choixMax').fill('2')
    pg.locator('#p-aleatoire').check()
    pg.locator('#p-defaut').fill('A')
    pg.locator('#enregistrer').click()
    pg.wait_for_timeout(800)
    c = cols(); k = cfg()
    verifier('colonne date et heure avec fuseau', any(v.get('type') == 'DateTime:Europe/Paris' for v in c.values()))
    verifier('colonne classement : liste de choix', any(v.get('type') == 'ChoiceList' and k for kk, v in c.items() if kk not in ('Themes',)))
    verifier('colonne lien : widget lien hypertexte', any('HyperLink' in (v.get('widgetOptions') or '') for v in c.values()))
    lignes = [e for et in k['etapes'] for e in et['elements'] if e.get('genre') == 'matrice']
    verifier('tableau : une colonne de choix par ligne', len(lignes) == 1 and all(l['colonne'] and c[l['colonne']]['type'] == 'Choice' and json.loads(c[l['colonne']]['widgetOptions'])['choices'] == ['Non', 'Oui'] for l in lignes[0]['lignes']))
    th = [e for et in k['etapes'] for e in et['elements'] if e.get('colonne') == 'Themes'][0]
    verifier('Autre : colonne de précision créée et reliée', th.get('colonneAutre') and c[th['colonneAutre']]['type'] == 'Text')
    verifier('Autre : choix ajouté dans la colonne', 'Autre' in json.loads(c['Themes']['widgetOptions'])['choices'])
    verifier('options enregistrées (bornes, aléatoire, défaut)', th.get('choixMin') == 1 and th.get('choixMax') == 2 and th.get('aleatoire') is True and th.get('defaut') == 'A')
    media = [e for et in k['etapes'] for e in et['elements'] if e.get('genre') == 'media']
    verifier('média enregistré', len(media) == 1 and media[0]['adresse'].startswith('https://') and media[0]['description'] == 'Schéma')
    verifier('liste de choix éditable sans « Autre »', 'Autre' not in pg.locator('#p-choix').input_value())

    # Glisser-déposer : le dernier élément passe en premier
    avant = [e['id'] for e in k['etapes'][0]['elements']]
    dernier = pg.locator('li.ed-item').last
    premier = pg.locator('li.ed-item').first
    dernier.drag_to(premier, target_position={'x': 120, 'y': 3})
    pg.wait_for_timeout(300)
    ordre = pg.evaluate('Array.from(document.querySelectorAll("li.ed-item")).map(l => l.getAttribute("data-id"))')
    verifier('glisser-déposer : élément déplacé en tête', ordre[0] == avant[-1] and ordre[1:] == avant[:-1])
    pg.locator('#enregistrer').click(); pg.wait_for_timeout(500)
    verifier('glisser-déposer : ordre enregistré', [e['id'] for e in cfg()['etapes'][0]['elements']] == ordre)

    # Aperçu : tout s'affiche
    pg.locator('.fr-segmented__element label', has_text='Aperçu').first.click()
    pg.wait_for_selector('.qd-questionnaire')
    verifier('aperçu : classement, tableau, image', pg.locator('.qd-classement').count() == 1 and pg.locator('.qd-matrice').count() == 1 and pg.locator('img[alt="Schéma"]').count() == 1)
    verifier('aucune erreur JavaScript', not erreurs)
    if erreurs: print(erreurs)
    b.close()
print(f'\n{ok} réussis, {ko} échecs')
raise SystemExit(1 if ko else 0)

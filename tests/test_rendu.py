"""Test du rendu public du questionnaire : nouvelles options (bornes, Autre, défaut, aléatoire, classement,
tableau, médias, date et heure, lien, heure, libellé central).
Lancer un serveur à la racine (python3 -m http.server PORT), puis : PORT=… python3 tests/test_rendu.py"""
import os, json
from playwright.sync_api import sync_playwright
ok = ko = 0
def verifier(nom, cond):
    global ok, ko
    print(('OK   ' if cond else 'ÉCHEC ') + nom); ok += bool(cond); ko += (not cond)

def q(id, genre='question', **kw):
    d = {'id': id, 'genre': genre}; d.update(kw); return d
def config(elements, titre='T'):
    return {'titre': titre, 'etapes': [{'id': 'e1', 'titre': 'E', 'elements': elements}]}
def envoyer(pg):
    pg.get_by_role('button', name='Envoyer').click()
    pg.wait_for_timeout(200)
    return pg.evaluate('window.ENVOYES')

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROME') or None, args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 1000, 'height': 1200})
    erreurs = []
    pg.on('pageerror', lambda e: erreurs.append(str(e)))
    pg.goto(f'http://localhost:{os.environ.get("PORT", 8790)}/tests/rendu.html')

    def monter(elements, champs=None):
        pg.evaluate('([c, ch]) => monterTest(c, ch)', [config(elements), champs or {}])

    # --- Bornes min / max sur les choix multiples
    monter([q('a', colonne='A', libelle='Thèmes', type='ChoiceList', choix=['X', 'Y', 'Z', 'W'], choixMin=1, choixMax=2)],
           {'A': {'type': 'ChoiceList', 'choix': ['X', 'Y', 'Z', 'W']}})
    verifier('bornes : consigne affichée', 'entre 1 et 2' in pg.inner_text('#racine'))
    for v in ['X', 'Y', 'Z']: pg.get_by_label(v, exact=True).check()
    pg.get_by_role('button', name='Envoyer').click()
    verifier('bornes : maximum refusé (3 > 2)', pg.locator('.fr-message--error').count() > 0 and pg.evaluate('window.ENVOYES.length') == 0)
    pg.get_by_label('Z', exact=True).uncheck()
    verifier('bornes : 2 choix acceptés', envoyer(pg) == [{'A': ['L', 'X', 'Y']}])
    monter([q('a', colonne='A', libelle='Thèmes', type='ChoiceList', choix=['X', 'Y', 'Z'], choixMin=2)],
           {'A': {'type': 'ChoiceList', 'choix': ['X', 'Y', 'Z']}})
    pg.get_by_label('X', exact=True).check()
    pg.get_by_role('button', name='Envoyer').click()
    verifier('bornes : minimum 2 refusé avec 1 choix', pg.locator('.fr-message--error').count() > 0 and pg.evaluate('window.ENVOYES.length') == 0)

    # --- Autre avec précision
    monter([q('a', colonne='A', libelle='Source', type='Choice', choix=['Web', 'Presse'], autre=True, colonneAutre='A_precision')],
           {'A': {'type': 'Choice', 'choix': ['Web', 'Presse']}})
    verifier('autre : champ de précision masqué au départ', pg.locator('.qd-autre').is_hidden())
    pg.get_by_label('Autre', exact=True).check()
    verifier('autre : champ visible quand choisi', pg.locator('.qd-autre').is_visible())
    pg.get_by_role('button', name='Envoyer').click()
    verifier('autre : précision réclamée', pg.locator('.fr-message--error').count() > 0)
    pg.locator('.qd-autre input').fill('Bouche à oreille')
    verifier('autre : choix + précision envoyés', envoyer(pg) == [{'A': 'Autre', 'A_precision': 'Bouche à oreille'}])

    # --- Réponse par défaut
    monter([q('a', colonne='A', libelle='Ville', type='Text', defaut='Reims'),
            q('b', colonne='B', libelle='Mode', type='Choice', choix=['Radio1', 'Radio2'], defaut='Radio2'),
            q('c', colonne='C', libelle='Cases', type='ChoiceList', choix=['C1', 'C2', 'C3'], defaut='C1\nC3'),
            q('d', colonne='D', libelle='Accord', type='Bool', affichage='case', defaut=True)],
           {'A': {'type': 'Text'}, 'B': {'type': 'Choice', 'choix': ['Radio1', 'Radio2']},
            'C': {'type': 'ChoiceList', 'choix': ['C1', 'C2', 'C3']}, 'D': {'type': 'Bool'}})
    verifier('défaut : texte, radio, cases, case', envoyer(pg) == [{'A': 'Reims', 'B': 'Radio2', 'C': ['L', 'C1', 'C3'], 'D': True}])

    # --- Ordre aléatoire : au moins un ordre différent sur 12 essais
    ordres = set()
    for _ in range(12):
        monter([q('a', colonne='A', libelle='Choix', type='Choice', choix=['1', '2', '3', '4', '5', '6'], aleatoire=True)],
               {'A': {'type': 'Choice', 'choix': ['1', '2', '3', '4', '5', '6']}})
        ordres.add(tuple(pg.locator('.fr-radio-group label').all_inner_texts()))
    verifier('aléatoire : l\'ordre varie', len(ordres) > 1)
    verifier('aléatoire : tous les choix présents', all(sorted(o) == ['1', '2', '3', '4', '5', '6'] for o in ordres))

    # --- Classement : boutons, une seule cellule, liste ordonnée
    monter([q('a', colonne='A', libelle='Priorités', type='ChoiceList', affichage='classement', choix=['Eau', 'Feu', 'Air'], obligatoire=True)],
           {'A': {'type': 'ChoiceList', 'choix': ['Eau', 'Feu', 'Air']}})
    pg.get_by_role('button', name='Envoyer').click()
    verifier('classement : obligatoire sans geste refusé', pg.locator('.fr-message--error').count() > 0)
    pg.get_by_role('button', name='Descendre « Eau »').click()
    verifier('classement : bouton Descendre', pg.locator('.qd-classement__texte').all_inner_texts() == ['Feu', 'Eau', 'Air'])
    pg.get_by_role('button', name='Monter « Air »').click()
    verifier('classement : bouton Monter', pg.locator('.qd-classement__texte').all_inner_texts() == ['Feu', 'Air', 'Eau'])
    verifier('classement : numéros', pg.locator('.qd-rang').all_inner_texts() == ['1', '2', '3'])
    # glisser-déposer à la souris (HTML5) : Feu -> après Eau
    pg.locator('.qd-classement__item', has_text='Feu').drag_to(pg.locator('.qd-classement__item', has_text='Eau'), target_position={'x': 100, 'y': 12})
    verifier('classement : glisser-déposer', pg.locator('.qd-classement__texte').all_inner_texts() in (['Air', 'Eau', 'Feu'], ['Air', 'Feu', 'Eau'], ['Feu', 'Air', 'Eau']) and
             pg.locator('.qd-classement__texte').all_inner_texts() != ['Feu', 'Air', 'Eau'])
    ordre = pg.locator('.qd-classement__texte').all_inner_texts()
    envoi = envoyer(pg)
    verifier('classement : une cellule, liste ordonnée', envoi == [{'A': ['L'] + ordre}])

    # --- Classement : « Garder cet ordre »
    monter([q('a', colonne='A', libelle='Priorités', type='ChoiceList', affichage='classement', choix=['Eau', 'Feu'], obligatoire=True)],
           {'A': {'type': 'ChoiceList', 'choix': ['Eau', 'Feu']}})
    pg.get_by_role('button', name='Garder cet ordre').click()
    verifier('classement : ordre conservé tel quel', envoyer(pg) == [{'A': ['L', 'Eau', 'Feu']}])

    # --- Tableau de choix
    monter([q('m', genre='matrice', libelle='Avis', obligatoire=True,
              lignes=[{'libelle': 'Accueil', 'colonne': 'M_Accueil'}, {'libelle': 'Rapidité', 'colonne': 'M_Rapidite'}],
              colonnesChoix=['Non', 'Oui'])])
    pg.get_by_role('button', name='Envoyer').click()
    verifier('tableau : réponse par ligne exigée', pg.locator('.fr-message--error').count() > 0 and pg.evaluate('window.ENVOYES.length') == 0)
    pg.get_by_label('Accueil : Oui').check(); pg.get_by_label('Rapidité : Non').check()
    verifier('tableau : une colonne par ligne', envoyer(pg) == [{'M_Accueil': 'Oui', 'M_Rapidite': 'Non'}])

    # --- Échelle avec libellé central et défaut
    monter([q('n', colonne='N', libelle='Note', type='Int', affichage='echelle', min=1, max=5, libelleMin='Bas', libelleCentre='Moyen', libelleMax='Haut', defaut=3)],
           {'N': {'type': 'Int'}})
    verifier('échelle : libellé central', 'Moyen' in pg.inner_text('#racine') and 'Bas' in pg.inner_text('#racine') and 'Haut' in pg.inner_text('#racine'))
    verifier('échelle : valeur par défaut', envoyer(pg) == [{'N': 3}])

    # --- Lien, heure, date et heure
    monter([q('l', colonne='L', libelle='Site', type='Text', affichage='lien'),
            q('h', colonne='H', libelle='Heure', type='Text', affichage='heure'),
            q('d', colonne='D', libelle='Rendez-vous', type='DateTime:Europe/Paris', affichage='datetime')],
           {'L': {'type': 'Text'}, 'H': {'type': 'Text'}, 'D': {'type': 'DateTime:Europe/Paris'}})
    verifier('types HTML : url, time, datetime-local',
             pg.locator('input[type=url]').count() == 1 and pg.locator('input[type=time]').count() == 1 and pg.locator('input[type=datetime-local]').count() == 1)
    pg.locator('input[type=url]').fill('exemple')
    pg.get_by_role('button', name='Envoyer').click()
    verifier('lien : adresse incomplète refusée', pg.locator('.fr-message--error').count() > 0)
    pg.locator('input[type=url]').fill('https://exemple.fr/page')
    pg.locator('input[type=time]').fill('14:30')
    pg.locator('input[type=datetime-local]').fill('2026-12-01T09:15')
    envoi = envoyer(pg)
    verifier('lien / heure : texte', envoi and envoi[0].get('L') == 'https://exemple.fr/page' and envoi[0].get('H') == '14:30')
    verifier('date et heure : secondes depuis 1970 (entier)', envoi and isinstance(envoi[0].get('D'), int) and envoi[0]['D'] > 1_700_000_000)

    # --- Médias
    monter([q('i', genre='media', type='image', adresse='https://exemple.fr/a.png', description='Schéma', titre='Légende'),
            q('au', genre='media', type='audio', adresse='https://exemple.fr/a.mp3', transcription='Texte lu'),
            q('p', genre='media', type='pdf', adresse='https://exemple.fr/a.pdf', titre='Doc'),
            q('x', genre='media', type='image', adresse='http://exemple.fr/non.png', description='refus')])
    verifier('média : image avec alt', pg.locator('img[alt="Schéma"]').count() == 1)
    verifier('média : audio lisible + transcription', pg.locator('audio[controls]').count() == 1 and pg.locator('.qd-transcription').count() == 1)
    verifier('média : PDF affiché + lien', pg.locator('iframe.qd-pdf').count() == 1 and pg.locator('a[href$="a.pdf"]').count() == 1)
    verifier('média : adresse http refusée (rien affiché)', pg.locator('img[src^="http://"]').count() == 0)

    verifier('aucune erreur JavaScript', not erreurs)
    if erreurs: print(erreurs)
    b.close()
print(f'\n{ok} réussis, {ko} échecs')
raise SystemExit(1 if ko else 0)

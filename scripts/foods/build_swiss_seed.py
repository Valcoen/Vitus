#!/usr/bin/env python3
"""
Builds supabase/migrations/20261120_007_food_seed.up.sql from the
Schweizer Nährwertdatenbank (Swiss Food Composition Database).

  Source: Schweizer Nährwertdatenbank V 7.1, Bundesamt für Lebensmittelsicherheit
  und Veterinärwesen BLV, https://naehrwertdaten.ch  (free, also commercially,
  with this source note)

Usage (stdlib only; keep the downloaded file outside the repo):
  curl -L -o /tmp/swiss.xlsx https://naehrwertdaten.ch/wp-content/uploads/2026/07/Schweizer_Nahrwertdatenbank.xlsx
  python3 -I scripts/foods/build_swiss_seed.py /tmp/swiss.xlsx supabase/migrations/20261120_007_food_seed.up.sql

What it does
  * all "generic foods" (≈1,200), Swiss-German names translated to the words
    used in Germany (the Swiss name stays as a search synonym)
  * mapped to Vitus shopping categories, kind (ingredient / dish / drink),
    vegetarian / vegan where the category makes it clear (else unknown)
  * piece / bunch / clove weights for common raw ingredients
  * the existing Vitus foods keep their names and values; they get the extra
    nutrients and settings of their Swiss twin, which is then hidden
  * a few staples the Swiss list lacks (soy sauce, spices, wine…) as
    "Richtwert" entries
The SQL is idempotent (upsert on source + source_id).
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from xlsx_reader import read  # noqa: E402

VERSION = 'Schweizer Nährwertdatenbank V 7.1 (BLV)'

# column indexes in the "Generische Lebensmittel" sheet
C = dict(id=0, name=3, syn=4, cat=5, density=6, kcal=11, fat=14, sat=17, carbs=41, sugar=44, fiber=50, protein=53, salt=56)

# ── Swiss → German wording (order matters: longer phrases first) ──────────
WORDS = [
    ('Saurer Halbrahm', 'Saure Sahne'), ('Sauerrahm', 'Crème fraîche'), ('Kaffeerahm', 'Kaffeesahne'),
    ('Vollrahm', 'Schlagsahne'), ('Halbrahm', 'Sahne 25 %'), ('Rahmglace', 'Sahneeis'), ('Cornet Glace', 'Eistüte'),
    ('Glaceriegel', 'Eisriegel'), ('Glace', 'Eis'), (r'\bRahm\b', 'Sahne'),
    ('Schümliguetzli', 'Baiser'), ('Waffelguetzli', 'Waffelkekse'), ('guetzli', 'kekse'), ('Guetzli', 'Kekse'),
    ('Pouletgeschnetzeltes', 'Hähnchengeschnetzeltes'), ('Poulet', 'Hähnchen'),
    ('Peperoni', 'Paprika'), ('Zucchetti', 'Zucchini'), (r'\bRande\b', 'Rote Bete'), ('Baumnuss', 'Walnuss'),
    ('Nüsslisalat', 'Feldsalat'), ('Federkohl', 'Grünkohl'), (r'\bKefe\b', 'Zuckerschote'),
    ('Gehacktes', 'Hackfleisch'), ('Hackplätzli', 'Frikadelle'), ('Plätzli', 'Schnitzel'),
    ('Teigwaren', 'Nudeln'), ('Tomatenpüree', 'Tomatenmark'), ('Bouillon', 'Brühe'),
    ('Eierschwamm', 'Pfifferling'), ('Wienerli', 'Wiener Würstchen'), ('Buttergipfeli', 'Buttercroissant'),
    ('Laugengipfeli', 'Laugencroissant'), ('Schinkengipfeli', 'Schinkencroissant'), ('Gipfeli', 'Croissant'),
    ('Butterweggli', 'Milchbrötchen'), ('Bratbutter', 'Butterschmalz'), ('Knöpflimehl', 'Spätzlemehl'),
    ('Knöpfli', 'Spätzle'), ('wähe', 'blechkuchen'), ('Wähe', 'Blechkuchen'), ('Kartoffelstock', 'Kartoffelpüree'),
    ('Apérogebäck', 'Knabbergebäck'), ('Crevetten', 'Garnelen'), ('Rüebli', 'Möhren'),
    ('Hühnereigelb', 'Eigelb'), ('Hühnereiweiss', 'Eiweiß'), ('Hühnerei', 'Ei'),
    ('Griess', 'Grieß'), ('griess', 'grieß'), ('Süss', 'Süß'), ('süss', 'süß'), ('Weiss', 'Weiß'), ('weiss', 'weiß'),
    ('Gross', 'Groß'), ('gross', 'groß'), ('Mass', 'Maß'), ('Zubage', 'Zugabe'), ('Zustatz', 'Zusatz'),
    ('tiefgekuhlt', 'tiefgekühlt'),
]


def german(name: str) -> str:
    out = name.strip()
    for a, b in WORDS:
        out = re.sub(a, b, out) if a.startswith(r'\b') else out.replace(a, b)
    return re.sub(r'\s+', ' ', out)


# extra search words for staples (by German name after translation)
ALIASES = {
    'Ei, ganz, roh': ['Ei', 'Eier', 'Hühnerei'],
    'Tomate, geschält (Konserve)': ['Dosentomaten', 'gehackte Tomaten', 'Tomaten aus der Dose', 'stückige Tomaten', 'passierte Tomaten'],
    'Hackfleisch (Durchschnitt aus Rind, Kalb, Schwein, Hähnchen), roh': ['Hackfleisch gemischt', 'Hack'],
    'Rind, Hackfleisch, roh': ['Rinderhackfleisch', 'Rinderhack'],
    'Schwein, Hackfleisch, roh': ['Schweinehackfleisch', 'Schweinemett'],
    'Nudeln ohne Ei, trocken': ['Nudeln', 'Pasta', 'Spaghetti', 'Penne', 'Fusilli', 'Rigatoni', 'Makkaroni'],
    'Nudeln mit Ei, trocken': ['Eiernudeln', 'Tagliatelle', 'Pappardelle', 'Bandnudeln', 'Fettuccine'],
    'Reis poliert, trocken': ['Reis', 'Basmatireis', 'Jasminreis', 'Langkornreis', 'weißer Reis'],
    'Reis unpoliert, trocken': ['Vollkornreis', 'Naturreis'],
    'Brühe, Gemüse, zubereitet': ['Gemüsebrühe'],
    'Brühe, Fleisch, zubereitet': ['Fleischbrühe', 'Rinderbrühe'],
    'Brühe, Geflügel, zubereitet': ['Hühnerbrühe', 'Geflügelbrühe'],
    'Kochspeck': ['Pancetta', 'Bauchspeck', 'Bacon', 'Speck'],
    'Vollmilch, pasteurisiert': ['Milch', 'Vollmilch', 'Frischmilch'],
    'Mehl, hell (Durchschnitt)': ['Mehl', 'Weizenmehl', 'Weizenmehl Type 405', 'Mehl Type 550'],
    'Maisstärke': ['Speisestärke', 'Stärke', 'Maizena'],
    'Tomatenmark': ['Tomatenpüree', 'Tomatenmark'],
    'Käse in Salzlake (Schaf- und Ziegenmilch)': ['Feta', 'Schafskäse', 'Hirtenkäse'],
    'Crème fraîche': ['Schmand', 'Sauerrahm'],
    'Schlagsahne, pasteurisiert': ['Sahne', 'Schlagsahne', 'Rahm'],
    'Schlagsahne, UHT': ['Sahne', 'Schlagsahne'],
    'Sahne 25 %, UHT': ['Kochsahne', 'Halbrahm'],
    'Quark, nature, mager': ['Magerquark', 'Quark'],
    'Paprika, rot, roh': ['Paprika', 'rote Paprika', 'Paprikaschote'],
    'Zwiebel, roh': ['Zwiebel', 'Zwiebeln', 'Gemüsezwiebel'],
    'Knoblauch, roh': ['Knoblauch', 'Knoblauchzehe'],
    'Karotte, roh': ['Karotte', 'Karotten', 'Möhre', 'Möhren'],
    'Kartoffel, geschält, roh': ['Kartoffel', 'Kartoffeln'],
    'Stangensellerie, roh': ['Staudensellerie', 'Stangensellerie', 'Sellerie'],
    'Knollensellerie, roh': ['Knollensellerie', 'Sellerie'],
    'Broccoli, roh': ['Brokkoli', 'Broccoli'],
    'Olivenöl': ['Olivenöl', 'Öl'],
    'Rapsöl': ['Rapsöl', 'Öl', 'Pflanzenöl'],
    'Zitrone, roh': ['Zitrone', 'Zitronen'],
    'Zitronensaft': ['Zitronensaft'],
    'Honig (Blütenhonig)': ['Honig'],
    'Ingwer, roh': ['Ingwer'],
    'Parmesan': ['Parmigiano Reggiano', 'Parmesan', 'Grana Padano'],
}

# ── category mapping: Swiss path → Vitus shopping aisle ───────────────────
def food_category(path: str, name: str) -> str:
    top, _, sub = path.partition('/')
    sub = sub or ''
    n = name.lower()
    if top == 'Gemüse':
        return 'kraeuter' if sub == 'Kräuter' else 'gemuese'
    if top == 'Früchte':
        return 'getraenke' if 'säfte' in sub.lower() else 'obst'
    if top == 'Fleisch und Innereien':
        return 'fleisch'
    if top == 'Fleisch- und Wurstwaren':
        return 'wurst'
    if top == 'Fisch':
        return 'fisch'
    if top == 'Milch und Milchprodukte':
        return 'kaese' if sub in ('Hartkäse', 'Weichkäse', 'Halbhartkäse', 'Käseerzeugnisse') else 'milch'
    if top == 'Eier':
        return 'eier'
    if top.startswith('Getreideprodukte'):
        if sub in ('Mehle und Stärke', 'Teige'):
            return 'mehl'
        if sub.startswith('Kartoffeln'):
            return 'kartoffeln'
        if sub == 'Hülsenfrüchte':
            return 'huelsenfruechte'
        return 'getreide'
    if top.startswith('Brote'):
        return 'brot' if sub in ('Brote und Brotwaren', 'Knäckebrote, Zwieback, Crackers und Waffeln') else 'getreide'
    if top == 'Fette und Öle':
        if sub == 'Rahm':
            return 'milch'
        return 'saucen' if sub == 'Salatsaucen' else 'oele'
    if top.startswith('Pflanzliche Proteinlieferanten'):
        return 'pflanzlich'
    if top.startswith('Nüsse'):
        return 'nuesse'
    if top == 'Salzige Snacks':
        return 'nuesse' if 'Nüsse' in sub else 'suesses'
    if top == 'Süssigkeiten':
        return 'mehl' if sub == 'Zucker und Süssstoffe' else 'suesses'
    if top == 'Verschiedenes':
        if sub == 'Saucen':
            return 'saucen'
        if sub.startswith('Salz'):
            return 'kraeuter'
        if sub.startswith('Gelier'):
            return 'mehl'
        if 'essig' in n or 'senf' in n or 'ketchup' in n or 'mayonnaise' in n:
            return 'saucen'
        return 'sonstiges'
    if 'Getränke' in top:
        return 'getraenke'
    if top == 'Gerichte':
        return 'gerichte'
    return 'sonstiges'


def kind(path: str) -> str:
    top, _, sub = path.partition('/')
    if top == 'Gerichte' or sub in ('Kuchen, Torten und Cake', 'Sonstige süsse Backwaren', 'Cremen und Pudding'):
        return 'dish'
    if 'Getränke' in top or 'säfte' in sub.lower():
        return 'drink'
    return 'ingredient'


MEAT_WORDS = re.compile(r'speck|schinken|gelatine|schmalz|fleisch|wurst|sardell|lachs|thunfisch|hähnchen|rind|schwein|kalb|lamm', re.I)
ANIMAL_WORDS = re.compile(r'\bei\b|eier|eigelb|eiweiß|butter|milch|sahne|käse|quark|joghurt|honig|rahm|molke|ghee', re.I)
PLANT_CATS = {'gemuese', 'obst', 'kraeuter', 'kartoffeln', 'huelsenfruechte', 'nuesse', 'pflanzlich'}


def diet(cat: str, name: str, path: str):
    """(is_vegetarian, is_vegan) — None when it isn't clear from category and name."""
    plant_based = cat == 'pflanzlich' or re.search(r'vegan|vegetarisch', name, re.I)
    if cat in ('fleisch', 'wurst', 'fisch'):
        return False, False
    if MEAT_WORDS.search(name) and not plant_based:
        return False, False
    if cat in ('milch', 'kaese', 'eier'):
        return True, False
    if re.match(r'(Honig|Bienenhonig)\b', name):
        return True, False
    if re.match(r'(Erdnussbutter|Erdnussmus|Mandelmus|Tahin|Sesampaste)', name):
        return True, True
    if cat in ('gerichte', 'suesses', 'sonstiges'):
        return None, None
    if plant_based and re.search(r'vegetarisch', name, re.I) and not re.search(r'vegan', name, re.I):
        return True, None
    if ANIMAL_WORDS.search(name.replace('Honigmelone', '')) or 'mit Ei' in name:
        return True, False
    if cat in PLANT_CATS or cat in ('getreide', 'mehl'):
        return True, True
    if cat == 'oele':
        return (True, True) if re.search(r'öl\b|Öl', name) else (None, None)
    if cat == 'brot':
        return True, None
    return None, None


# ── weights per unit for common raw ingredients (German base name) ────────
UNITS = {
    'Ei': {'Stück': 55}, 'Zwiebel': {'Stück': 150}, 'Schalotte': {'Stück': 30}, 'Knoblauch': {'Zehe': 4, 'Stück': 40},
    'Karotte': {'Stück': 80}, 'Tomate': {'Stück': 120}, 'Kartoffel': {'Stück': 150}, 'Süßkartoffel': {'Stück': 250},
    'Apfel': {'Stück': 150}, 'Birne': {'Stück': 160}, 'Banane': {'Stück': 120}, 'Orange': {'Stück': 180},
    'Zitrone': {'Stück': 100}, 'Paprika': {'Stück': 160}, 'Zucchini': {'Stück': 250}, 'Gurke': {'Stück': 400},
    'Aubergine': {'Stück': 300}, 'Avocado': {'Stück': 150}, 'Champignon': {'Stück': 20}, 'Kiwi': {'Stück': 75},
    'Pfirsich': {'Stück': 150}, 'Mango': {'Stück': 300}, 'Lauch': {'Stange': 200, 'Stück': 200},
    'Broccoli': {'Stück': 400}, 'Blumenkohl': {'Stück': 700}, 'Fenchel': {'Stück': 250}, 'Kohlrabi': {'Stück': 250},
    'Stangensellerie': {'Stange': 40, 'Stück': 40}, 'Knollensellerie': {'Stück': 500}, 'Ingwer': {'Stück': 20},
    'Petersilie': {'Bund': 25}, 'Schnittlauch': {'Bund': 25}, 'Basilikum': {'Bund': 20}, 'Thymian': {'Bund': 10},
    'Rosmarin': {'Zweig': 2}, 'Salbei': {'Bund': 10}, 'Pfefferminze': {'Bund': 15},
    'Toastbrot': {'Scheibe': 25}, 'Brot (Durchschnitt)': {'Scheibe': 40}, 'Ruchbrot': {'Scheibe': 40},
    'Milchbrötchen': {'Stück': 40}, 'Croissant (Durchschnitt)': {'Stück': 45},
}
# spoon weights where they differ a lot from 15 g / 5 g
SPOONS = {
    'mehl': {'EL': 10, 'TL': 3}, 'kraeuter': {'EL': 6, 'TL': 2},
}
SPOON_OVERRIDES = {'Zucker': {'EL': 12, 'TL': 4}, 'Salz': {'EL': 18, 'TL': 6}, 'Honig (Blütenhonig)': {'EL': 20, 'TL': 7},
                   'Tomatenmark': {'EL': 15, 'TL': 5}, 'Haferflocken': {'EL': 8}, 'Butter': {'EL': 12, 'TL': 4}}


def unit_grams(gname: str, cat: str) -> dict:
    base = re.split(r',', gname)[0].strip()
    units = {}
    if re.search(r'\broh\b|^[^,]+$', gname) or ', ganz' in gname:
        for key, val in UNITS.items():
            if base == key or base.startswith(key + ' ') or gname == key:
                units.update(val)
    units.update(SPOONS.get(cat, {}))
    for key, val in SPOON_OVERRIDES.items():
        if base == key or gname.startswith(key + ','):
            units.update(val)
    return units


# ── existing Vitus foods → Swiss twin (German name after translation) ─────
VITUS_TWINS = {
    'Ananas': 'Ananas, roh', 'Apfel': 'Apfel, roh', 'Aprikose': 'Aprikose, roh', 'Avocado': 'Avocado, roh',
    'Banane': 'Banane, roh', 'Birne': 'Birne, roh', 'Blaubeere': 'Heidelbeere, roh', 'Blumenkohl': 'Blumenkohl, roh',
    'Bohnen, grün': 'Bohne, grün, roh', 'Brokkoli': 'Broccoli, roh', 'Cashewnuss': 'Cashewnuss', 'Eier': 'Ei, ganz, roh',
    'Eiernudeln, gegart': 'Nudeln mit Ei, gekocht im Salzwasser (unjodiert)', 'Erbsen, grün': 'Erbse, grün, roh',
    'Erdbeeren': 'Erdbeere, roh', 'Erdnussbutter': 'Erdnussbutter',
    'Hackfleisch (gemischt)': 'Hackfleisch (Durchschnitt aus Rind, Kalb, Schwein, Hähnchen), roh',
    'Haferflocken': 'Haferflocken', 'Hähnchenbrust': 'Hähnchen, Brust, ohne Haut, roh', 'Himbeeren': 'Himbeere, roh',
    'Honig': 'Honig (Blütenhonig)', 'Karotte': 'Karotte, roh', 'Kartoffel': 'Kartoffel, geschält, roh',
    'Kirschen': 'Kirsche, roh', 'Kiwi': 'Kiwi, roh', 'Mandeln': 'Mandel', 'Mango': 'Mango, roh',
    'Mozzarella': 'Mozzarella', 'Olivenöl': 'Olivenöl', 'Orange': 'Orange, roh', 'Paprika': 'Paprika, rot, roh',
    'Parmesan': 'Parmesan', 'Quinoa (gekocht)': 'Quinoa, gekocht (ohne Zugabe von Salz und Fett)',
    'Reis (gekocht)': 'Reis poliert, gekocht in Salzwasser (unjodiert)', 'Rinderfilet, roh': 'Rind, Filet, roh',
    'Rinderhackfleisch, roh': 'Rind, Hackfleisch, roh', 'Rinderhackfleisch (mager)': 'Rind, Hackfleisch, mager, roh',
    'Rosenkohl': 'Rosenkohl, roh', 'Rote Bete': 'Rote Bete, roh', 'Schweinefilet, roh': 'Schwein, Filet, roh',
    'Schweineschulter, roh': 'Schwein, Schulter, Braten, roh', 'Sellerie (Knolle)': 'Knollensellerie, roh',
    'Sellerie (Staude)': 'Stangensellerie, roh', 'Spinat': 'Spinat, roh', 'Süßkartoffel': 'Süßkartoffel, roh',
    'Tomate': 'Tomate, roh', 'Truthahn': 'Truthahn, Brust, Schnitzel oder Geschnetzeltes, roh', 'Walnuss': 'Walnuss',
    'Wassermelone': 'Wassermelone, roh', 'Weintrauben': 'Traube, weiß, roh', 'Zucchini': 'Zucchini, roh',
    'Zwiebel (Weiß)': 'Zwiebel, roh', 'Gurke': 'Gurke, roh',
}
# duplicates inside the Vitus list: hidden, still resolvable for old recipes;
# they get the same data as the entry they duplicate
VITUS_DUPLICATES = {'Blaubeeren': 'Blaubeere', 'Hähnchenbrust, roh': 'Hähnchenbrust', 'Paprika (rot)': 'Paprika',
                    'Reis, gekocht': 'Reis (gekocht)', 'Walnüsse': 'Walnuss'}
# Vitus foods without a twin: category + diet only
VITUS_EXTRA = {
    'Baguette': ('brot', True, True), 'Brötchen': ('brot', True, True), 'Vollkornbrot': ('brot', True, True),
    'Pumpernickel': ('brot', True, True), 'Cocktailtomaten': ('gemuese', True, True), 'Emmentaler 45%': ('kaese', True, False),
    'Fruchtjoghurt 3,5% Fett': ('milch', True, False), 'Griechischer Joghurt': ('milch', True, False),
    'Hackfleisch (Schwein)': ('fleisch', False, False), 'Hähnchenoberkeule ohne Haut, roh': ('fleisch', False, False),
    'Hähnchenschenkel mit Haut, roh': ('fleisch', False, False), 'Kefir 3,5% Fett': ('milch', True, False),
    'Kräuterquark': ('milch', True, False), 'Lachs': ('fisch', False, False), 'Lachs, roh': ('fisch', False, False),
    'Linsen, braun, gekocht': ('huelsenfruechte', True, True), 'Magerquark': ('milch', True, False),
    'Mais': ('gemuese', True, True), 'Rinderhüfte, roh': ('fleisch', False, False),
    'Saure Sahne 30% Fett': ('milch', True, False), 'Schweinebauch, roh': ('fleisch', False, False),
    'Thunfisch (Dose)': ('fisch', False, False), 'Vollkornnudeln (gekocht)': ('getreide', True, True),
    'Zwiebel (Rot)': ('gemuese', True, True),
}

# ── staples missing in the Swiss list (rounded reference values) ──────────
#   name, category, kcal, protein, carbs, fat, sugar, fiber, sat, salt, density, units, veg, vegan, aliases
MANUAL = [
    ('Sojasauce', 'saucen', 53, 8.1, 4.9, 0.6, 0.4, 0.8, 0.1, 14.5, 1.15, {'EL': 17, 'TL': 6}, True, True, ['Sojasoße', 'Shoyu']),
    ('Paprikapulver, edelsüß', 'kraeuter', 282, 14.1, 54.0, 12.9, 10.3, 34.9, 2.1, 0.2, None, {'EL': 7, 'TL': 2.5}, True, True, ['Paprikapulver', 'Paprika edelsüß']),
    ('Pfeffer, schwarz, gemahlen', 'kraeuter', 251, 10.4, 38.7, 3.3, 0.6, 25.3, 1.4, 0.05, None, {'EL': 6, 'TL': 2, 'Prise': 0.3}, True, True, ['Pfeffer', 'schwarzer Pfeffer']),
    ('Currypulver', 'kraeuter', 325, 14.3, 25.2, 14.0, 2.8, 53.2, 2.2, 0.1, None, {'EL': 6, 'TL': 2}, True, True, ['Curry']),
    ('Backpulver', 'mehl', 53, 0.0, 26.0, 0.0, 0.0, 0.2, 0.0, 30.0, None, {'Pck': 15, 'TL': 4}, True, True, ['Backtriebmittel']),
    ('Vanillezucker', 'mehl', 395, 0.0, 98.0, 0.0, 98.0, 0.0, 0.0, 0.0, None, {'Pck': 8, 'TL': 4}, True, True, ['Vanillinzucker']),
    ('Gouda, 45 % Fett i. Tr.', 'kaese', 356, 25.0, 0.0, 28.0, 0.0, 0.0, 17.6, 2.0, None, {'Scheibe': 25}, True, False, ['Gouda']),
    ('Kokosmilch (Konserve)', 'saucen', 197, 2.0, 2.8, 20.0, 2.8, 0.0, 17.6, 0.05, 1.0, {}, True, True, ['Kokosmilch', 'Kokosnussmilch']),
    ('Rotwein', 'getraenke', 85, 0.1, 2.6, 0.0, 0.6, 0.0, 0.0, 0.0, 0.99, {}, True, None, ['Wein, rot']),
    ('Weißwein', 'getraenke', 82, 0.1, 2.6, 0.0, 1.0, 0.0, 0.0, 0.0, 0.99, {}, True, None, ['Weisswein', 'Wein, weiß']),
    ('Frühlingszwiebel, roh', 'gemuese', 32, 1.8, 4.7, 0.2, 2.3, 2.6, 0.0, 0.04, None, {'Stück': 15, 'Bund': 100}, True, True, ['Frühlingszwiebel', 'Lauchzwiebel']),
    ('Limette, roh', 'obst', 30, 0.7, 7.7, 0.2, 1.7, 2.8, 0.0, 0.0, None, {'Stück': 60}, True, True, ['Limette', 'Limetten']),
    ('Koriander, frisch', 'kraeuter', 23, 2.1, 0.9, 0.5, 0.9, 2.8, 0.0, 0.1, None, {'Bund': 20}, True, True, ['Koriander', 'Koriandergrün']),
    ('Dill, frisch', 'kraeuter', 43, 3.5, 4.9, 1.1, 0.0, 2.1, 0.1, 0.15, None, {'Bund': 20}, True, True, ['Dill']),
    ('Oregano, getrocknet', 'kraeuter', 265, 9.0, 26.0, 4.3, 4.1, 42.5, 1.6, 0.05, None, {'TL': 1, 'EL': 3}, True, True, ['Oregano']),
    ('Butter', 'oele', 741, 0.7, 0.6, 83.2, 0.6, 0.0, 52.0, 0.02, 0.91, {'EL': 12, 'TL': 4}, True, False, ['Süßrahmbutter', 'Butter, ungesalzen']),
    ('Gelatine', 'mehl', 338, 84.0, 0.0, 0.1, 0.0, 0.0, 0.0, 0.5, None, {'Blatt': 1.7}, False, False, ['Blattgelatine']),
]

NUMERIC = re.compile(r'^-?\d+(?:[.,]\d+)?$')


def num(v):
    if v is None:
        return None
    s = str(v).strip().replace(',', '.')
    if s.startswith('<'):
        return 0.0
    if s.lower() in ('sp.', 'spuren', 'tr'):
        return 0.0
    return float(s) if NUMERIC.match(s) else None


def q(v) -> str:
    """SQL literal."""
    if v is None:
        return 'null'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, (int, float)):
        return repr(round(v, 3)) if isinstance(v, float) else str(v)
    if isinstance(v, (list, tuple)):
        return 'array[' + ','.join(q(x) for x in v) + ']::text[]' if v else "'{}'::text[]"
    if isinstance(v, dict):
        return q(json.dumps(v, ensure_ascii=False)) + '::jsonb'
    return "'" + str(v).replace("'", "''") + "'"


# legacy column `category` only allows these six values (old shopping list grouping)
CAT_LABEL = {
    'gemuese': 'Gemüse', 'obst': 'Obst', 'kraeuter': 'Sonstiges', 'kartoffeln': 'Gemüse', 'fleisch': 'Fleisch',
    'wurst': 'Fleisch', 'fisch': 'Fleisch', 'milch': 'Milchprodukte', 'kaese': 'Milchprodukte', 'eier': 'Milchprodukte',
    'pflanzlich': 'Sonstiges', 'brot': 'Getreide', 'getreide': 'Getreide', 'mehl': 'Getreide',
    'huelsenfruechte': 'Gemüse', 'nuesse': 'Sonstiges', 'oele': 'Sonstiges', 'saucen': 'Sonstiges',
    'suesses': 'Sonstiges', 'getraenke': 'Sonstiges', 'gerichte': 'Sonstiges', 'sonstiges': 'Sonstiges',
}


def main(xlsx: str, out: str):
    sheet = read(xlsx)['Generische Lebensmittel']
    header = sheet[2]
    assert header[C['name']] == 'Name' and header[C['kcal']].startswith('Energie, Kilokalorien'), header[:12]
    assert header[C['protein']].startswith('Protein') and header[C['salt']].startswith('Salz'), 'column layout changed'

    rows = []
    seen_names = {}
    for r in sheet[3:]:
        if not r or not r[C['id']] or not r[C['name']]:
            continue
        r = r + [None] * (60 - len(r))
        swiss_name = r[C['name']].strip()
        gname = german(swiss_name)
        path = (r[C['cat']] or '').split(';')[0].strip()
        cat = food_category(path, gname)
        veg, vegan = diet(cat, gname, path)
        syn = [s.strip() for s in (r[C['syn']] or '').split(';') if s.strip()]
        aliases = []
        for a in [swiss_name if swiss_name != gname else None, *syn, *(german(s) for s in syn), *ALIASES.get(gname, [])]:
            if a and a != gname and a not in aliases:
                aliases.append(a)
        kcal = num(r[C['kcal']])
        rows.append(dict(
            source_id=str(r[C['id']]).strip(), name=gname, aliases=aliases, cat=cat, path=r[C['cat']] or '',
            kind=kind(path), veg=veg, vegan=vegan, density=num(r[C['density']]),
            kcal=round(kcal) if kcal is not None else 0, protein=num(r[C['protein']]) or 0.0,
            carbs=num(r[C['carbs']]) or 0.0, fat=num(r[C['fat']]) or 0.0, sugar=num(r[C['sugar']]),
            fiber=num(r[C['fiber']]), sat=num(r[C['sat']]), salt=num(r[C['salt']]), units=unit_grams(gname, cat),
        ))
        seen_names.setdefault(gname, 0)
        seen_names[gname] += 1

    by_name = {x['name']: x for x in rows}
    missing = [f'{v} → {s}' for v, s in VITUS_TWINS.items() if s not in by_name]
    missing += [f'alias target {k}' for k in ALIASES if k not in by_name]
    if missing:
        print('Unresolved names (fix the tables in this script):', *missing, sep='\n  ')
        sys.exit(1)
    twins = set(VITUS_TWINS.values())

    cols = ('name', 'category', 'kcal_100g', 'protein_100g', 'carbs_100g', 'fat_100g', 'sugar_100g', 'fiber_100g',
            'sat_fat_100g', 'salt_100g', 'density', 'unit_grams', 'food_category', 'aliases', 'kind',
            'is_vegetarian', 'is_vegan', 'source', 'source_id', 'source_category', 'is_hidden')
    upd = [c for c in cols if c not in ('source', 'source_id')]

    # typed nulls so a chunk where a column is all-null still has the right type
    TYPES = [None, None, 'integer', 'double precision', 'double precision', 'double precision', 'double precision',
             'double precision', 'double precision', 'double precision', 'double precision', None, None, None, None,
             'boolean', 'boolean', None, None, None, None]

    def values(x, source):
        return '(' + ', '.join(q(v) if v is not None or not t else f'null::{t}' for t, v in zip(TYPES, (
            x['name'], CAT_LABEL[x['cat']], x['kcal'], x['protein'], x['carbs'], x['fat'], x['sugar'], x['fiber'],
            x['sat'], x['salt'], x['density'], x['units'], x['cat'], x['aliases'], x['kind'], x['veg'], x['vegan'],
            source, x['source_id'], x['path'], x.get('hidden', False)))) + ')'

    for x in rows:
        x['hidden'] = x['name'] in twins

    manual = []
    for i, m in enumerate(MANUAL, 1):
        (name, cat, kcal, p, c, f, sugar, fiber, sat, salt, density, units, veg, vegan, aliases) = m
        manual.append(dict(name=name, cat=cat, kcal=kcal, protein=p, carbs=c, fat=f, sugar=sugar, fiber=fiber, sat=sat,
                           salt=salt, density=density, units=units, veg=veg, vegan=vegan, aliases=aliases, kind='drink' if cat == 'getraenke' else 'ingredient',
                           source_id=f'vitus-{i}', path='Richtwert (Vitus)', hidden=False))

    lines = [
        '-- ============================================================',
        '-- 007 Food data (generated by scripts/foods/build_swiss_seed.py - do not edit by hand)',
        f'-- Quelle: {VERSION}, https://naehrwertdaten.ch',
        '-- Free to use, also commercially, with this source note.',
        '-- Upserts on (source, source_id); safe to run again.',
        '-- ============================================================',
        'begin;',
        '',
        f'-- {len(rows)} foods from the Swiss database',
    ]
    conflict = 'on conflict (source, source_id) where source_id is not null do update set ' + ', '.join(f'{c} = excluded.{c}' for c in upd)
    # food_items.name is unique: a row whose name is already taken by another
    # food (e.g. the Vitus "Walnuss") is skipped; that food gets enriched below.
    def insert(chunk, source):
        lines.append(f'insert into public.food_items ({", ".join(cols)})')
        lines.append(f'select * from (values')
        lines.append(',\n'.join(values(x, source) for x in chunk))
        lines.append(f') as v ({", ".join(cols)})')
        lines.append('where not exists (select 1 from public.food_items f where f.name = v.name '
                     'and (f.source <> v.source or f.source_id is distinct from v.source_id))')
        lines.append(conflict + ';')

    for i in range(0, len(rows), 200):
        insert(rows[i:i + 200], 'swiss_fcdb')
    lines.append(f'\n-- {len(manual)} staples missing in the Swiss list (reference values)')
    insert(manual, 'manual')

    lines.append('\n-- Existing Vitus foods: keep name + macros, take the rest from the Swiss twin; the twin is hidden')
    pairs = list(VITUS_TWINS.items()) + [(dup, VITUS_TWINS[main]) for dup, main in VITUS_DUPLICATES.items()]
    for vname, sname in pairs:
        s = by_name[sname]
        aliases = [sname, *[a for a in s['aliases'] if a != vname]]
        lines.append(
            f"update public.food_items set food_category = {q(s['cat'])}, kind = {q(s['kind'])}, "
            f"is_vegetarian = {q(s['veg'])}, is_vegan = {q(s['vegan'])}, sugar_100g = {q(s['sugar'])}, "
            f"fiber_100g = {q(s['fiber'])}, sat_fat_100g = {q(s['sat'])}, salt_100g = {q(s['salt'])}, "
            f"density = {q(s['density'])}, unit_grams = {q(s['units'])}, aliases = {q(aliases)}, "
            f"source_category = {q('Werte: Vitus; Zusatzwerte: ' + VERSION)} "
            f"where source = 'vitus' and name = {q(vname)};")
    for vname, (cat, veg, vegan) in VITUS_EXTRA.items():
        lines.append(f"update public.food_items set food_category = {q(cat)}, is_vegetarian = {q(veg)}, is_vegan = {q(vegan)} "
                     f"where source = 'vitus' and name = {q(vname)};")
    lines.append(f"update public.food_items set is_hidden = true where source = 'vitus' and name in ({', '.join(q(n) for n in VITUS_DUPLICATES)});")
    # the Swiss "Erdnussbutter" lives under 'Verschiedenes'
    lines.append("update public.food_items set food_category = 'nuesse' where name in ('Erdnussbutter') and food_category = 'sonstiges';")
    lines.append("update public.food_items set food_category = 'sonstiges' where food_category is null;")
    lines += ['', 'commit;', '']
    Path(out).write_text('\n'.join(lines), encoding='utf8')

    from collections import Counter
    print(f'{len(rows)} Swiss + {len(manual)} manual foods → {out}')
    print('categories:', Counter(x['cat'] for x in rows).most_common())
    print('kinds:', Counter(x['kind'] for x in rows))
    print('vegan true/false/None:', Counter(x['vegan'] for x in rows))
    print('with unit weights:', sum(1 for x in rows if any(k not in ('EL', 'TL') for k in x['units'])))
    dup = [n for n, c in seen_names.items() if c > 1]
    if dup:
        print('duplicate German names:', dup[:20])


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(2)
    main(sys.argv[1], sys.argv[2])

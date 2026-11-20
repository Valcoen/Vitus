"""Minimal xlsx reader (stdlib only): prints sheet names and first rows."""
import sys, zipfile, re, json
import xml.etree.ElementTree as ET
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def read(path):
    z = zipfile.ZipFile(path)
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS):
            shared.append(''.join(t.text or '' for t in si.iter('{%s}t' % NS['m'])))
    wb = ET.fromstring(z.read('xl/workbook.xml'))
    rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    relmap = {r.get('Id'): r.get('Target') for r in rels}
    sheets = {}
    for s in wb.find('m:sheets', NS):
        rid = s.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
        target = relmap[rid].lstrip('/')
        if not target.startswith('xl/'): target = 'xl/' + target
        rows = []
        for row in ET.fromstring(z.read(target)).iter('{%s}row' % NS['m']):
            cells = {}
            for c in row.findall('m:c', NS):
                ref = re.match(r'([A-Z]+)', c.get('r')).group(1)
                col = 0
                for ch in ref: col = col * 26 + ord(ch) - 64
                v = c.find('m:v', NS)
                t = c.get('t')
                if t == 's' and v is not None: val = shared[int(v.text)]
                elif t == 'inlineStr': val = ''.join(x.text or '' for x in c.iter('{%s}t' % NS['m']))
                else: val = v.text if v is not None else None
                cells[col - 1] = val
            if cells:
                n = max(cells) + 1
                rows.append([cells.get(i) for i in range(n)])
        sheets[s.get('name')] = rows
    return sheets
if __name__ == '__main__':
    sh = read(sys.argv[1])
    out = sys.argv[2] if len(sys.argv) > 2 else None
    for name, rows in sh.items():
        print('SHEET', name, len(rows))
        for r in rows[:4]: print('  ', [x for x in r][:40])
    if out: json.dump(sh, open(out, 'w', encoding='utf8'), ensure_ascii=False)

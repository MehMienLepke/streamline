"""Bouwt streamline.html uit de bestanden in src/ (alles in één bestand, geen internet nodig).
Gebruik:  python build.py
"""
import re, pathlib, json
root = pathlib.Path(__file__).parent
src = root / 'src'
core = (src / 'core.js').read_text(encoding='utf-8')
version = re.search(r"APP_VERSION = '([^']+)'", core).group(1)
js = '\n'.join((src / f).read_text(encoding='utf-8') for f in ['icons.js', 'core.js', 'settings.js', 'widgets.js'])
html = (src / 'template.html').read_text(encoding='utf-8')
html = html.replace('/*CSS*/', (src / 'styles.css').read_text(encoding='utf-8')).replace('/*JS*/', js).replace('/*VERSION*/', version)
(root / 'streamline.html').write_text(html, encoding='utf-8')
vf = root / 'version.json'
info = json.loads(vf.read_text(encoding='utf-8')) if vf.exists() else {}
info.update({'version': version, 'file': 'streamline.html'})
info.setdefault('groot', False); info.setdefault('notes', '')
vf.write_text(json.dumps(info, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
print('streamline.html gebouwd, versie', version, '-', len(html) // 1024, 'kB')

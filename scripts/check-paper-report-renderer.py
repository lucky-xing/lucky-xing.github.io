#!/usr/bin/env python3
"""Integration checks in an isolated fixture. Does not publish or edit reports."""
from pathlib import Path
from shutil import copyfile
from tempfile import TemporaryDirectory
from bs4 import BeautifulSoup
import json
import subprocess
import sys


def main():
    repo = Path(__file__).resolve().parent.parent
    with TemporaryDirectory(prefix='paper-report-check-', dir=repo.parent) as directory:
        fixture = Path(directory).resolve()
        assert fixture.parent == repo.parent.resolve()
        files = ['style.css', 'theme-motion.js', 'index.html', 'ai.html', 'finance.html',
                 'communication.html', 'learning.html', 'world.html', 'assets/paper-report.css',
                 'assets/vendor/mathjax/tex-svg-full.js', 'communication/isac/index.html']
        files += ['assets/papers/pilot-based-radio/' + name for name in
                  ['fig1-geometry.png', 'fig2-scenario.png', 'fig3-before.png', 'fig4-after.png']]
        for name in files:
            target = fixture / name
            target.parent.mkdir(parents=True, exist_ok=True)
            copyfile(repo / name, target)
        source = fixture / 'report.md'
        source.write_text(r'''# A mathematical report

## Model

The parameter is $x_1^2$, subject to $a<b$.

$$
\begin{aligned} y_i &= a_i x + b_i,\\
\widehat x&=\arg\min_x\sum_i(y_i-a_ix-b_i)^2.\end{aligned}
$$

```python
literal = "$not_math$"
```

Inline code: `$also_not_math$`.

## Results

<figure class="paper-figure"><a href="/assets/papers/pilot-based-radio/fig1-geometry.png"><img src="/assets/papers/pilot-based-radio/fig1-geometry.png" alt="Source figure for renderer validation."></a><figcaption>Source figure, used only in this temporary check.</figcaption></figure>
''', encoding='utf-8')
        target = 'posts/2026/10/18/fixture.html'
        command = [sys.executable, str(repo / 'scripts/render-paper-report.py'), '--repo', str(fixture),
                   'render', '--source', 'report.md', '--output', target, '--date', '2026-10-18',
                   '--category-label', 'Communication', '--category-url', 'communication.html',
                   '--section-label', 'ISAC', '--section-url', 'communication/isac/', '--summary', 'Integration fixture']

        def run(extra=(), success=True):
            result = subprocess.run(command + list(extra), capture_output=True, text=True, encoding='utf-8')
            assert (result.returncode == 0) == success, result.stderr
            return result

        run()
        soup = BeautifulSoup((fixture / target).read_text(encoding='utf-8'), 'html.parser')
        assert len(soup.select('.equation')) == 1 and len(soup.select('.math-inline')) == 2
        assert '$not_math$' in soup.select_one('pre').get_text()
        assert '$also_not_math$' in ' '.join(x.get_text() for x in soup.select('code'))
        assert '&=' in soup.select_one('.equation').get_text()
        assert 'a<b' in soup.select('.math-inline')[1].get_text()
        assert soup.select_one('header .brand')['href'] == '../../../../index.html'
        config = next(x.string for x in soup.select('script') if x.string and 'window.MathJax' in x.string)
        config_path = fixture / 'math-config.js'
        config_path.write_text('global.window={};\n' + config + '\nconsole.log(JSON.stringify(window.MathJax.tex));', encoding='utf-8')
        actual = json.loads(subprocess.check_output(['node', str(config_path)], text=True, encoding='utf-8'))
        assert actual['inlineMath'] == [['\\(', '\\)']] and actual['displayMath'] == [['\\[', '\\]']]
        run(success=False)
        before = (fixture / target).read_bytes()
        source.write_text(source.read_text(encoding='utf-8').replace('/assets/papers/pilot-based-radio/fig1-geometry.png', '/assets/missing.png'), encoding='utf-8')
        run(['--overwrite'], success=False)
        assert (fixture / target).read_bytes() == before

        # Use the approved real article to detect corruption across many math tokens.
        reference = repo / 'posts/2026/10/18/pilot-based-radio-positioning-mapping.html'
        reference_source = repo / 'reports/2026/2026-10-18-pilot-based-radio-survey.md'
        command[command.index('--source') + 1] = str(reference_source)
        run(['--overwrite'])
        generated = BeautifulSoup((fixture / target).read_text(encoding='utf-8'), 'html.parser')
        accepted = BeautifulSoup(reference.read_text(encoding='utf-8'), 'html.parser')
        for selector in ['.equation', '.math-inline']:
            assert [x.get_text() for x in generated.select(selector)] == [x.get_text() for x in accepted.select(selector)]
        assert len(generated.select('figure.paper-figure')) == len(accepted.select('figure.paper-figure'))
    print('PASS: math preservation, literal code, escaping, site shell, local assets, overwrite guard, failed-write protection and full reference regeneration.')


if __name__ == '__main__':
    main()

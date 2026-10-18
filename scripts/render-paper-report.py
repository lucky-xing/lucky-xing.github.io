#!/usr/bin/env python3
"""Render an authored Markdown paper report with the existing site shell.

Requires Python-Markdown and beautifulsoup4. Never commits, pushes, updates
category listings or fetches source material. See reports/paper-research/README.md.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
from datetime import date
import hashlib
import html
from pathlib import Path
import posixpath
import re
import sys
from urllib.parse import unquote, urlsplit, urlunsplit
from uuid import uuid4

import markdown
from bs4 import BeautifulSoup


class ReportError(ValueError):
    pass


def within_repo(repo: Path, relative: str) -> Path:
    if Path(relative).is_absolute():
        raise ReportError('Expected a repository-relative path: ' + relative)
    path = (repo / relative).resolve()
    if not path.is_relative_to(repo):
        raise ReportError('Path leaves the selected repository: ' + relative)
    return path


def local_target(repo: Path, current: Path, url: str) -> Path | None:
    parts = urlsplit(url)
    if parts.scheme or parts.netloc:
        return None
    value = unquote(parts.path)
    target = repo / value.lstrip('/') if value.startswith('/') else current.parent / value
    target = target.resolve() if value else current
    if not target.is_relative_to(repo):
        raise ReportError('Local URL leaves repository: ' + url)
    if target.is_dir() or value.endswith('/'):
        target /= 'index.html'
    return target


def check_html(repo: Path, path: Path, content: str | None = None) -> dict:
    soup = BeautifulSoup(content if content is not None else path.read_text(encoding='utf-8'), 'html.parser')
    errors = []
    ids = [tag['id'] for tag in soup.select('[id]')]
    if len(ids) != len(set(ids)):
        errors.append('duplicate HTML IDs')
    if len(soup.select('main h1')) != 1:
        errors.append('expected one main title')
    if not soup.title or not soup.title.get_text(strip=True):
        errors.append('missing page title')
    for tag in soup.select('a[href], img[src], script[src], link[rel="stylesheet"][href]'):
        attr = 'src' if tag.name in ('img', 'script') else 'href'
        url = tag[attr]
        if not url or url == '#':
            continue
        try:
            dest = local_target(repo, path, url)
        except ReportError as exc:
            errors.append(str(exc))
            continue
        if dest is None:
            continue
        if dest != path and not dest.is_file():
            errors.append('missing local resource: ' + url)
        fragment = unquote(urlsplit(url).fragment)
        if dest == path and fragment and fragment not in ids:
            errors.append('missing local anchor: ' + url)
    for fig in soup.select('figure.paper-figure'):
        if not fig.find('figcaption'):
            errors.append('paper figure missing caption')
        for image in fig.select('img'):
            if not image.get('alt', '').strip():
                errors.append('paper figure missing alt text')
    if re.search(r'\{\{[^{}]+\}\}', soup.get_text()):
        errors.append('unfilled template field')
    if errors:
        raise ReportError(str(path.relative_to(repo)) + ':\n  ' + '\n  '.join(errors))
    return {'page': path.relative_to(repo).as_posix(),
            'equations': len(soup.select('.equation')),
            'inline_math': len(soup.select('.math-inline')),
            'figures': len(soup.select('figure.paper-figure'))}


def render_markdown(source: str) -> tuple[BeautifulSoup, int]:
    # Prevent literal dollars in fenced and inline code from becoming equations.
    prefix = 'PAPERREPORT' + uuid4().hex.upper()
    protected = {}
    formulas = {}

    def mask_code(match):
        key = prefix + 'CODE' + str(len(protected)) + 'END'
        protected[key] = match.group(0)
        return key

    fenced = r'(?ms)^([`]{3,}|[~]{3,})[^\n]*\n.*?^\1[ \t]*(?=\n|$)'
    masked = re.sub(fenced, mask_code, source)
    masked = re.sub(r'(`+)[^\n]*?\1', mask_code, masked)
    if masked.count('$$') % 2:
        raise ReportError('Unpaired display-math delimiter $$')

    def math_token(tex: str, display: bool):
        key = prefix + 'MATH' + str(len(formulas)) + 'END'
        if display:
            formulas[key] = '<div class="equation">\\[' + html.escape(tex.strip()) + '\\]</div>'
            return '\n\n' + key + '\n\n'
        formulas[key] = '<span class="math-inline">\\(' + html.escape(tex) + '\\)</span>'
        return key

    masked = re.sub(r'\$\$(.*?)\$\$', lambda m: math_token(m[1], True), masked, flags=re.S)
    masked = re.sub(r'(?<!\\)\$([^$\n]+?)(?<!\\)\$', lambda m: math_token(m[1], False), masked)
    for key, value in protected.items():
        masked = masked.replace(key, value)
    content = markdown.markdown(masked, extensions=['tables', 'fenced_code', 'toc'])
    for key, value in formulas.items():
        content = content.replace('<p>' + key + '</p>', value).replace(key, value)
    article = BeautifulSoup(content, 'html.parser')
    if len(article.find_all('h1')) != 1:
        raise ReportError('Report source must contain exactly one H1 title')
    if article.select('script, iframe, object, embed'):
        raise ReportError('Report Markdown must be authored content without executable embeds')
    for tag in article.find_all(True):
        if any(attr.lower().startswith('on') for attr in tag.attrs):
            raise ReportError('Report Markdown contains an event-handler attribute')
    return article, len(formulas)


def rebase_shell_links(element, shell_rel: str, output_rel: str):
    for tag in element.select('[href], [src]'):
        for attr in ('href', 'src'):
            if not tag.has_attr(attr):
                continue
            parts = urlsplit(tag[attr])
            if parts.scheme or parts.netloc or not parts.path or parts.path.startswith('/'):
                continue
            site_path = posixpath.normpath(posixpath.join(posixpath.dirname(shell_rel), parts.path))
            relative = posixpath.relpath(site_path, posixpath.dirname(output_rel) or '.')
            if parts.path.endswith('/'):
                relative += '/'
            tag[attr] = urlunsplit(('', '', relative, parts.query, parts.fragment))


def render(args, repo: Path):
    source_path = Path(args.source)
    source_path = source_path.resolve() if source_path.is_absolute() else (repo / source_path).resolve()
    if not source_path.is_file():
        raise ReportError('Missing Markdown source: ' + str(source_path))
    output = within_repo(repo, args.output)
    if output.suffix.lower() != '.html':
        raise ReportError('Output must be an .html file')
    if output.exists() and not args.overwrite:
        raise ReportError('Output exists; use --overwrite for an intended revision')
    date.fromisoformat(args.date)
    shell_path = within_repo(repo, args.shell)
    shell = BeautifulSoup(shell_path.read_text(encoding='utf-8'), 'html.parser')
    header = shell.find('header')
    footer = shell.find('footer')
    if header is None or footer is None:
        raise ReportError('Selected site shell needs an existing header and footer')
    article, formula_count = render_markdown(source_path.read_text(encoding='utf-8'))
    soup = BeautifulSoup('<!doctype html><html lang="zh-CN"><head></head><body></body></html>', 'html.parser')
    for attrs in ({'charset': 'utf-8'}, {'name': 'viewport', 'content': 'width=device-width, initial-scale=1'},
                  {'name': 'description', 'content': args.summary}):
        soup.head.append(soup.new_tag('meta', attrs=attrs))
    title = article.find('h1')
    page_title = soup.new_tag('title')
    page_title.string = title.get_text() + ' · Lighting Future'
    soup.head.append(page_title)
    relative_root = posixpath.relpath('.', posixpath.dirname(args.output) or '.')

    def asset(path):
        return posixpath.join(relative_root, path)

    css = within_repo(repo, 'assets/paper-report.css')
    digest = hashlib.sha256(css.read_bytes()).hexdigest()[:12]
    for href in (asset('style.css'), asset('assets/paper-report.css') + '?v=' + digest):
        soup.head.append(soup.new_tag('link', rel='stylesheet', href=href))
    if formula_count:
        config = soup.new_tag('script')
        config.string = r"""window.MathJax={tex:{inlineMath:[['\\(','\\)']],displayMath:[['\\[','\\]']],processEscapes:true},svg:{fontCache:'local'},options:{skipHtmlTags:['script','noscript','style','textarea','pre','code']}};"""
        soup.head.append(config)
        soup.head.append(soup.new_tag('script', src=asset('assets/vendor/mathjax/tex-svg-full.js'), defer=''))
    classes = ['category-page', 'paper-report']
    classes.extend(x for x in shell.body.get('class', []) if x.startswith('theme-'))
    soup.body['class'] = classes
    skip = soup.new_tag('a', attrs={'class': 'skip', 'href': '#main'})
    skip.string = '跳到正文'
    soup.body.append(skip)
    for component in (header, footer):
        rebase_shell_links(component, args.shell, args.output)
    soup.body.append(deepcopy(header))
    main = soup.new_tag('main', id='main', attrs={'class': 'report'})
    soup.body.append(main)
    breadcrumb = soup.new_tag('div', attrs={'class': 'breadcrumb'})
    for label, url in [(args.category_label, args.category_url), (args.section_label, args.section_url)]:
        if label and url:
            if breadcrumb.contents:
                slash = soup.new_tag('span'); slash.string = '/'; breadcrumb.append(slash)
            a = soup.new_tag('a', href=asset(url)); a.string = label; breadcrumb.append(a)
    main.append(breadcrumb)
    kicker = soup.new_tag('p', attrs={'class': 'kicker'})
    kicker.string = 'PAPER RESEARCH / ' + args.date
    main.append(kicker)
    title.extract(); main.append(title)
    first = article.find('p')
    if first and first.get_text(strip=True).startswith('日期：'):
        first.decompose()
    meta = soup.new_tag('p')
    labels = ' / '.join(x for x in (args.category_label, args.section_label) if x)
    meta.string = f'日期：{args.date}　｜　{labels}　｜　论文精读与方法分析'
    main.append(meta)
    headings = article.select('h2')
    if headings:
        toc = soup.new_tag('nav', attrs={'class': 'toc', 'aria-label': '文章目录'})
        toc_label = soup.new_tag('strong'); toc_label.string = '阅读导航'; toc.append(toc_label)
        for heading in headings:
            a = soup.new_tag('a', href='#' + heading['id']); a.string = heading.get_text(); toc.append(a)
        main.append(toc)
    for element in list(article.contents):
        main.append(element)
    soup.body.append(deepcopy(footer))
    soup.body.append(soup.new_tag('script', src=asset('theme-motion.js'), defer=''))
    content = str(soup)
    result = check_html(repo, output, content)
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(output.name + '.tmp')
    temporary.write_text(content, encoding='utf-8')
    temporary.replace(output)
    print(result)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parent.parent)
    sub = parser.add_subparsers(dest='command', required=True)
    command = sub.add_parser('render', help='Render an authored report without publishing it')
    command.add_argument('--source', required=True)
    command.add_argument('--output', required=True)
    command.add_argument('--date', required=True)
    command.add_argument('--shell', default='communication.html')
    command.add_argument('--category-label', required=True)
    command.add_argument('--category-url', required=True)
    command.add_argument('--section-label', default='')
    command.add_argument('--section-url', default='')
    command.add_argument('--summary', required=True)
    command.add_argument('--overwrite', action='store_true')
    command = sub.add_parser('check', help='Check local links, assets, anchors and figure metadata')
    command.add_argument('pages', nargs='+')
    args = parser.parse_args()
    repo = args.repo.resolve()
    try:
        if args.command == 'render':
            render(args, repo)
        else:
            for page in args.pages:
                print(check_html(repo, within_repo(repo, page)))
    except (ReportError, OSError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

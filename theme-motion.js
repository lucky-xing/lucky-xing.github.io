(() => {
  document.title = document.title.replaceAll('兴耀未来', 'Lighting Future');
  document.querySelectorAll('.brand').forEach(brand => {
    const mark = brand.querySelector('.mark');
    if (mark) mark.textContent = 'LF';
    [...brand.childNodes].forEach(node => {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.includes('兴耀未来')) {
        node.textContent = node.textContent.replaceAll('兴耀未来', 'Lighting Future');
      }
    });
  });
  document.querySelectorAll('.stage-caption strong').forEach(node => { node.textContent = 'Lighting Future'; });
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let paused = reduced.matches;
  try { paused = reduced.matches || localStorage.getItem('theme-motion-paused') === 'true'; } catch {}
  const buttons = document.querySelectorAll('.motion-toggle');
  function update() {
    document.documentElement.classList.toggle('motion-paused', paused);
    buttons.forEach(button => {
      button.setAttribute('aria-pressed', String(paused));
      button.textContent = paused ? '播放动效' : '暂停动效';
    });
  }
  buttons.forEach(button => button.addEventListener('click', () => {
    paused = !paused;
    try { localStorage.setItem('theme-motion-paused', String(paused)); } catch {}
    update();
  }));
  reduced.addEventListener('change', event => { if (event.matches) { paused = true; update(); } });
  update();
})();

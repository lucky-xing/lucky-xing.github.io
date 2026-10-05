(function () {
  const D = window.MEDICAL_ETF; if (!D) return;
  const NS = 'http://www.w3.org/2000/svg', colors = ['#9b92ff', '#71d1a5', '#65c8ff'];
  function el(tag, attrs, value) { const n = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v)); if (value !== undefined) n.textContent = value; return n; }
  function label(s, x, y, value, color = '#b9b8c9', attrs = {}) { s.appendChild(el('text', { x, y, fill: color, 'font-size': 11, ...attrs }, value)); }
  function surface(id, h) { const box = document.getElementById(id); if (!box) return; box.replaceChildren(); const w = Math.max(300, box.clientWidth); const s = el('svg', { viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': box.dataset.label }); box.appendChild(s); return { s, w, h }; }
  function lines(id, monthly) {
    const q = surface(id, 420); if (!q) return; const { s, w, h } = q;
    const datasets = [D.funds[0], D.funds[3]].map(f => ({ name: f.name + ' ' + f.code, data: monthly ? f.monthly : f.daily }));
    datasets.push({ name: '沪深300基准', data: monthly ? D.benchmarkMonthly : D.benchmark });
    const dates = datasets[0].data.map(d => d.date).filter(date => datasets.every(f => f.data.some(d => d.date === date)));
    const vals = datasets.map(f => { const m = new Map(f.data.map(d => [d.date, d.close])); return dates.map(date => m.get(date) / m.get(dates[0]) * 100); });
    const p = { l: 46, r: 15, t: 92, b: 58 }, lo = Math.floor(Math.min(...vals.flat()) / 10) * 10 - 5, hi = Math.ceil(Math.max(...vals.flat()) / 10) * 10 + 5;
    const x = i => p.l + i / (dates.length - 1) * (w - p.l - p.r), y = v => p.t + (hi - v) / (hi - lo) * (h - p.t - p.b);
    datasets.forEach((f, i) => { s.appendChild(el('line', { x1: p.l, x2: p.l + 23, y1: 20 + i * 21, y2: 20 + i * 21, stroke: colors[i], 'stroke-width': 3, ...(i === 2 ? { 'stroke-dasharray': '5 3' } : {}) })); label(s, p.l + 30, 24 + i * 21, f.name, colors[i]); });
    for (let i = 0; i < 5; i++) { const v = hi - (hi - lo) * i / 4; s.appendChild(el('line', { x1: p.l, x2: w - p.r, y1: y(v), y2: y(v), stroke: '#ffffff20' })); label(s, p.l - 7, y(v) + 4, v.toFixed(0), undefined, { 'text-anchor': 'end' }); }
    vals.forEach((a, j) => s.appendChild(el('path', { d: a.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' '), fill: 'none', stroke: colors[j], 'stroke-width': 2, ...(j === 2 ? { 'stroke-dasharray': '5 3' } : {}) })));
    const n = w < 500 ? 3 : w < 650 ? 4 : 6; for (let i = 0; i < n; i++) { const j = Math.round(i * (dates.length - 1) / (n - 1)); label(s, x(j), h - 32, monthly ? dates[j].slice(0, 7) : dates[j], undefined, { 'text-anchor': i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle', 'font-size': 10 }); }
    label(s, p.l, h - 9, `${dates[0]}=100；${monthly ? '月末' : '日'}复权收盘价，非净值收益`);
  }
  function liquidity() {
    const q = surface('etf-liquidity', 340); if (!q) return; const { s, w } = q, a = D.funds, max = Math.max(...a.map(f => f.stats.avgAmount20 / 1e6)), left = w < 500 ? 132 : 180, right = 76;
    label(s, 14, 22, '近20交易日日均成交额（百万元人民币）');
    a.forEach((f, i) => { const y = 62 + i * 51, v = f.stats.avgAmount20 / 1e6, size = v / max * (w - left - right); label(s, 12, y + 14, `${f.code} ${f.name.replace('ETF', '')}`, undefined, { 'font-size': 10 }); s.appendChild(el('rect', { x: left, y, width: Math.max(2, size), height: 21, fill: i === 3 ? colors[1] : colors[0] })); label(s, left + size + 7, y + 15, v.toFixed(2)); });
    label(s, 14, 300, `${a[0].daily.at(-20).date}—${D.asOf}；东方财富`, undefined, { 'font-size': 10 });
    label(s, 14, 322, '成交额≠申赎；另需核验盘口价差与深度', undefined, { 'font-size': 10 });
  }
  function flow() {
    const q = surface('etf-real-flow', 340); if (!q) return; const { s, w } = q;
    const a = [{ name: '159883 永赢', value: -23.22 }, { name: '159898 招商', value: -1.09 }], p = { l: 50, r: 15, t: 65, b: 58 }, zero = 86, scale = (340 - p.b - zero) / 25;
    label(s, 20, 22, '2026Q2净申赎份额（亿份）');
    s.appendChild(el('rect', { x: 20, y: 34, width: 14, height: 10, fill: '#f089a8' })); label(s, 41, 44, '粉色＝净赎回；申购－赎回，非金额', undefined, { 'font-size': 10 });
    [0, -5, -10, -15, -20, -25].forEach(v => { const y = zero - v * scale; s.appendChild(el('line', { x1: p.l, x2: w - p.r, y1: y, y2: y, stroke: '#ffffff20' })); label(s, p.l - 9, y + 4, String(v), undefined, { 'text-anchor': 'end' }); });
    a.forEach((f, i) => { const x = p.l + (i + .5) * (w - p.l - p.r) / 2; s.appendChild(el('rect', { x: x - 28, y: zero, width: 56, height: -f.value * scale, fill: '#f089a8' })); label(s, x, zero - f.value * scale + 17, f.value.toFixed(2), '#f089a8', { 'text-anchor': 'middle' }); label(s, x, 316, f.name, undefined, { 'text-anchor': 'middle' }); });
    label(s, 20, 337, '2026-04-01—06-30；来源：基金二季报', undefined, { 'font-size': 10 });
  }
  function render() { lines('etf-daily-comparison', false); lines('etf-monthly-comparison', true); liquidity(); flow(); }
  render(); let timer; addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(render, 120); });
})();

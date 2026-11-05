const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const cutoff = '2026-11-05';
const source = 'https://www.etf.run/index/CSI/931743';
const input = process.argv[2] || path.join(root, '.cache/robot/931743.html');
const html = fs.readFileSync(input, 'utf8');
// The public page embeds the historical observations in its escaped page payload.
const payload = html.replaceAll('\\"', '"');
const embedded = payload.match(/"compressedIndexDaily":\{[^}]*?"fieldNames":(\[[^\]]+\]),"values":(\[\[.*?\]\])/s);
assert(embedded, 'Index valuation history missing from the public page');
const fields = JSON.parse(embedded[1]);
const columns = ['date', 'equalWeightedPeTtm', 'equalWeightedPbTtm'].map(key => fields.indexOf(key));
assert(columns.every(index => index >= 0), 'Unexpected valuation fields');
const rows = JSON.parse(embedded[2])
  .map(row => columns.map(index => row[index]))
  .filter(([date]) => date <= cutoff);
assert.equal(rows.at(-1)[0], cutoff);
assert(rows.every(([date, pe, pb], i) =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) && (!i || date > rows[i-1][0]) &&
  Number.isFinite(pe) && pe > 0 && Number.isFinite(pb) && pb > 0));

function describe(sample, column) {
  const current = sample.at(-1)[column];
  const sorted = sample.map(row => row[column]).sort((a,b) => a-b);
  const quantile = p => sorted[Math.ceil(p * sorted.length)-1];
  return {
    current,
    percentile: 100 * sorted.filter(value => value <= current).length / sorted.length,
    levels: [.2, .5, .8].map(quantile)
  };
}
const windows = [
  ['近三年', rows.filter(([date]) => date >= '2023-11-05')],
  ['全部可得历史', rows]
].map(([label, sample]) => ({
  label, start: sample[0][0], end: sample.at(-1)[0], count: sample.length,
  pe: describe(sample, 1), pb: describe(sample, 2)
}));
const result = {source, cutoff, rows, windows};
fs.writeFileSync(path.join(root, 'finance/sectors/data/semiconductor-equipment-valuation-20261105.js'),
  'window.SEMICONDUCTOR_EQUIPMENT_VALUATION = '+JSON.stringify(result)+';\n');
console.log(JSON.stringify(windows, null, 2));

const fs = require('fs');
const files = [
    'posts/2026/03/17/attention-residuals.html',
    'posts/2026/03/17/context-compression-explicit-information-transmission.html',
    'posts/2026/03/18/transformer-improvement-comparison.html'
];

files.forEach(f => {
    const content = fs.readFileSync(f, 'utf-8');
    const matches = content.match(/<span class="math">([^<]+)<\/span>/g);
    console.log(f.split('/').pop() + ': ' + (matches ? matches.length : 0) + ' formulas');
    if (matches && matches.length > 0) {
        console.log('  First: ' + matches[0].substring(0, 50));
    }
});

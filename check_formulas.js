const fs = require('fs');
const content = fs.readFileSync('posts/2026/03/17/attention-residuals.html', 'utf-8');
const matches = content.match(/<span class="math">([^<]+)<\/span>/g);
if (matches) {
    console.log("Found", matches.length, "formulas");
    console.log("First formula:", matches[0]);
    console.log("Second formula:", matches[1]);
} else {
    console.log("No formulas found");
}

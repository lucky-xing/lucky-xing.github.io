const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const files = [
    {
        commit: '90dac72',
        output: 'posts/2026/03/17/attention-residuals.html',
        url: 'posts/2026/03/17/attention-residuals.html'
    },
    {
        commit: '8f5df91', 
        output: 'posts/2026/03/17/context-compression-explicit-information-transmission.html',
        url: 'posts/2026/03/17/context-compression-explicit-information-transmission.html'
    },
    {
        commit: '6f57e56',
        output: 'posts/2026/03/18/transformer-improvement-comparison.html', 
        url: 'posts/2026/03/18/transformer-improvement-comparison.html'
    }
];

for (const file of files) {
    console.log(`Processing ${file.output}...`);
    try {
        const content = execSync(`git show ${file.commit}:${file.url}`, { 
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        fs.writeFileSync(file.output, content, 'utf-8');
        console.log(`  Saved to ${file.output}`);
        
        // Check formulas
        const matches = content.match(/<span class="math">([^<]+)<\/span>/g);
        console.log(`  Found ${matches ? matches.length : 0} formulas`);
        if (matches && matches.length > 0) {
            console.log(`  First formula: ${matches[0].substring(0, 60)}...`);
        }
    } catch (e) {
        console.error(`  Error: ${e.message}`);
    }
}

console.log("Done!");

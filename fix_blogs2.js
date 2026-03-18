const { execSync } = require('child_process');
const fs = require('fs');

// Get content using git show with proper UTF-8
const commits = [
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

// Set environment to use UTF-8
process.env.LANG = 'en_US.UTF-8';

for (const file of commits) {
    console.log(`Processing ${file.output}...`);
    try {
        // Use Buffer to handle UTF-8 properly  
        const buffer = execSync(`git show ${file.commit}:${file.url}`, { encoding: null });
        const content = Buffer.from(buffer).toString('utf-8');
        
        // Check formulas before saving
        const matches = content.match(/<span class="math">([^<]+)<\/span>/g);
        console.log(`  Found ${matches ? matches.length : 0} formulas`);
        if (matches && matches.length > 0) {
            console.log(`  First: ${matches[0].substring(0, 50)}`);
        }
        
        fs.writeFileSync(file.output, content, 'utf-8');
        console.log(`  Saved to ${file.output}`);
    } catch (e) {
        console.error(`  Error: ${e.message}`);
    }
}

console.log("Done!");

import subprocess
import sys

# Git show command
cmd = ['git', 'show', '90dac72:posts/2026/03/17/attention-residuals.html']
result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8')

# Write to file with proper encoding
with open('posts/2026/03/17/attention-residuals.html', 'w', encoding='utf-8') as f:
    f.write(result.stdout)

print("Done!")
print("First 500 chars:", result.stdout[:500])

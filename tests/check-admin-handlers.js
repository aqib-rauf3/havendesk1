import fs from 'node:fs';

const code = fs.readFileSync('C:/Users/LENOVO/.gemini/antigravity/scratch/ai-receptionist/admin-console/admin.js', 'utf8');
const regex = /onclick\s*=\s*['"]([a-zA-Z0-9_]+)\s*\(/g;
let match;
const fns = new Set();
while ((match = regex.exec(code)) !== null) {
  fns.add(match[1]);
}

console.log(`Found ${fns.size} unique onclick function calls in admin.js:`);
let missingCount = 0;
for (const fn of Array.from(fns).sort()) {
  const onWindow = code.includes(`window.${fn} `) || code.includes(`window.${fn}=`);
  const isFunction = code.includes(`function ${fn}`);
  const status = onWindow ? '✓ Attached to window' : (isFunction ? '⚠️ Only top-level function' : '❌ MISSING');
  console.log(`  - ${fn.padEnd(30)}: ${status}`);
  if (!onWindow && !isFunction) {
    missingCount++;
  }
}

if (missingCount > 0) {
  console.error(`\nFound ${missingCount} missing handlers!`);
  process.exit(1);
} else {
  console.log('\nAll admin onclick handlers exist or are functions!');
}

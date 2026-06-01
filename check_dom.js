const fs = require('fs');
const path = require('path');

const filePath = path.join('C:\\Users\\harsh\\.gemini\\antigravity-ide\\brain\\1670288a-b3ca-4567-9de8-5a41d2a9e509', 'dom_workspaces.html');
const html = fs.readFileSync(filePath, 'utf8');

// Find all div elements with styling or class
// Let's use regex to find elements with style attributes or classes that might be overlays
const divRegex = /<div[^>]*>/gi;
let match;
const divs = [];

while ((match = divRegex.exec(html)) !== null) {
  const tag = match[0];
  if (tag.includes('position: absolute') || tag.includes('position: fixed') || tag.includes('z-index') || tag.includes('pointer-events')) {
    divs.push(tag);
  }
}

console.log(`Found ${divs.length} absolutely positioned or z-indexed divs:`);
divs.forEach((d, i) => {
  console.log(`${i + 1}: ${d}`);
});

// Let's look for any aria-label or identifiers in the HTML
const backdropMatches = html.match(/<div[^>]*backdrop[^>]*>/gi);
console.log('Backdrop matches:', backdropMatches);

const portalMatches = html.match(/<div[^>]*portal[^>]*>/gi);
console.log('Portal matches:', portalMatches);

const pointerEventsNoneMatches = html.match(/pointer-events:\s*none/gi);
console.log('Pointer events none count:', pointerEventsNoneMatches ? pointerEventsNoneMatches.length : 0);

const pointerEventsAutoMatches = html.match(/pointer-events:\s*auto/gi);
console.log('Pointer events auto count:', pointerEventsAutoMatches ? pointerEventsAutoMatches.length : 0);

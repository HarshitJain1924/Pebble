const fs = require('fs');
const path = require('path');

const filePath = path.join('C:\\Users\\harsh\\.gemini\\antigravity-ide\\brain\\1670288a-b3ca-4567-9de8-5a41d2a9e509', 'dom_after_add_click.html');
const html = fs.readFileSync(filePath, 'utf8');

// Search for any dialogs, modals, or "Task Name" input
const taskNameMatches = html.includes('Task Name');
console.log('Contains "Task Name" text input placeholder:', taskNameMatches);

const cancelMatches = html.includes('Cancel');
console.log('Contains "Cancel" button text:', cancelMatches);

const saveMatches = html.includes('Save');
console.log('Contains "Save" button text:', saveMatches);

// Let's find any absolute divs that were added after clicking Add Task
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

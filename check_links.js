const fs = require('fs');
const path = require('path');

const filePath = path.join('C:\\Users\\harsh\\.gemini\\antigravity-ide\\brain\\1670288a-b3ca-4567-9de8-5a41d2a9e509', 'dom_tab.html');
const html = fs.readFileSync(filePath, 'utf8');

// Find all elements with href, role="link", or roles
const linkRegex = /<a[^>]*>|<button[^>]*>|<div[^>]*role="[^"]*"[^>]*>/gi;
let match;
const links = [];

while ((match = linkRegex.exec(html)) !== null) {
  links.push(match[0]);
}

console.log(`Found ${links.length} potential interactive elements:`);
links.forEach((l, i) => {
  console.log(`${i + 1}: ${l}`);
});

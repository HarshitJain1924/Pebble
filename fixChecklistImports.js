const fs = require('fs');
let content = fs.readFileSync('services/command/handlers/ChecklistCommandHandler.ts', 'utf8');
content = content.replace(/"\.\/handlers\//g, '"./');
content = content.replace(/import { ChecklistCommandHandler } from "[^"]+";\n?/g, '');
fs.writeFileSync('services/command/handlers/ChecklistCommandHandler.ts', content);

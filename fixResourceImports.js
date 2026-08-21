const fs = require('fs');
let content = fs.readFileSync('services/command/handlers/ResourceCommandHandler.ts', 'utf8');
content = content.replace(/"\.\/handlers\//g, '"./');
content = content.replace(/import { ResourceCommandHandler } from "[^"]+";\n?/g, '');
fs.writeFileSync('services/command/handlers/ResourceCommandHandler.ts', content);

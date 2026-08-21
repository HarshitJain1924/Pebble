const fs = require('fs');
let content = fs.readFileSync('services/command/handlers/SystemCommandHandler.ts', 'utf8');
content = content.replace(/"\.\/handlers\//g, '"./');
content = content.replace(/import { SystemCommandHandler } from "[^"]+";\n?/g, '');
fs.writeFileSync('services/command/handlers/SystemCommandHandler.ts', content);

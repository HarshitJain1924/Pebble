const fs = require('fs');
let content = fs.readFileSync('services/command/handlers/HabitCommandHandler.ts', 'utf8');
content = content.replace(/import { HabitCommandHandler } from "[^"]+";\n?/g, '');
fs.writeFileSync('services/command/handlers/HabitCommandHandler.ts', content);

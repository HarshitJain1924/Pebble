const fs = require('fs');
const content = fs.readFileSync('services/command/EntityCommandService.ts', 'utf8');

const lines = content.split('\n');
let imports = '';
for (let i = 0; i < lines.length; i++) {
  if (lines[i].startsWith('/**') || lines[i].includes('export interface CreateEntityOptions')) {
    break;
  }
  imports += lines[i] + '\n';
}

imports += 'import { CreateEntityOptions, isParsedProductivityItem, scheduleCreationNotifications, scheduleTaskNotifications, scheduleHabitNotifications, restoreEntityFromBin } from "../EntityCommandService";\n\n';

const handlerBody = fs.readFileSync('services/command/handlers/SystemCommandHandlerBody.ts', 'utf8');

const finalCode = imports + 'export class SystemCommandHandler {\n' + handlerBody + '\n}\n';

fs.writeFileSync('services/command/handlers/SystemCommandHandler.ts', finalCode);
fs.unlinkSync('services/command/handlers/SystemCommandHandlerBody.ts');
console.log('Created SystemCommandHandler.ts');

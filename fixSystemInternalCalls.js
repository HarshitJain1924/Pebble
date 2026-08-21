const fs = require('fs');

let content = fs.readFileSync('services/command/handlers/SystemCommandHandler.ts', 'utf8');

content = content.replace(/this\.createTask/g, 'TaskCommandHandler.createTask');
content = content.replace(/this\.permanentlyDeleteTask/g, 'TaskCommandHandler.permanentlyDeleteTask');
content = content.replace(/this\.createHabit/g, 'HabitCommandHandler.createHabit');
content = content.replace(/this\.permanentlyDeleteHabit/g, 'HabitCommandHandler.permanentlyDeleteHabit');
content = content.replace(/this\.recordFocusSession/g, 'SystemCommandHandler.recordFocusSession');
content = content.replace(/this\.logSystemEvent/g, 'SystemCommandHandler.logSystemEvent');
content = content.replace(/this\./g, 'EntityCommandService.');

// Add imports
const importsToAdd = `import { TaskCommandHandler } from "./TaskCommandHandler";
import { HabitCommandHandler } from "./HabitCommandHandler";
import { EntityCommandService } from "../EntityCommandService";
`;

content = importsToAdd + '\n' + content;

fs.writeFileSync('services/command/handlers/SystemCommandHandler.ts', content);

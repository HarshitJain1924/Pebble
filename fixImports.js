const fs = require('fs');
const path = require('path');

const handlersDir = 'services/command/handlers';
const files = fs.readdirSync(handlersDir).filter(f => f.endsWith('.ts'));

for (const file of files) {
  const filePath = path.join(handlersDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Replace imports from EntityCommandService
  content = content.replace(
    /import\s+\{([^}]*)\}\s+from\s+["']\.\.\/EntityCommandService["'];?/g,
    (match, imports) => {
      const items = imports.split(',').map(i => i.trim()).filter(i => i);
      const types = [];
      const notifications = [];
      const recovery = [];
      const ecs = [];

      for (const item of items) {
        if (['CreateEntityOptions', 'isParsedProductivityItem'].includes(item)) {
          types.push(item);
        } else if (['scheduleCreationNotifications', 'scheduleTaskNotifications', 'scheduleHabitNotifications'].includes(item)) {
          notifications.push(item);
        } else if (item === 'restoreEntityFromBin') {
          recovery.push(item);
        } else {
          ecs.push(item);
        }
      }

      let newImports = '';
      if (types.length > 0) newImports += `import { ${types.join(', ')} } from "../types/command.types";\n`;
      if (notifications.length > 0) newImports += `import { ${notifications.join(', ')} } from "../shared/command-notifications";\n`;
      if (recovery.length > 0) newImports += `import { ${recovery.join(', ')} } from "../shared/command-recovery";\n`;
      if (ecs.length > 0) newImports += `import { ${ecs.join(', ')} } from "../EntityCommandService";\n`;
      return newImports.trim();
    }
  );

  fs.writeFileSync(filePath, content);
}
console.log('Fixed imports in all handlers.');

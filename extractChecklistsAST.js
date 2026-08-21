const ts = require('typescript');
const fs = require('fs');

const checklistMethods = [
  'createChecklist',
  'mergeChecklistItems',
  'toggleChecklistItem',
  'addChecklistItem',
  'deleteChecklistItem',
  'recycleChecklist',
  'permanentlyDeleteChecklist',
  'restoreChecklist',
  'updateChecklist',
  'moveChecklist'
];

const sourceCode = fs.readFileSync('services/command/EntityCommandService.ts', 'utf8');
const sourceFile = ts.createSourceFile(
  'EntityCommandService.ts',
  sourceCode,
  ts.ScriptTarget.Latest,
  true
);

let handlerMethodsCode = '';
let modifiedSourceCode = sourceCode;

const replacements = [];

function visit(node) {
  if (ts.isClassDeclaration(node) && node.name && node.name.text === 'EntityCommandService') {
    for (const member of node.members) {
      if (ts.isMethodDeclaration(member) && member.name) {
        const methodName = member.name.text;
        if (checklistMethods.includes(methodName)) {
          
          let methodStart = member.getStart();
          const jsDocs = ts.getJSDocTags(member);
          if (member.jsDoc && member.jsDoc.length > 0) {
            methodStart = member.jsDoc[0].getStart();
          }
          
          const methodEnd = member.getEnd();
          const originalMethodText = sourceCode.substring(methodStart, methodEnd);
          
          const blockStart = member.body ? member.body.getStart() : methodEnd;
          
          const params = member.parameters.map(p => {
             const name = p.name.getText();
             if (p.dotDotDotToken) {
               return '...' + name;
             }
             return name;
          }).join(', ');
          
          const delegationBody = '{\n    return ChecklistCommandHandler.' + methodName + '(' + params + ');\n  }';
          const newMethodText = sourceCode.substring(methodStart, blockStart) + delegationBody;
          
          replacements.push({
            start: methodStart,
            end: methodEnd,
            text: newMethodText
          });
          
          handlerMethodsCode = originalMethodText + '\n\n' + handlerMethodsCode;
        }
      }
    }
  }
  ts.forEachChild(node, visit);
}

visit(sourceFile);

replacements.sort((a, b) => b.start - a.start);

for (const r of replacements) {
  modifiedSourceCode = modifiedSourceCode.substring(0, r.start) + r.text + modifiedSourceCode.substring(r.end);
}

if (!modifiedSourceCode.includes('import { ChecklistCommandHandler }')) {
  const lastImportIndex = modifiedSourceCode.lastIndexOf('import ');
  const endOfLastImport = modifiedSourceCode.indexOf('\n', modifiedSourceCode.indexOf(';', lastImportIndex) !== -1 ? modifiedSourceCode.indexOf(';', lastImportIndex) : modifiedSourceCode.indexOf('\n', lastImportIndex));
  modifiedSourceCode = modifiedSourceCode.substring(0, endOfLastImport + 1) + 
                       'import { ChecklistCommandHandler } from "./handlers/ChecklistCommandHandler";\n' + 
                       modifiedSourceCode.substring(endOfLastImport + 1);
}

fs.mkdirSync('services/command/handlers', { recursive: true });
fs.writeFileSync('services/command/handlers/ChecklistCommandHandlerBody.ts', handlerMethodsCode);
fs.writeFileSync('services/command/EntityCommandService.ts', modifiedSourceCode);

console.log('Successfully extracted ' + replacements.length + ' methods.');

const fs = require('fs');
const path = require('path');

function replaceTextInputImports(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            replaceTextInputImports(fullPath);
        } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
            // skip the custom component file
            if (fullPath.includes('AppText.tsx')) continue;

            let content = fs.readFileSync(fullPath, 'utf8');
            let modified = false;

            if (content.includes('from "react-native"') || content.includes("from 'react-native'")) {
                content = content.replace(/import\s+{([^}]*?)}\s+from\s+['"]react-native['"];?/g, (match, p1) => {
                    if (/\bTextInput\b/.test(p1)) {
                        modified = true;
                        const withoutText = p1.replace(/\bTextInput\b,?/g, '').trim().replace(/,\s*$/, '');
                        let newImport = '';
                        if (withoutText) {
                            newImport += `import { ${withoutText} } from "react-native";\n`;
                        }
                        newImport += `import { AppTextInput as TextInput } from "@/components/ui/AppText";`;
                        return newImport;
                    }
                    return match;
                });

                if (modified) {
                    fs.writeFileSync(fullPath, content);
                    console.log('Modified TextInput:', fullPath);
                }
            }
        }
    }
}

replaceTextInputImports(path.join(__dirname, 'app'));
replaceTextInputImports(path.join(__dirname, 'components'));

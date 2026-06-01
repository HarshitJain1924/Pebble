const fs = require('fs');
const path = require('path');

function replaceTextImports(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            replaceTextImports(fullPath);
        } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let modified = false;

            // Simple regex to add fontFamily: 'Outfit_400Regular' to all style objects? No, that's dangerous.
            // Better: Let's find every <Text ...> and change it to <Text style={[{fontFamily: 'Outfit_400Regular'}, props.style]} ...>
            // Actually, replacing imports is safer.

            // Wait, we can just replace `<Text` with `<Text style={[{fontFamily: 'Outfit_400Regular'}, StyleSheet.flatten(style)]}` but that's messy.

            // Let's replace the import!
            // If the file imports Text from react-native, remove it and add `import { AppText as Text } from "@/components/ui/AppText";`
            if (content.includes('from "react-native"') || content.includes("from 'react-native'")) {
                const importRegex = /import\s+{[^}]*?\bText\b[^}]*?}\s+from\s+['"]react-native['"];?/g;
                
                content = content.replace(/import\s+{([^}]*?)}\s+from\s+['"]react-native['"];?/g, (match, p1) => {
                    if (/\bText\b/.test(p1)) {
                        modified = true;
                        const withoutText = p1.replace(/\bText\b,?/g, '').trim().replace(/,\s*$/, '');
                        let newImport = '';
                        if (withoutText) {
                            newImport += `import { ${withoutText} } from "react-native";\n`;
                        }
                        newImport += `import { AppText as Text } from "@/components/ui/AppText";`;
                        return newImport;
                    }
                    return match;
                });

                if (modified) {
                    fs.writeFileSync(fullPath, content);
                    console.log('Modified:', fullPath);
                }
            }
        }
    }
}

replaceTextImports(path.join(__dirname, 'app'));
replaceTextImports(path.join(__dirname, 'components'));

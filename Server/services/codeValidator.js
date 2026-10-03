// Post-generation code validator and auto-fixer
// Repairs common AI code generation errors before saving to DB using regex checks

// Void HTML elements that must be self-closed in JSX
const VOID_ELEMENTS = ["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"];
const MISSING_IMAGE_PLACEHOLDER = "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22120%22%20height%3D%2280%22%20viewBox%3D%220%200%20120%2080%22%3E%3Crect%20width%3D%22120%22%20height%3D%2280%22%20rx%3D%2212%22%20fill%3D%22%23e2e8f0%22%2F%3E%3Cpath%20d%3D%22M25%2055l18-20%2013%2014%209-10%2030%2016H25z%22%20fill%3D%22%2394a3b8%22%2F%3E%3Ccircle%20cx%3D%2243%22%20cy%3D%2228%22%20r%3D%226%22%20fill%3D%22%23cbd5e1%22%2F%3E%3C%2Fsvg%3E";

// Validate and auto-fix common AI-generated code issues
export function validateAndFixCode(code, filePath, context) {
    const warnings = [];
    const isCSS = filePath.endsWith(".css");
    const isJS = filePath.endsWith(".js") || filePath.endsWith(".jsx");

    // Whitespace before a markdown fence is harmless but prevents the anchored
    // fence matcher below from removing it.
    code = code.trim();

    // 1. Strip markdown code fences that some models wrap around code
    const fencePattern = /^```(?:jsx?|javascript|css|html|tsx?|react)?\s*\n([\s\S]*?)\n```\s*$/;
    const fenceMatch = code.match(fencePattern);
    if (fenceMatch) {
        code = fenceMatch[1];
        warnings.push(`${filePath}: Stripped markdown code fences`);
    }

    // Also handle cases where fences appear at the very start/end with other content
    code = code.replace(/^```(?:jsx?|javascript|css|html|tsx?|react)?\s*\n/, "");
    code = code.replace(/\n```\s*$/, "");

    if (isCSS) {
        const hiddenSectionRule = /\s*section\s*\{\s*opacity\s*:\s*0\s*;\s*\}/gi;
        if (hiddenSectionRule.test(code)) {
            code = code.replace(hiddenSectionRule, "\n");
            warnings.push(filePath + ": Removed global hidden section rule");
        }

        // CSS-specific fixes — minimal, just trim and return
        return { code: code.trim() + "\n", warnings };
    }

    if (!isJS) {
        return { code, warnings };
    }

    // --- JS/JSX-specific fixes ---

    // Some model responses replace the closing quote of a JSX string
    // attribute with a backslash followed by a closing brace. That leaves JSX
    // parsing inside a string and produces the Unicode escape parse error.
    // Only repair this sequence inside an opening JSX tag, immediately before
    // the tag closes or another attribute begins.
    const escapedJsxAttributeQuoteRegex = /(<[A-Za-z][^>\n]*?\b[\w:-]+\s*=\s*)\\"/g;
    if (escapedJsxAttributeQuoteRegex.test(code)) {
        code = code.replace(escapedJsxAttributeQuoteRegex, "$1\"");
        warnings.push(filePath + ": Repaired escaped JSX attribute quote");
    }

    const escapedJsxClosingAttributeQuoteRegex = /(<[A-Za-z][^>\n]*?\b[\w:-]+\s*=\s*"[^"\n]*)\\"(?=\s*(?:\/?>|[\w:-]+\s*=))/g;
    if (escapedJsxClosingAttributeQuoteRegex.test(code)) {
        code = code.replace(escapedJsxClosingAttributeQuoteRegex, "$1\"");
        warnings.push(filePath + ": Repaired escaped JSX attribute closing quote");
    }

    const malformedTemplateAttributeRegex = /(<[A-Za-z][^>\n]*?\b[\w:-]+\s*=\s*\{[\x60][^>\n]*?)"\s*\}/g;
    if (malformedTemplateAttributeRegex.test(code)) {
        code = code.replace(malformedTemplateAttributeRegex, "$1\x60}");
        warnings.push(filePath + ": Repaired malformed JSX template attribute");
    }
    const malformedJsxAttributeRegex = /(<[A-Za-z][^>\n]*?)\\}(?=\s*(?:\/?>|[\w:-]+\s*=))/g;
    if (malformedJsxAttributeRegex.test(code)) {
        code = code.replace(malformedJsxAttributeRegex, "$1\"");
        warnings.push(filePath + ": Repaired malformed JSX attribute quote");
    }
    const malformedJsxTagCloseRegex = /(<[A-Za-z][^>\n]*?)\\>(?=\s*(?:\{|\/?>|[\w:-]+\s*=))/g;
    if (malformedJsxTagCloseRegex.test(code)) {
        code = code.replace(malformedJsxTagCloseRegex, "$1\">");
        warnings.push(filePath + ": Repaired malformed JSX tag close");
    }
    // 2. Fix `class=` → `className=` in JSX (but not inside strings or comments)
    // Match class= that appears inside JSX tags (after < and before >)
    const classFixRegex = /(<[a-zA-Z][^>]*?)\bclass=/g;
    if (classFixRegex.test(code)) {
        code = code.replace(/(<[a-zA-Z][^>]*?)\bclass=/g, "$1className=");
        warnings.push(`${filePath}: Fixed 'class=' → 'className='`);
    }

    // 3. Fix `for=` → `htmlFor=` in JSX labels
    const forFixRegex = /(<label[^>]*?)\bfor=/gi;
    if (forFixRegex.test(code)) {
        code = code.replace(/(<label[^>]*?)\bfor=/gi, "$1htmlFor=");
        warnings.push(`${filePath}: Fixed 'for=' → 'htmlFor='`);
    }

    // 4. Self-close void elements that aren't self-closed
    for (const tag of VOID_ELEMENTS) {
        // Match <tag ... > that is NOT already self-closed (no / before >)
        const voidRegex = new RegExp(`<${tag}(\\s[^>]*?)?(?<!/)>`, "gi");
        if (voidRegex.test(code)) {
            code = code.replace(new RegExp(`<${tag}(\\s[^>]*?)?(?<!/)>`, "gi"), (match, attrs) => `<${tag}${attrs || ""} />`);
            warnings.push(`${filePath}: Self-closed <${tag}> elements`);
        }
    }

    // 5. Ensure exactly one default export exists
    const defaultExportCount = (code.match(/export\s+default\s+/g) || []).length;
    if (defaultExportCount === 0 && !filePath.endsWith(".css")) {
        // Try to find the main function/component and add default export
        const funcMatch = code.match(/^function\s+([A-Z]\w*)\s*\(/m);
        const constMatch = code.match(/^const\s+([A-Z]\w*)\s*=\s*(?:\(|function)/m);
        const componentName = funcMatch?.[1] || constMatch?.[1];

        if (componentName) {
            // Check if there's already a named export
            const namedExportRegex = new RegExp(`export\\s+(function|const)\\s+${componentName}`);
            if (namedExportRegex.test(code)) {
                // Convert `export function X` → `export default function X`
                code = code.replace(new RegExp(`export\\s+(function|const)\\s+${componentName}`), `export default $1 ${componentName}`);
            } else {
                // Add default export at the end
                code = code.trimEnd() + `\n\nexport default ${componentName};\n`;
            }
            warnings.push(`${filePath}: Added missing default export for '${componentName}'`);
        }
    }

    // 6. Remove stray HTML comments inside JSX return blocks
    // Pattern: <!-- comment --> which is invalid in JSX
    const htmlCommentRegex = /<!--[\s\S]*?-->/g;
    if (htmlCommentRegex.test(code)) {
        code = code.replace(htmlCommentRegex, "");
        warnings.push(`${filePath}: Removed HTML comments (invalid in JSX)`);
    }

    // 7. Fix common TypeScript syntax that slips in
    // Remove `: React.FC` or `: FC` type annotations from function declarations
    code = code.replace(/:\s*React\.FC(?:<[^>]*>)?\s*=/g, (match) => {
        warnings.push(`${filePath}: Removed TypeScript React.FC annotation`);
        return " =";
    });

    // Remove simple type annotations from function parameters like (props: any)
    // But be careful not to break destructured defaults like { name = 'default' }
    code = code.replace(/(\([^)]*?)\s*:\s*(?:string|number|boolean|any|object|void)\s*([,)])/g, (match, before, after) => {
        warnings.push(`${filePath}: Removed TypeScript type annotation`);
        return `${before}${after}`;
    });

    // 8. Ensure React import exists if JSX is used
    const hasJSX = /<[A-Za-z]/.test(code);
    const hasReactImport = /import\s+React/.test(code);
    if (hasJSX && !hasReactImport) {
        code = `import React from 'react';\n${code}`;
        warnings.push(`${filePath}: Added missing React import`);
    }

    // 9. Fix import paths that point to incorrect folders/paths compared to what was planned
    if (context?.allPlannedFiles) {
        const fixResult = fixImportPaths(code, filePath, context.allPlannedFiles);
        code = fixResult.code;
        warnings.push(...fixResult.warnings);

        const plannedPaths = new Set(context.allPlannedFiles.map((file) => {
            const path = typeof file === "string" ? file : file?.path;
            return path?.startsWith("/") ? path : "/" + path;
        }).filter(Boolean));
        const missingImageRegex = /(\bsrc\s*=\s*)(["'])(\/(?:[^"']+\.(?:png|jpe?g|gif|svg|webp|avif)))\2/gi;
        code = code.replace(missingImageRegex, (match, prefix, quote, assetPath) => {
            if (plannedPaths.has(assetPath)) return match;
            warnings.push(filePath + ": Replaced unplanned local image '" + assetPath + "' with a preview-safe placeholder");
            return prefix + quote + MISSING_IMAGE_PLACEHOLDER + quote;
        });
    }

    return { code: code.trim() + "\n", warnings };
}

// Validate and fix code specifically for revision operations
export function validateRevisionContent(content, filePath, op) {
    if (op === "delete") return { content, warnings: [] };

    if (op === "create") {
        const result = validateAndFixCode(content, filePath);
        return { content: result.code, warnings: result.warnings };
    }

    // For update ops (search/replace content), only apply safe fixes
    // that won't break the partial context
    const warnings = [];
    const malformedJsxAttributeRegex = /(<[A-Za-z][^>\n]*?)\\}(?=\s*(?:\/?>|[\w:-]+\s*=))/g;
    const escapedJsxAttributeQuoteRegex = /(<[A-Za-z][^>\n]*?\b[\w:-]+\s*=\s*)\\"/g;
    if (escapedJsxAttributeQuoteRegex.test(content)) {
        content = content.replace(escapedJsxAttributeQuoteRegex, "$1\"");
        warnings.push(filePath + ": Repaired escaped JSX attribute quote in replacement");
    }
    const escapedJsxClosingAttributeQuoteRegex = /(<[A-Za-z][^>\n]*?\b[\w:-]+\s*=\s*"[^"\n]*)\\"(?=\s*(?:\/?>|[\w:-]+\s*=))/g;
    if (escapedJsxClosingAttributeQuoteRegex.test(content)) {
        content = content.replace(escapedJsxClosingAttributeQuoteRegex, "$1\"");
        warnings.push(filePath + ": Repaired escaped JSX attribute closing quote in replacement");
    }
    const malformedTemplateAttributeRegex = /(<[A-Za-z][^>\n]*?\b[\w:-]+\s*=\s*\{[\x60][^>\n]*?)"\s*\}/g;
    if (malformedTemplateAttributeRegex.test(content)) {
        content = content.replace(malformedTemplateAttributeRegex, "$1\x60}");
        warnings.push(filePath + ": Repaired malformed JSX template attribute in replacement");
    }
    if (malformedJsxAttributeRegex.test(content)) {
        content = content.replace(malformedJsxAttributeRegex, "$1\"");
        warnings.push(filePath + ": Repaired malformed JSX attribute quote in replacement");
    }
    const malformedJsxTagCloseRegex = /(<[A-Za-z][^>\n]*?)\\>(?=\s*(?:\{|\/?>|[\w:-]+\s*=))/g;
    if (malformedJsxTagCloseRegex.test(content)) {
        content = content.replace(malformedJsxTagCloseRegex, "$1\">");
        warnings.push(filePath + ": Repaired malformed JSX tag close in replacement");
    }

    // Fix class → className
    const classFixRegex = /(<[a-zA-Z][^>]*?)\bclass=/g;
    if (classFixRegex.test(content)) {
        content = content.replace(/(<[a-zA-Z][^>]*?)\bclass=/g, "$1className=");
        warnings.push(`${filePath}: Fixed 'class=' → 'className=' in replacement`);
    }

    // Fix for → htmlFor
    const forFixRegex = /(<label[^>]*?)\bfor=/gi;
    if (forFixRegex.test(content)) {
        content = content.replace(/(<label[^>]*?)\bfor=/gi, "$1htmlFor=");
        warnings.push(`${filePath}: Fixed 'for=' → 'htmlFor=' in replacement`);
    }

    // Self-close void elements
    for (const tag of VOID_ELEMENTS) {
        const voidRegex = new RegExp(`<${tag}(\\s[^>]*?)?(?<!/)>`, "gi");
        if (voidRegex.test(content)) {
            content = content.replace(new RegExp(`<${tag}(\\s[^>]*?)?(?<!/)>`, "gi"), (match, attrs) => `<${tag}${attrs || ""} />`);
            warnings.push(`${filePath}: Self-closed <${tag}> in replacement`);
        }
    }

    return { content, warnings };
}

// --- Import Path Resolution Helpers ---

function getDir(p) {
    const parts = p.split("/");
    parts.pop();
    return parts.join("/") || "/";
}

function resolvePath(baseDir, relativePath) {
    const baseParts = baseDir.split("/").filter(Boolean);
    const relParts = relativePath.split("/").filter(Boolean);

    for (const part of relParts) {
        if (part === ".") {
            continue;
        } else if (part === "..") {
            baseParts.pop();
        } else {
            baseParts.push(part);
        }
    }
    return "/" + baseParts.join("/");
}

function getRelativePath(fromDir, toPath) {
    const fromParts = fromDir.split("/").filter(Boolean);
    const toParts = toPath.split("/").filter(Boolean);

    let commonLength = 0;
    while (commonLength < fromParts.length && commonLength < toParts.length && fromParts[commonLength] === toParts[commonLength]) {
        commonLength++;
    }

    const upCount = fromParts.length - commonLength;
    const remainingTo = toParts.slice(commonLength);

    const relParts = [];
    for (let i = 0; i < upCount; i++) {
        relParts.push("..");
    }
    if (relParts.length === 0) {
        relParts.push(".");
    }
    relParts.push(...remainingTo);
    return relParts.join("/");
}

function cleanExtension(p) {
    return p.replace(/\.(js|jsx|css|ts|tsx)$/, "");
}

function fixImportPaths(code, filePath, allPlannedFiles) {
    const warnings = [];
    if (!allPlannedFiles || allPlannedFiles.length === 0) {
        return { code, warnings };
    }

    const currentDir = getDir(filePath);
    const plannedPaths = allPlannedFiles.map((f) => (f.path.startsWith("/") ? f.path : "/" + f.path));

    // Matches lines like: import Header from './components/Header';
    // or import '../styles.css'; or require('./components/Header')
    const importRegex = /(from\s+['"]|import\s+['"])([^'"]+)(['"])/g;

    const newCode = code.replace(importRegex, (match, prefix, importTarget, suffix) => {
        // Skip absolute imports (non-relative packages like 'react')
        if (!importTarget.startsWith(".")) {
            return match;
        }

        // 1. Resolve relative import target path
        const resolvedTarget = resolvePath(currentDir, importTarget);
        const resolvedClean = cleanExtension(resolvedTarget);

        // Check if it already matches a planned file path exactly (with or without extension)
        const exactExists = plannedPaths.some((p) => cleanExtension(p) === resolvedClean);
        if (exactExists) {
            return match;
        }

        // 2. Mismatch! Try to find a planned file with the same filename
        const importFilename = resolvedClean.split("/").pop();
        if (!importFilename) {
            return match;
        }

        const foundPlannedPath = plannedPaths.find((p) => {
            const plannedClean = cleanExtension(p);
            const plannedFilename = plannedClean.split("/").pop();
            return plannedFilename === importFilename;
        });

        if (foundPlannedPath) {
            // Calculate relative path from current directory to actual planned file path
            const newRelative = getRelativePath(currentDir, foundPlannedPath);
            // Prefix relative prefix if missing
            const finalRelative = newRelative.startsWith(".") ? newRelative : "./" + newRelative;

            // Retain file extension if the original import target had it
            const hasExt = /\.(js|jsx|css|ts|tsx)$/.test(importTarget);
            const ext = hasExt ? "." + importTarget.split(".").pop() : "";

            const rewrittenTarget = cleanExtension(finalRelative) + ext;
            if (rewrittenTarget !== importTarget) {
                warnings.push(
                    `${filePath}: Corrected import '${importTarget}' to '${rewrittenTarget}' (file planned at '${foundPlannedPath}')`,
                );
                return `${prefix}${rewrittenTarget}${suffix}`;
            }
        }

        return match;
    });

    return { code: newCode, warnings };
}

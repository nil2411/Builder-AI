import parser from "@babel/parser";

function contentOf(entry) {
    return typeof entry === "string"
        ? entry
        : typeof entry?.content === "string"
            ? entry.content
            : "";
}

function normalizePath(value) {
    const parts = String(value || "")
        .replace(/\\/g, "/")
        .split("/")
        .filter(Boolean);
    const normalized = [];

    for (const part of parts) {
        if (part === ".") continue;
        if (part === "..") normalized.pop();
        else normalized.push(part);
    }

    return "/" + normalized.join("/");
}

function stripExtension(value) {
    return value.replace(/\.(?:jsx?|tsx?|css|json)$/i, "");
}

function resolveImportPath(fromPath, importPath) {
    if (!importPath.startsWith(".")) return null;
    const directory = fromPath.slice(0, fromPath.lastIndexOf("/"));
    return normalizePath(`${directory}/${importPath}`);
}

function findPlannedPath(fromPath, importPath, plannedPaths) {
    const resolved = resolveImportPath(fromPath, importPath);
    if (!resolved) return null;

    const resolvedWithoutExtension = stripExtension(resolved);
    const candidates = new Set([
        resolved,
        `${resolved}.js`,
        `${resolved}.jsx`,
        `${resolved}.css`,
        `${resolved}/index.js`,
        `${resolved}/index.jsx`,
    ]);

    return plannedPaths.find((candidate) => (
        candidates.has(candidate) || stripExtension(candidate) === resolvedWithoutExtension
    )) || null;
}

function collectImportSources(ast) {
    const sources = [];
    const visited = new WeakSet();

    function visit(node) {
        if (!node || typeof node !== "object") return;
        if (visited.has(node)) return;
        visited.add(node);

        if (
            (node.type === "ImportDeclaration" ||
                node.type === "ExportNamedDeclaration" ||
                node.type === "ExportAllDeclaration") &&
            node.source?.value
        ) {
            sources.push(String(node.source.value));
        }

        if (
            node.type === "CallExpression" &&
            node.callee?.type === "Import" &&
            node.arguments?.[0]?.type === "StringLiteral"
        ) {
            sources.push(String(node.arguments[0].value));
        }

        for (const value of Object.values(node)) {
            if (Array.isArray(value)) value.forEach(visit);
            else if (value && typeof value === "object") visit(value);
        }
    }

    visit(ast);
    return sources;
}

function parseJavaScript(filePath, source) {
    return parser.parse(source, {
        sourceType: "module",
        sourceFilename: filePath,
        errorRecovery: false,
        plugins: [
            "jsx",
            "classProperties",
            "dynamicImport",
            "importMeta",
            "nullishCoalescingOperator",
            "objectRestSpread",
            "optionalChaining",
            "topLevelAwait",
        ],
    });
}

function checkBalancedCss(source) {
    let braces = 0;
    let parentheses = 0;
    let quote = null;
    let comment = false;

    for (let index = 0; index < source.length; index += 1) {
        const character = source[index];
        const next = source[index + 1];

        if (comment) {
            if (character === "*" && next === "/") {
                comment = false;
                index += 1;
            }
            continue;
        }
        if (!quote && character === "/" && next === "*") {
            comment = true;
            index += 1;
            continue;
        }
        if (quote) {
            if (character === "\\") index += 1;
            else if (character === quote) quote = null;
            continue;
        }
        if (character === "\"" || character === "'") {
            quote = character;
            continue;
        }
        if (character === "{") braces += 1;
        else if (character === "}") braces -= 1;
        else if (character === "(") parentheses += 1;
        else if (character === ")") parentheses -= 1;

        if (braces < 0 || parentheses < 0) return false;
    }

    return !comment && !quote && braces === 0 && parentheses === 0;
}

function createIssue(path, message) {
    return { path, message };
}

export function createQualityManifest(files = {}) {
    return Object.entries(files).map(([path, entry]) => {
        const content = contentOf(entry);
        return {
            path,
            hash: entry?.hash,
            size: content.length,
        };
    });
}

export function validateGeneratedProject(files = {}) {
    const normalizedFiles = Object.fromEntries(
        Object.entries(files).map(([path, entry]) => [normalizePath(path), contentOf(entry)]),
    );
    const plannedPaths = Object.keys(normalizedFiles);
    const issues = [];
    let parsedJavaScriptFiles = 0;
    let checkedLocalImports = 0;

    if (!normalizedFiles["/App.js"]) {
        issues.push(createIssue("/App.js", "The project is missing its /App.js entry point."));
    }
    if (!normalizedFiles["/styles.css"]) {
        issues.push(createIssue("/styles.css", "The project is missing its /styles.css stylesheet."));
    }

    for (const [filePath, source] of Object.entries(normalizedFiles)) {
        if (!source.trim()) {
            issues.push(createIssue(filePath, "The generated file is empty."));
            continue;
        }

        if (/\.css$/i.test(filePath)) {
            if (!checkBalancedCss(source)) {
                issues.push(createIssue(filePath, "The stylesheet has unbalanced CSS delimiters or quotes."));
            }
            continue;
        }

        if (!/\.(?:jsx?|tsx?)$/i.test(filePath)) continue;

        let ast;
        try {
            ast = parseJavaScript(filePath, source);
            parsedJavaScriptFiles += 1;
        } catch (error) {
            issues.push(createIssue(filePath, `JavaScript/JSX parse error: ${error.message}`));
            continue;
        }

        for (const importSource of collectImportSources(ast)) {
            if (!importSource.startsWith(".")) continue;
            checkedLocalImports += 1;
            if (!findPlannedPath(filePath, importSource, plannedPaths)) {
                issues.push(createIssue(filePath, `Local import '${importSource}' does not resolve to a generated file.`));
            }
        }

        if (filePath === "/App.js" || filePath.startsWith("/components/")) {
            const defaultExports = ast.program.body.filter(
                (node) => node.type === "ExportDefaultDeclaration",
            );
            if (defaultExports.length !== 1) {
                issues.push(createIssue(filePath, "Each application/component file must have exactly one default export."));
            }
        }
    }

    return {
        ok: issues.length === 0,
        issues,
        metrics: {
            fileCount: plannedPaths.length,
            parsedJavaScriptFiles,
            checkedLocalImports,
            issueCount: issues.length,
        },
    };
}

export function evaluateRequirements(files, requirements = []) {
    const source = Object.values(files || {}).map(contentOf).join("\n");
    return requirements.map((requirement) => ({
        name: requirement.name,
        passed: requirement.pattern instanceof RegExp
            ? requirement.pattern.test(source)
            : String(source).includes(String(requirement.pattern)),
    }));
}

export const SANDPACK_BUNDLER_URL =
    import.meta.env.VITE_SANDPACK_BUNDLER_URL || "https://sandpack-bundler.codesandbox.io";

const TAILWIND_PLAY_CDN_URL = "https://cdn.tailwindcss.com";
const FONT_AWESOME_CSS_URL = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css";

const defaultPreviewDocument = [
    "<!doctype html>",
    "<html lang=\"en\">",
    "  <head>",
    "    <meta charset=\"UTF-8\" />",
    "    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />",
    "    <title>Preview</title>",
    "  </head>",
    "  <body>",
    "    <div id=\"root\"></div>",
    "  </body>",
    "</html>",
].join("\n");

function getFileCode(content) {
    if (typeof content === "string") return content;
    return content?.content || content?.code || "";
}

export function getPreviewEntry(files = {}) {
    const normalizedPaths = new Set(
        Object.keys(files).map((path) => path.startsWith("/") ? path : "/" + path),
    );
    const packageCode = getFileCode(files["/package.json"] || files["package.json"]);
    const packageMain = (() => {
        if (!packageCode) return undefined;
        try {
            const packageJson = JSON.parse(packageCode);
            return typeof packageJson.main === "string" ? packageJson.main : undefined;
        } catch {
            // Keep looking for a usable source entry if package JSON is malformed.
            return undefined;
        }
    })();
    const candidates = [
        "/index.js",
        "/index.jsx",
        "/index.tsx",
        "/src/main.jsx",
        "/src/main.js",
        "/src/main.tsx",
        "/src/index.jsx",
        "/src/index.js",
        "/src/index.tsx",
    ];

    const directEntry = candidates
        .find((path) => normalizedPaths.has(path));
    if (directEntry) return directEntry;

    if (packageMain && packageMain !== "/App.js" && packageMain !== "App.js") {
        const normalizedMain = packageMain.startsWith("/") ? packageMain : "/" + packageMain;
        if (normalizedPaths.has(normalizedMain)) return normalizedMain;
    }

    // The React Sandpack template supplies /index.js even when the generated
    // project did not persist its template files.
    return "/index.js";
}
function unwrapCodeEnvelope(content) {
    let value = content;

    for (let depth = 0; depth < 2; depth += 1) {
        const candidate = value.trim();
        if (!candidate.startsWith("{")) break;


        try {
            const parsed = JSON.parse(candidate);
            if (typeof parsed?.code === "string") {
                value = parsed.code;
                continue;
            }
            if (typeof parsed?.content === "string") {
                value = parsed.content;
                continue;
            }
        } catch {
            const malformedEnvelope = candidate.match(/^\{\s*"(?:code|content)"\s*:\s*"([\s\S]*)"\s*\}\s*$/);
            if (malformedEnvelope) {
                value = malformedEnvelope[1].replace(/\\"/g, '"');
                continue;
            }
        }
        break;
    }

    return value;
}
export function normalizePreviewCode(content, path) {
    let code = unwrapCodeEnvelope(getFileCode(content)).trim();

    // Sandpack receives persisted files too, so clean up markdown fences even
    // when the file was generated before the server-side validator existed.
    code = code.replace(/^[\x60]{3}(?:jsx?|javascript|css|html|tsx?|react)?\s*\n/, "");
    code = code.replace(/\n[\x60]{3}\s*$/, "").trim();
    if (/\.css$/i.test(path)) {
        const hiddenSectionRule = /\s*section\s*\{\s*opacity\s*:\s*0\s*;\s*\}/gi;
        code = code.replace(hiddenSectionRule, "\n").trim();
    }


    if (/\.(?:js|jsx)$/i.test(path)) {
        const escapedJsxAttributeQuoteRegex = /(<[A-Za-z][^>\n]*?\b[\w:-]+\s*=\s*)\\"/g;
        if (escapedJsxAttributeQuoteRegex.test(code)) {
            code = code.replace(escapedJsxAttributeQuoteRegex, "$1\"");
        }

        const escapedJsxClosingAttributeQuoteRegex = /(<[A-Za-z][^>\n]*?\b[\w:-]+\s*=\s*"[^"\n]*)\\"(?=\s*(?:\/?>|[\w:-]+\s*=))/g;
        if (escapedJsxClosingAttributeQuoteRegex.test(code)) {
            code = code.replace(escapedJsxClosingAttributeQuoteRegex, "$1\"");
        }

        const malformedTemplateAttributeRegex = /(<[A-Za-z][^>\n]*?\b[\w:-]+\s*=\s*\{[\x60][^>\n]*?)"\s*\}/g;
        if (malformedTemplateAttributeRegex.test(code)) {
            code = code.replace(malformedTemplateAttributeRegex, "$1\x60}");
        }

        const malformedJsxTagCloseRegex = /(<[A-Za-z][^>\n]*?)\\>(?=\s*(?:\{|\/?>|[\w:-]+\s*=))/g;
        if (malformedJsxTagCloseRegex.test(code)) {
            code = code.replace(malformedJsxTagCloseRegex, "$1\">");
        }
        // Repair the malformed JSX attribute artifact that causes Babel's
        // Unicode escape parse error.
        code = code.replace(
            /(<[A-Za-z][^>\n]*?)\\}(?=\s*(?:\/?>|[\w:-]+\s*=))/g,
            "$1\"",
        );
    }
    return code;
}
function addPreviewResources(document) {
    const resources = [
        document.includes(TAILWIND_PLAY_CDN_URL)
            ? ""
            : "<script src=\"" + TAILWIND_PLAY_CDN_URL + "\"></script>",
        document.includes(FONT_AWESOME_CSS_URL)
            ? ""
            : "<link rel=\"stylesheet\" href=\"" + FONT_AWESOME_CSS_URL + "\" />",
    ].filter(Boolean).join("\n    ");

    if (!resources) return document;

    if (document.includes("</head>")) {
        return document.replace("</head>", "    " + resources + "\n  </head>");
    }

    return document.replace("<body", "<head>" + resources + "</head>\n  <body");
}

// Sandpack's React template needs these resources inside its own public HTML file.
// Passing the Tailwind CDN through externalResources is unreliable because its URL
// does not have a .js extension, leaving utility-class-based projects unstyled.
export function createSandpackFiles(files = {}, activeFile) {
    const sandpackFiles = {};

    for (const [path, content] of Object.entries(files)) {
        sandpackFiles[path] = {
            code: normalizePreviewCode(content, path),
            active: path === activeFile,
        };
    }

    const indexPath = "/public/index.html";
    const currentDocument = getFileCode(files[indexPath]) || defaultPreviewDocument;
    sandpackFiles[indexPath] = {
        code: addPreviewResources(currentDocument),
        hidden: true,
    };

    return sandpackFiles;
}

// Scans source files to detect npm dependencies from import statements
export function detectDependencies(files) {
    const deps = {};
    if (!files) return deps;

    const allCode = Object.values(files)
        .map((content) => getFileCode(content))
        .join("\n");
    const filePaths = Object.keys(files);

    const isLocalFileOrFolder = (pkgName) => {
        const name = pkgName.startsWith("@/") ? pkgName.substring(2) : pkgName;
        return (
            pkgName.startsWith("@/") ||
            pkgName === "@" ||
            filePaths.some((path) =>
                path === "/" + name ||
                path.startsWith("/" + name + "/") ||
                path.replace(/\.[^/.]+$/, "") === "/" + name
            )
        );
    };

    const importRegex = /from\s+['"]([^./][^'"]*)['"]/g;
    let match;
    while ((match = importRegex.exec(allCode)) !== null) {
        const rawImport = match[1];
        const pkg = rawImport.startsWith("@") && !rawImport.startsWith("@/")
            ? rawImport.split("/").slice(0, 2).join("/")
            : rawImport.split("/")[0];

        if (pkg !== "react" && pkg !== "react-dom" && !isLocalFileOrFolder(pkg)) {
            deps[pkg] = "latest";
        }
    }
    return deps;
}
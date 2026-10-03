import { validateAndFixCode } from "./codeValidator.js";

const ICON_CLASS_NAMES = new Set([
    "fa", "fas", "far", "fab", "fal", "fad", "fat", "fa-solid",
    "fa-regular", "fa-brands", "fa-light", "fa-duotone", "fa-thin",
]);

const STYLE_ALIASES = {
    "site-header__container": "header-inner",
    "site-header__logo": "logo",
    "site-header__nav": "nav",
    "site-header__nav-list": "nav-list",
    "site-header__nav-link": "nav-link",
    "site-header__nav-toggle": "mobile-toggle",
    "hero-overlay": "hero-content",
    "card-title": "feature-title",
    "card-desc": "feature-desc",
    "class-title": "class-name",
    "trainer-image": "trainer-photo",
    "trainer-specialization": "trainer-spec",
    "trainer-social": "social-links",
    "testimonials-section": "testimonials",
    "testimonial-quote": "quote",
    "testimonial-rating": "rating",
    "testimonial-author": "author",
    "membership-section": "membership",
    "membership-plans": "plan-grid",
    "plan-cta": "plan-button",
    "site-footer": "footer",
    "footer-content": "footer-grid",
    "footer-nav": "footer-links",
    "footer-link-list": "footer-links",
    "footer-link": "footer-links",
    "footer-social": "social-icons",
    "social-list": "social-icons",
    "footer-copyright": "footer-bottom",
};

const EXTRA_RULES = {
    "site-wrapper": "display: block; min-height: 100vh;",
    "features-section": "padding: var(--space-xl) var(--space-md); background: var(--color-bg);",
    "class-icon": "font-size: 2rem; color: var(--color-primary); margin-bottom: var(--space-sm);",
    "trainer-info": "display: flex; flex-direction: column; align-items: center;",
    "social-link": "color: var(--color-secondary); text-decoration: none; font-size: 1.2rem; transition: color var(--transition-fast);",
    "testimonial-image": "width: 64px; height: 64px; border-radius: 50%; object-fit: cover; margin-bottom: var(--space-sm);",
    "testimonial-content": "display: block;",
    "footer-logo": "width: 72px; height: 72px; object-fit: cover; border-radius: var(--radius-md); margin-bottom: var(--space-sm);",
    "footer-tagline": "color: #cfe2f3; margin-bottom: var(--space-md);",
    "footer-link-list": "list-style: none; display: grid; gap: var(--space-xs);",
    "footer-contact-item": "margin-bottom: var(--space-xs);",
    "footer-link": "color: #cfe2f3; text-decoration: none; transition: color var(--transition-fast);",
    "feature-item": "margin-bottom: var(--space-xs); color: var(--color-muted);",
    "popular": "border: 2px solid var(--color-primary); transform: translateY(-4px);",
    "sr-only": "position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;",
};

function contentOf(entry) {
    return typeof entry === "string" ? entry : typeof entry?.content === "string" ? entry.content : "";
}

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractClassNames(code) {
    const result = new Set();
    const regex = /(?:className|class)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([\s\S]*?)`\})/g;
    for (const match of String(code || "").matchAll(regex)) {
        const value = (match[1] ?? match[2] ?? match[3] ?? "").replace(/\$\{[\s\S]*?\}/g, " ");
        for (const token of value.split(/\s+/)) {
            if (/^[A-Za-z_][\w-]*$/.test(token)) result.add(token);
        }
    }
    return result;
}

function collectUsedClasses(files) {
    const result = new Set();
    for (const [path, entry] of Object.entries(files || {})) {
        if (!/\.(jsx?|tsx?)$/i.test(path)) continue;
        for (const className of extractClassNames(contentOf(entry))) result.add(className);
    }
    return result;
}

function hasCssClass(css, className) {
    return new RegExp(`\\.${escapeRegex(className)}(?![\\w-])`).test(css);
}

function findCssRules(css, sourceClass) {
    const selectorPattern = new RegExp(`\\.${escapeRegex(sourceClass)}(?![\\w-])`);
    const rules = [];
    let depth = 0;
    let segmentStart = 0;
    let openIndex = -1;

    // Only copy top-level rules. Rules nested inside @media/@keyframes must
    // remain responsive and must not become unconditional base styles.
    for (let index = 0; index < css.length; index++) {
        const character = css[index];
        if (character === "{") {
            if (depth === 0) {
                openIndex = index;
                const rawSelector = css.slice(segmentStart, index).replace(/\/\*[\s\S]*?\*\//g, "").trim();
                if (!rawSelector.startsWith("@") && selectorPattern.test(rawSelector)) {
                    let closeIndex = index + 1;
                    let nestedDepth = 1;
                    while (closeIndex < css.length && nestedDepth > 0) {
                        if (css[closeIndex] === "{") nestedDepth++;
                        else if (css[closeIndex] === "}") nestedDepth--;
                        closeIndex++;
                    }
                    if (nestedDepth === 0) {
                        rules.push({
                            selector: rawSelector,
                            declarations: css.slice(index + 1, closeIndex - 1).trim(),
                        });
                    }
                }
            }
            depth++;
        } else if (character === "}") {
            depth = Math.max(0, depth - 1);
            if (depth === 0) {
                segmentStart = index + 1;
                openIndex = -1;
            }
        }
    }
    return rules;
}
function copyAlias(css, alias, source) {
    if (hasCssClass(css, alias)) return css;
    const rules = findCssRules(css, source);
    if (!rules.length) return css;
    const sourcePattern = new RegExp(`\\.${escapeRegex(source)}(?![\\w-])`, "g");
    const copied = rules.map(({ selector, declarations }) => `${selector.replace(sourcePattern, `.${alias}`)} {\n${declarations}\n}`).join("\n");
    return `${css.trimEnd()}\n\n/* Generated JSX/CSS compatibility aliases */\n${copied}\n`;
}

function stripGeneratedRepairSections(css) {
    const markers = [
        "/* Generated JSX/CSS compatibility aliases */",
        "/* Generated JSX/CSS fallback rules */",
        "/* Generated responsive header compatibility */",
    ];
    const indexes = markers.map((marker) => css.indexOf(marker)).filter((index) => index >= 0);
    if (!indexes.length) return css;
    return css.slice(0, Math.min(...indexes)).trimEnd() + "\n";
}
function hasDirectCssRule(css, className) {
    return new RegExp(`(?:^|})\\s*\\.${escapeRegex(className)}\\s*\\{`).test(css);
}

function addRule(css, className, declarations) {
    if (hasDirectCssRule(css, className)) return css;
    return `${css.trimEnd()}\n\n.${className} {\n  ${declarations}\n}\n`;
}

function addHeaderRules(css) {
    if (css.includes("/* Generated responsive header compatibility */")) return css;
    return `${css.trimEnd()}\n\n/* Generated responsive header compatibility */\n.site-header__icon-bar {\n  display: block;\n  width: 24px;\n  height: 2px;\n  margin: 4px 0;\n  background: currentColor;\n}\n.site-header__nav--open {\n  display: block;\n}\n@media (min-width: 900px) {\n  .site-header__nav { display: block; }\n  .site-header__nav-toggle { display: none; }\n}\n`;
}

function addFontAwesomeImport(css, files) {
    const source = Object.entries(files)
        .filter(([path]) => /\.(jsx?|tsx?)$/i.test(path))
        .map(([, content]) => content)
        .join("\n");
    if (!/\b(?:fas|fab|far|fa-solid|fa-brands|fa-regular)\b/.test(source)) return css;
    if (/font-awesome|fontawesome|cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome/i.test(css)) return css;
    return `@import url("https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css");\n${css.trimStart()}`;
}

const OBJECT_PROP_NAMES = new Set([
    "product", "item", "user", "profile", "data", "record", "course", "trainer",
    "plan", "movie", "book", "order", "cartItem", "testimonial", "project",
]);

function parseComponentProps(raw) {
    return raw
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => ({
            name: part.replace(/^\.\.\./, "").split(/[:=]/, 1)[0].trim(),
            hasDefault: part.includes("="),
        }))
        .filter(({ name }) => /^[A-Za-z_$][\w$]*$/.test(name));
}

function collectComponentPropDefinitions(files) {
    const definitions = new Map();
    const patterns = [
        /(?:export\s+default\s+)?function\s+([A-Z][A-Za-z0-9_]*)\s*\(\s*\{([\s\S]*?)\}\s*\)/g,
        /(?:const|let)\s+([A-Z][A-Za-z0-9_]*)\s*=\s*\(\s*\{([\s\S]*?)\}\s*\)\s*=>/g,
    ];

    for (const code of Object.values(files)) {
        const source = typeof code === "string" ? code : code?.content || "";
        for (const pattern of patterns) {
            for (const match of source.matchAll(pattern)) {
                const props = parseComponentProps(match[2]).filter((prop) => !prop.hasDefault);
                if (props.length) definitions.set(match[1], props);
            }
        }
    }
    return definitions;
}

function getMapItemVariable(prefix) {
    const recent = prefix.slice(-1200);
    const matches = [...recent.matchAll(/\.map\s*\(\s*\(?\s*([A-Za-z_$][\w$]*)\s*\)?\s*(?:=>|,)/g)];
    return matches.length ? matches[matches.length - 1][1] : null;
}

function hasPropAttribute(attributes, propName) {
    const slash = String.fromCharCode(92);
    return new RegExp("(?:^|" + slash + "s)" + escapeRegex(propName) + slash + "s*=").test(attributes);
}

export function repairProjectRuntime(files) {
    const normalizedFiles = Object.fromEntries(Object.entries(files || {}).map(([path, entry]) => [path, contentOf(entry)]));
    const definitions = collectComponentPropDefinitions(normalizedFiles);
    const warnings = [];
    let changed = false;

    for (const [path, source] of Object.entries(normalizedFiles)) {
        if (!/\.(jsx?|tsx?)$/i.test(path) || !source) continue;
        let repaired = source;
        for (const [componentName, props] of definitions) {
            const whitespace = String.fromCharCode(92) + "s";
            const tagRegex = new RegExp("<" + componentName + "(?:" + whitespace + "|/|>)[^<>]*>", "g");
            repaired = repaired.replace(tagRegex, (tag, offset) => {
                const attributes = tag.slice(componentName.length + 1);
                const missingProps = props.filter(({ name }) => !hasPropAttribute(attributes, name));
                if (!missingProps.length) return tag;

                const mapItem = getMapItemVariable(repaired.slice(0, offset));
                if (!mapItem) return tag;

                const additions = missingProps
                    .map(({ name }) => {
                        if (OBJECT_PROP_NAMES.has(name) || OBJECT_PROP_NAMES.has(name.toLowerCase())) {
                            return ` ${name}={${mapItem}}`;
                        }
                        if (/^(on|handle)/i.test(name)) {
                            return ` ${name}={() => {}}`;
                        }
                        return "";
                    })
                    .join("");
                if (!additions) return tag;
                const closing = tag.trimEnd().endsWith("/>") ? " />" : ">";
                const trimmedTag = tag.trimEnd();
                const withoutClosing = closing === " />"
                    ? trimmedTag.slice(0, -2).trimEnd()
                    : trimmedTag.slice(0, -1).trimEnd();
                warnings.push(`${path}: Passed missing ${missingProps.map(({ name }) => name).join(", ")} prop(s) to <${componentName}>`);
                changed = true;
                return withoutClosing + additions + closing;
            });
        }
        normalizedFiles[path] = repaired;
    }

    return { files: normalizedFiles, changed, warnings };
}
export function repairProjectStyles(files) {
    const normalizedFiles = Object.fromEntries(Object.entries(files || {}).map(([path, entry]) => [path, contentOf(entry)]));
    const cssPath = Object.prototype.hasOwnProperty.call(normalizedFiles, "/styles.css") ? "/styles.css" : "styles.css";
    if (typeof normalizedFiles[cssPath] !== "string") {
        return { files: normalizedFiles, changed: false, warnings: [], missingClasses: [] };
    }

    const usedClasses = collectUsedClasses(normalizedFiles);
    const inputCss = normalizedFiles[cssPath];
    const originalCss = stripGeneratedRepairSections(inputCss);
    let css = originalCss;
    const warnings = [];

    for (const className of usedClasses) {
        if (ICON_CLASS_NAMES.has(className) || className.startsWith("fa-") || hasCssClass(css, className)) continue;
        const source = STYLE_ALIASES[className];
        if (!source) continue;
        const before = css;
        css = copyAlias(css, className, source);
        if (css !== before) warnings.push(`Added CSS alias .${className} -> .${source}`);
    }

    for (const [className, declarations] of Object.entries(EXTRA_RULES)) {
        if (!usedClasses.has(className)) continue;
        const before = css;
        css = addRule(css, className, declarations);
        if (css !== before) warnings.push(`Added missing CSS rule .${className}`);
    }

    if (usedClasses.has("site-header__nav") || usedClasses.has("site-header__nav-toggle")) {
        const before = css;
        css = addHeaderRules(css);
        if (css !== before) warnings.push("Added responsive header compatibility rules");
    }

    const beforeFont = css;
    css = addFontAwesomeImport(css, normalizedFiles);
    if (css !== beforeFont) warnings.push("Added Font Awesome import for generated icon classes");

    normalizedFiles[cssPath] = css;
    const finalCssClasses = new Set([...css.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((match) => match[1]));
    return {
        files: normalizedFiles,
        changed: css !== inputCss,
        warnings,
        missingClasses: [...usedClasses].filter((className) => !ICON_CLASS_NAMES.has(className) && !className.startsWith("fa-") && !finalCssClasses.has(className)),
    };
}

export function repairProjectFiles(files) {
    const sourceFiles = Object.fromEntries(Object.entries(files || {}).map(([path, entry]) => [path, contentOf(entry)]));
    const allPlannedFiles = Object.keys(sourceFiles).map((path) => ({ path }));
    const normalizedFiles = {};
    const warnings = [];

    for (const [path, content] of Object.entries(sourceFiles)) {
        if (/\.(jsx?|tsx?|css)$/i.test(path)) {
            const result = validateAndFixCode(content, path, { allPlannedFiles });
            normalizedFiles[path] = result.code;
            warnings.push(...result.warnings);
        } else {
            normalizedFiles[path] = content;
        }
    }

    const runtimeResult = repairProjectRuntime(normalizedFiles);
    warnings.push(...runtimeResult.warnings);

    const styleResult = repairProjectStyles(runtimeResult.files);
    warnings.push(...styleResult.warnings);
    return {
        files: styleResult.files,
        changed: Object.keys(sourceFiles).some((path) => sourceFiles[path] !== styleResult.files[path]),
        warnings,
        missingClasses: styleResult.missingClasses,
    };
}
function normalizeProjectPath(value) {
    const parts = String(value || "").replace(/\\/g, "/").split("/").filter(Boolean);
    const normalized = [];
    for (const part of parts) {
        if (part === ".") continue;
        if (part === "..") normalized.pop();
        else normalized.push(part);
    }
    return "/" + normalized.join("/");
}

function stripProjectExtension(value) {
    return value.replace(/\.(?:jsx?|tsx?|css|json)$/i, "");
}

function resolvePlannedImport(currentPath, importPath, plannedPaths) {
    if (!String(importPath).startsWith(".")) return null;
    const directory = currentPath.slice(0, currentPath.lastIndexOf("/"));
    const resolved = normalizeProjectPath(`${directory}/${importPath}`);
    const candidates = new Set([
        resolved,
        `${resolved}.js`,
        `${resolved}.jsx`,
        `${resolved}.css`,
        `${resolved}/index.js`,
        `${resolved}/index.jsx`,
    ]);
    const resolvedWithoutExtension = stripProjectExtension(resolved);
    return plannedPaths.find((path) => (
        candidates.has(path) || stripProjectExtension(path) === resolvedWithoutExtension
    )) || null;
}

// Returns dependency-first layers. Files in one layer are independent of one
// another and can be generated with limited concurrency; later layers receive
// all earlier source files as context.
export function buildGenerationLayers(componentFiles) {
    const normalizedFiles = componentFiles.map((file) => ({
        ...file,
        path: normalizeProjectPath(file.path),
    }));
    const plannedPaths = normalizedFiles.map((file) => file.path);
    const dependencies = new Map(plannedPaths.map((path) => [path, new Set()]));

    for (const file of normalizedFiles) {
        for (const importPath of file.imports || []) {
            const dependency = resolvePlannedImport(file.path, importPath, plannedPaths);
            if (dependency && dependency !== file.path) dependencies.get(file.path).add(dependency);
        }
    }

    const remaining = new Set(plannedPaths);
    const layers = [];
    while (remaining.size > 0) {
        let ready = [...remaining].filter((path) => (
            [...dependencies.get(path)].every((dependency) => !remaining.has(dependency))
        ));
        if (ready.length === 0) ready = [...remaining].sort();
        ready.sort((left, right) => left.localeCompare(right));
        layers.push(ready.map((path) => normalizedFiles.find((file) => file.path === path)));
        ready.forEach((path) => remaining.delete(path));
    }
    return layers;
}

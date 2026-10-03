// Fix double-escaped newlines/quotes from AI JSON string output
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
export function normalizeContent(content) {
    if (!content) return "";

    // Remove BOM if present
    if (content.charCodeAt(0) === 0xfeff) {
        content = content.slice(1);
    }
    content = unwrapCodeEnvelope(content);


    // Normalize \r\n to \n
    content = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    const realNewlines = (content.match(/\n/g) || []).length;
    const literalBackslashN = (content.match(/\\n/g) || []).length;

    if (literalBackslashN > realNewlines) {
        // Triple-escaped first: \\\\n → \\n (leave as literal), then \\n → \n
        content = content
            .replace(/\\\\n/g, "%%PRESERVED_ESCAPED_N%%")
            .replace(/\\n/g, "\n")
            .replace(/%%PRESERVED_ESCAPED_N%%/g, "\\n")
            .replace(/\\t/g, "\t")
            .replace(/\\r/g, "")
            .replace(/\\\\/g, "\\");
    }

    // Always clean up backslash-escaped quotes (e.g. className=\"relative\") in code.
    // Normalize escaped JSX attribute openings even when the closing quote is
    // malformed and cannot be matched by the paired-quote cleanup below.
    content = content.replace(/(<[A-Za-z][^>\n]*?\b[\w:-]+\s*=\s*)\\"/g, '$1"');
    content = content.replace(/(<[A-Za-z][^>\n]*?\b[\w:-]+\s*=\s*"[^"\n]*)\\"(?=\s*(?:\/?>|[\w:-]+\s*=))/g, '$1"');
    content = content.replace(/(<[A-Za-z][^>\n]*?\b[\w:-]+\s*=\s*\{[\x60][^>\n]*?)"\s*\}/g, '$1\x60}');

    // This is safe because "contains escaped quotes" is always invalid syntax in JSX/React.
    content = content.replace(/(\w+)=\\"([^"]*?)\\"/g, '$1="$2"');

    return content;
}

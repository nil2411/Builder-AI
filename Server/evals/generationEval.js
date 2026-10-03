import { QUALITY_CASES } from "./qualityCases.js";
import { evaluateRequirements, validateGeneratedProject } from "../services/projectQuality.js";

const modelArgumentIndex = process.argv.findIndex((argument) => argument === "--model");
if (modelArgumentIndex >= 0 && process.argv[modelArgumentIndex + 1]) {
    process.env.OPENROUTER_MODEL = process.argv[modelArgumentIndex + 1];
}

const { generateProject } = await import("../services/ai.js");
const results = [];

for (const testCase of QUALITY_CASES) {
    const startedAt = Date.now();
    try {
        const result = await generateProject(testCase.prompt);
        const validation = validateGeneratedProject(result.files);
        const requirements = evaluateRequirements(result.files, testCase.requirements);
        results.push({
            name: testCase.name,
            model: process.env.OPENROUTER_MODEL || "openrouter/free",
            durationMs: Date.now() - startedAt,
            validation,
            requirements,
            passed: validation.ok && requirements.every((requirement) => requirement.passed),
        });
    } catch (error) {
        results.push({
            name: testCase.name,
            model: process.env.OPENROUTER_MODEL || "openrouter/free",
            durationMs: Date.now() - startedAt,
            passed: false,
            error: error.message || String(error),
        });
    }
}

const passed = results.filter((result) => result.passed).length;
console.log(JSON.stringify({
    model: process.env.OPENROUTER_MODEL || "openrouter/free",
    passed,
    total: results.length,
    results,
}, null, 2));

if (passed !== results.length) process.exitCode = 1;

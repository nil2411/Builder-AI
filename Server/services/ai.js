import "dotenv/config";
import {createOpenAI} from '@ai-sdk/openai'
import { generateObject, generateText } from 'ai';
import pMap from "p-map";
import { FileCodeSchema, FilePlanSchema, RevisionResultSchema } from './aiSchemas.js';
import { buildFileCodeSystem, FILE_PLAN_SYSTEM, REVISE_SYSTEM } from './prompts.js';
import { normalizeContent } from './contentNormalizer.js';
import { validateAndFixCode, validateRevisionContent } from './codeValidator.js';
import { repairProjectFiles } from './projectRepair.js';
import { applyOperations, hashContent } from './diff.js';
import { createQualityManifest, validateGeneratedProject } from './projectQuality.js';
import { AI_USE_STRUCTURED_OUTPUT, generationSettings, MAX_CONCURRENCY, QUALITY_REPAIR_ROUNDS } from './generationSettings.js';
import { buildGenerationLayers } from './generationOrder.js';

const MODEL = process.env.OPENROUTER_MODEL || "poolside/laguna-s-2.1:free";

const openrouter = createOpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
})

const model = openrouter(MODEL);

function collectProviderErrors(error) {
    const errors = [];
    const seen = new Set();

    function visit(candidate) {
        if (!candidate || typeof candidate !== "object" || seen.has(candidate)) return;
        seen.add(candidate);
        errors.push(candidate);
        visit(candidate.lastError);
        if (Array.isArray(candidate.errors)) {
            candidate.errors.forEach(visit);
        }
    }

    visit(error);
    return errors;
}

function getProviderErrorText(error) {
    return collectProviderErrors(error)
        .flatMap((candidate) => [candidate.message, candidate.responseBody])
        .filter(Boolean)
        .map(String)
        .join(" ");
}

export function isRateLimitError(error) {
    return collectProviderErrors(error).some((candidate) => {
        const details = [candidate.message, candidate.responseBody]
            .filter(Boolean)
            .join(" ");
        return Number(candidate.statusCode) === 429 || /rate[- ]limit|free-models-per-day|too many requests/i.test(details);
    });
}

export function getRateLimitScope(error) {
    const details = getProviderErrorText(error);
    if (/upstream_provider_shared_pool|temporarily rate-limited upstream/i.test(details)) {
        return "upstream";
    }
    if (/free-models-per-day|daily (?:free-model )?limit|daily quota/i.test(details)) {
        return "daily";
    }
    return "provider";
}

function normalizeProviderError(error) {
    if (!isRateLimitError(error)) return error;

    const scope = getRateLimitScope(error);
    const message = scope === "upstream"
        ? `OpenRouter model "${MODEL}" is temporarily rate-limited by its upstream shared pool. Retry shortly, choose another model/provider, or add your own provider key in OpenRouter Integrations.`
        : scope === "daily"
            ? "OpenRouter's free-model daily limit has been reached for this account. Wait for the daily reset or add credits/use a paid model, then retry."
            : "OpenRouter returned a rate-limit response for the configured model. Retry later, choose another model/provider, or use a paid model.";

    // Do not attach the raw provider error: OpenRouter response bodies can
    // contain account/provider metadata that should not be written to logs.
    const friendlyError = new Error(message);
    friendlyError.code = "AI_RATE_LIMITED";
    friendlyError.statusCode = 429;
    friendlyError.isRetryable = false;
    return friendlyError;
}
function stripJsonFences(text) {
    let candidate = String(text ?? "").replace(/^\uFEFF/, "").trim();
    const fenced = candidate.match(/^[\x60]{3}(?:json)?\s*([\s\S]*?)\s*[\x60]{3}$/i);
    if (fenced) return fenced[1].trim();

    return candidate
        .replace(/^[\x60]{3}(?:json)?\s*/i, "")
        .replace(/\s*[\x60]{3}$/i, "")
        .trim();
}

export function parseStructuredResponse(text, schema) {
    const candidate = stripJsonFences(text);
    let parsed;

    try {
        parsed = JSON.parse(candidate);
    } catch (directError) {
        const start = candidate.indexOf("{");
        const end = candidate.lastIndexOf("}");
        if (start < 0 || end <= start) {
            throw directError;
        }
        parsed = JSON.parse(candidate.slice(start, end + 1));
    }

    return schema.parse(parsed);
}

async function requestJsonText({ schema, system, prompt, label }) {
    let text;
    try {
        ({ text } = await generateText({
            model,
            system: system + "\n\nReturn only one valid JSON object. Do not use Markdown fences or an explanation.",
            prompt,
            ...generationSettings(),
        }));
    } catch (error) {
        throw normalizeProviderError(error);
    }

    try {
        return parseStructuredResponse(text, schema);
    } catch (error) {
        throw new Error(
            "[AI] Structured response for " + label + " remained invalid after text generation: " + error.message,
            { cause: error },
        );
    }
}

async function requestStructuredObject({ schema, system, prompt, label }) {
    if (!AI_USE_STRUCTURED_OUTPUT) {
        console.log(`[AI] Using validated JSON text output for ${label}`);
        return requestJsonText({ schema, system, prompt, label });
    }

    try {
        const { object } = await generateObject({
            model,
            schema,
            system,
            prompt,
            ...generationSettings(),
        });
        return object;
    } catch (structuredError) {
        const providerError = normalizeProviderError(structuredError);
        if (providerError !== structuredError) throw providerError;

        console.warn(
            "[AI] Structured output failed for " + label + "; retrying with validated JSON text output: " +
            structuredError.message,
        );
        return requestJsonText({ schema, system, prompt, label });
    }
}

async function requestRawFileCode(system, prompt, path) {
    try {
        const { text } = await generateText({
            model,
            system: `${system}\n\nReturn only the complete source code for the requested file. Do not return JSON, Markdown fences, or an explanation.`,
            prompt,
            ...generationSettings(),
        });
        return text;
    } catch (error) {
        throw normalizeProviderError(error);
    }
}

async function requestFileCode(system, prompt, path) {
    if (!AI_USE_STRUCTURED_OUTPUT) {
        console.log(`[AI] Using raw source output for ${path}`);
        return requestRawFileCode(system, prompt, path);
    }

    try {
        const { object } = await generateObject({
            model,
            schema: FileCodeSchema,
            system,
            prompt,
            ...generationSettings(),
        });
        return object.code;
    } catch (structuredError) {
        const providerError = normalizeProviderError(structuredError);
        if (providerError !== structuredError) throw providerError;

        console.warn(
            `[AI] Structured output failed for ${path}; retrying with raw code output: ${structuredError.message}`,
        );
        return requestRawFileCode(system, prompt, path);
    }
}

// Generate a single file's code
async function generateSingleFile(file, allFiles, prompt, alreadyGeneratedFiles){
     const system = buildFileCodeSystem(allFiles, alreadyGeneratedFiles);

     const userMsg = `Project: ${prompt}\n\nWrite the complete code for: ${file.path}\nPurpose: ${file.description}`;

     console.log(`[AI] Creating file: ${file.path}...`);
          let code = normalizeContent(await requestFileCode(system, userMsg, file.path));


     if(code.trim().length === 0){
        throw new Error("Generated code is empty after normalization");
     }

     // Apply post-generation validation and auto-fixing
     const validation = validateAndFixCode(code, file.path, {allPlannedFiles: allFiles});

     code = validation.code;

     if(validation.warnings.length > 0){
        console.log(`[Validator] Code adjustments for ${file.path}:\n  - ${validation.warnings.join("\n  - ")}`);
     }

     console.log(`[AI] Created file: ${file.path} (${code.length} chars)`);
     return {path: file.path, code}
}

// Generate project files: plan first, then build files in order with fallback retries
export async function generateProject(prompt, callbacks){
    // Phase 1: Plan
    console.log(`[AI] Phase 1: Planning file structure for: "${prompt.slice(0,80)}..."`);
    const plan = await requestStructuredObject({
        schema: FilePlanSchema,
        system: FILE_PLAN_SYSTEM,
        prompt: `Plan a React website for: ${prompt}`,
        label: "project plan",
    });

    if(!plan.files.find((f)=> f.path === "/App.js")){
        plan.files.unshift({
            path: "/App.js",
            description: "Main application entry point",
            exports: "default App",
            imports: ["./styles.css"],
        })
    }

    if(!plan.files.find((f)=> f.path === "/styles.css")){
        plan.files.push({
             path: "/styles.css",
            description: "Global CSS: Google Font import, keyframe animations, utility classes",
            exports: "none",
            imports: [],
        })
    }

    if(callbacks?.onPlan){
        await callbacks.onPlan(plan)
    }

    let files = {};
    const plannedFiles = plan.files.map((file) => ({ ...file }));
    const styleFiles = plannedFiles.filter((file) => /\.css$/i.test(file.path));
    const componentFiles = plannedFiles.filter((file) => !/\.css$/i.test(file.path));
    const generationLayers = buildGenerationLayers(componentFiles);

    // Generate dependency layers in order. Files in the same layer have no
    // planned local dependencies and may run with limited concurrency.
    console.log(`[AI] Phase 2: Generating ${componentFiles.length} component files in ${generationLayers.length} dependency layer(s) (concurrency=${MAX_CONCURRENCY})`);

    async function generateBatch(batch, batchLabel) {
        let pendingFiles = batch.map((file) => ({ ...file }));
        const maxRetryRounds = 2;

        for (let round = 0; round <= maxRetryRounds; round++) {
            if (pendingFiles.length === 0) break;
            if (round > 0) {
                console.log(`[AI] Retry round ${round}/${maxRetryRounds} for ${pendingFiles.length} ${batchLabel} files: ${pendingFiles.map((f) => f.path).join(", ")}`);
            }

            const results = await pMap(
                pendingFiles,
                async (file) => {
                    try {
                        if (callbacks?.onFileStart) await callbacks.onFileStart(file.path);
                        const singleResult = await generateSingleFile(file, plannedFiles, prompt, files);
                        if (callbacks?.onFileComplete) await callbacks.onFileComplete(file.path, singleResult.code);
                        return { success: true, file, result: singleResult };
                    } catch (error) {
                        return { success: false, file, error };
                    }
                },
                { concurrency: MAX_CONCURRENCY },
            );

            const rateLimitedEntry = results.find((entry) => !entry.success && isRateLimitError(entry.error));
            if (rateLimitedEntry) throw normalizeProviderError(rateLimitedEntry.error);

            const failedFiles = [];
            for (const entry of results) {
                if (entry.success) {
                    const filePath = entry.result.path.startsWith("/") ? entry.result.path : `/${entry.result.path}`;
                    files[filePath] = entry.result.code;
                } else {
                    console.warn(`[AI] File ${entry.file.path} failed in round ${round}: ${entry.error?.message || entry.error}`);
                    failedFiles.push(entry.file);
                }
            }
            pendingFiles = failedFiles;
        }

        if (pendingFiles.length > 0) {
            const failedPaths = pendingFiles.map((file) => file.path).join(", ");
            throw new Error(`Failed to generate ${batchLabel} files after all retry rounds: ${failedPaths}`);
        }
    }

    for (const [layerIndex, layer] of generationLayers.entries()) {
        await generateBatch(layer, `component layer ${layerIndex + 1}/${generationLayers.length}`);
    }
    if (styleFiles.length > 0) {
        console.log(`[AI] Phase 3: Generating ${styleFiles.length} stylesheet file(s) after component context is available`);
        await generateBatch(styleFiles, "stylesheet");
    }
    const repairResult = repairProjectFiles(files);
    Object.assign(files, repairResult.files);
    if (repairResult.warnings.length > 0) {
        console.log(`[ProjectRepair] Applied ${repairResult.warnings.length} project-level repairs`);
    }
    let quality = validateGeneratedProject(files);
    for (let round = 1; !quality.ok && round <= QUALITY_REPAIR_ROUNDS; round++) {
        const issueText = quality.issues
            .slice(0, 12)
            .map((issue) => `- ${issue.path}: ${issue.message}`)
            .join("\n");
        const issueSummaryForLog = quality.issues.slice(0, 6).map((issue) => `${issue.path}: ${issue.message}`).join("; ");
        console.warn(`[Quality] Validation found ${quality.issues.length} issue(s); requesting repair round ${round}/${QUALITY_REPAIR_ROUNDS}: ${issueSummaryForLog}`);

        const currentEntries = Object.fromEntries(
            Object.entries(files).map(([path, content]) => [path, {
                content,
                hash: hashContent(content),
            }]),
        );
        let repair;
        try {
            repair = await reviseProject(
                `The generated React project failed its automated validation. Fix only the reported issues and preserve the intended design.\n\nValidation issues:\n${issueText}`,
                createQualityManifest(currentEntries),
                files,
                [],
            );
        } catch (error) {
            console.warn(`[Quality] AI repair request failed: ${error.message || error}`);
            let regeneratedCount = 0;
            const issuePaths = [...new Set(quality.issues.map((issue) => issue.path))];
            for (const issuePath of issuePaths) {
                const plannedFile = plannedFiles.find((file) => {
                    const normalizedPath = file.path.startsWith("/") ? file.path : `/${file.path}`;
                    return normalizedPath === issuePath;
                });
                if (!plannedFile) continue;
                try {
                    const regenerated = await generateSingleFile(
                        plannedFile,
                        plannedFiles,
                        `${prompt}\n\nRepair this validation issue in ${issuePath}: ${issueText}`,
                        files,
                    );
                    const normalizedPath = regenerated.path.startsWith("/") ? regenerated.path : `/${regenerated.path}`;
                    files[normalizedPath] = regenerated.code;
                    regeneratedCount += 1;
                } catch (regenerationError) {
                    console.warn(`[Quality] Direct regeneration failed for ${issuePath}: ${regenerationError.message || regenerationError}`);
                }
            }
            quality = validateGeneratedProject(files);
            if (regeneratedCount === 0) break;
            continue;
        }
        const applied = applyOperations(currentEntries, repair.operations || []);        if (applied.errors.length > 0) {
            console.warn(`[Quality] Repair operation errors: ${applied.errors.join("; ")}`);
        }
        if (applied.applied.length === 0) break;

        const updatedFiles = Object.fromEntries(
            Object.entries(applied.files).map(([path, entry]) => [path, entry?.content || ""]),
        );
        const repaired = repairProjectFiles(updatedFiles);
        files = repaired.files;
        quality = validateGeneratedProject(files);
    }
    if (!quality.ok) {
        const issueSummary = quality.issues.slice(0, 8).map((issue) => `${issue.path}: ${issue.message}`).join("; ");
        throw new Error(`Generated project failed validation after ${QUALITY_REPAIR_ROUNDS} repair round(s): ${issueSummary}`);
    }
    if (!files["/App.js"]){
        throw new Error("AI did not generate /App.js entry point");
    }

    if (callbacks?.onDone) await callbacks.onDone({ files, repairResult, quality });

    return { files, description: plan.projectDescription, quality };
}

export async function reviseProject(prompt, manifest, relevantFiles, recentMessages){
    const contextParts = [];

    contextParts.push("## Current Project Files (manifest)");
    contextParts.push("```");
    for (const f of manifest) {
        contextParts.push(`${f.path} (${f.hash}, ${f.size}B)`)
    }
    contextParts.push("```");

    if(Object.keys(relevantFiles).length > 0){
        contextParts.push("\n## File Contents (for reference)");
        for (const [path, content] of Object.entries(relevantFiles)) {
        contextParts.push(`\n### ${path}\n\`\`\`\n${content}\n\`\`\``)
    }
    }

    if(recentMessages.length > 0){
        contextParts.push("\n## Recent Conversation");
        for (const msg of recentMessages.slice(-3)) {
        contextParts.push(`${msg.role}: ${msg.content}`)
    }
    }

    contextParts.push(`\n## Revision Request\n${prompt}`);

    console.log("[AI] Revising project...");

    const rawParsed = await requestStructuredObject({
        schema: RevisionResultSchema,
        system: REVISE_SYSTEM,
        prompt: contextParts.join("\n"),
        label: "project revision",
    });

    if(rawParsed && Array.isArray(rawParsed.operations)){
        rawParsed.operations = rawParsed.operations.map((op)=>{
            if(!op || typeof op !== "object") return op;

            let opStr = String(op.op || "").trim().toLowerCase();

            if(["create", "add", "new"].includes(opStr)) op.op = "create";
            else if (["update", "edit", "modify", "patch"].includes(opStr)) op.op = "update";
            else if (["delete", "remove", "del", "rm"].includes(opStr)) op.op = "delete";

            if(op.path && typeof op.path === "string" && !op.path.startsWith("/")){
                op.path = "/" + op.path;
            }

            if (op.content) op.content = normalizeContent(op.content);
            if (op.search) op.search = normalizeContent(op.search);
            if (op.replace) op.replace = normalizeContent(op.replace);

            if (op.op === "create" && op.content){
                const validation = validateRevisionContent(op.content, op.path, "create");
                op.content = validation.content;
                if(validation.warnings.length > 0){
                    console.log(`[Validator] Revision Create adjustments for ${op.path}:\n  - ${validation.warnings.join("\n  - ")}`);
                }
            }else if(op.op === "update" && op.replace){
                 const validation = validateRevisionContent(op.replace, op.path, "update");
                 op.replace = validation.content;
                 if(validation.warnings.length > 0){
                    console.log(`[Validator] Revision Update adjustments for ${op.path}:\n  - ${validation.warnings.join("\n  - ")}`);
                 }
            }
            return op;
        })
    }
    return rawParsed;
}
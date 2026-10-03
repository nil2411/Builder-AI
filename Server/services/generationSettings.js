import "dotenv/config";

const configuredConcurrency = Number.parseInt(process.env.AI_MAX_CONCURRENCY || "1", 10);
export const MAX_CONCURRENCY = Number.isFinite(configuredConcurrency) && configuredConcurrency > 0
    ? Math.min(configuredConcurrency, 2)
    : 1;

const configuredTemperature = Number.parseFloat(process.env.AI_TEMPERATURE || "0.3");
export const AI_TEMPERATURE = Number.isFinite(configuredTemperature)
    ? Math.min(Math.max(configuredTemperature, 0), 2)
    : 0.3;

const configuredMaxOutputTokens = Number.parseInt(process.env.AI_MAX_OUTPUT_TOKENS || "16000", 10);
export const AI_MAX_OUTPUT_TOKENS = Number.isFinite(configuredMaxOutputTokens) && configuredMaxOutputTokens > 0
    ? configuredMaxOutputTokens
    : 16000;

const configuredSeed = Number.parseInt(process.env.AI_SEED || "", 10);
export const AI_SEED = Number.isInteger(configuredSeed) ? configuredSeed : undefined;

const configuredTimeout = Number.parseInt(process.env.AI_REQUEST_TIMEOUT_MS || "180000", 10);
export const AI_REQUEST_TIMEOUT_MS = Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? configuredTimeout
    : 180000;

export const AI_USE_STRUCTURED_OUTPUT = process.env.AI_USE_STRUCTURED_OUTPUT !== "false";

const configuredRepairRounds = Number.parseInt(process.env.AI_QUALITY_REPAIR_ROUNDS || "2", 10);
export const QUALITY_REPAIR_ROUNDS = Number.isFinite(configuredRepairRounds) && configuredRepairRounds >= 0
    ? Math.min(configuredRepairRounds, 3)
    : 2;

export function generationSettings() {
    const settings = {
        maxRetries: 0,
        maxOutputTokens: AI_MAX_OUTPUT_TOKENS,
        temperature: AI_TEMPERATURE,
        timeout: AI_REQUEST_TIMEOUT_MS,
    };
    if (AI_SEED !== undefined) settings.seed = AI_SEED;
    return settings;
}

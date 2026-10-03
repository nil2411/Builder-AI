import mongoose from "mongoose";
import crypto from "node:crypto";
import { Project } from "../models/Project.js";
import { reviseProject } from "../services/ai.js";
import { applyOperations } from "../services/diff.js";
import { repairProjectFiles } from "../services/projectRepair.js";

// POST /api/projects/:id/chat
// Send a revision prompt and return the updated project.
function cryptoHash(content) {
    return crypto.createHash("md5").update(content).digest("hex").slice(0, 12);
}

export function buildManifest(files = {}) {
    return Object.entries(files).map(([path, entry]) => {
        const content = typeof entry?.content === "string" ? entry.content : "";
        return {
            path,
            hash: entry?.hash,
            size: content.length,
        };
    });
}

export async function chat(req, res) {
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";

    if (!prompt) {
        res.status(400).json({ error: "prompt is required" });
        return;
    }

    if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    if (!mongoose.isValidObjectId(req.params.id)) {
        res.status(400).json({ error: "Invalid project id" });
        return;
    }

    const project = await Project.findOne({
        _id: req.params.id,
        owner: req.user.userId,
    });

    if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
    }

    project.files = project.files ?? {};
    project.messages = project.messages ?? [];
    project.status = "revising";
    project.messages.push({
        role: "user",
        content: prompt,
        timestamp: new Date(),
    });
    await project.save();

    try {
        const manifest = buildManifest(project.files);
        const relevantFiles = Object.fromEntries(
            Object.entries(project.files).map(([path, entry]) => [
                path,
                typeof entry?.content === "string" ? entry.content : "",
            ]),
        );
        const recentMessages = project.messages.slice(-4).map((message) => ({
            role: message.role,
            content: message.content,
        }));

        console.log(
            "[AI] Revising project " + project._id + ': "' + prompt.slice(0, 80) + '..." ' +
            "(" + manifest.length + " files, manifest ~" + JSON.stringify(manifest).length + " chars)",
        );

        const result = await reviseProject(prompt, manifest, relevantFiles, recentMessages);
        const operations = result.operations ?? [];
        console.log("[AI] Got " + operations.length + " operations: " + result.description);

        const { files: updatedFiles, applied, errors } = applyOperations(
            project.files,
            operations,
        );

        if (errors.length > 0) {
            console.warn("[Diff] Errors applying operations:", errors);
        }

        const repairResult = repairProjectFiles(updatedFiles);
        project.files = Object.fromEntries(
            Object.entries(repairResult.files).map(([path, content]) => [path, {
                content,
                hash: cryptoHash(content),
            }]),
        );
        project.markModified("files");
        project.version = (project.version || 0) + 1;
        project.status = "completed";
        project.messages.push({
            role: "assistant",
            content: result.description + (errors.length > 0
                ? "\n\nSome operations failed: " + errors.join(", ")
                : ""),
        });

        await project.save();

        const files = Object.fromEntries(
            Object.entries(project.files).map(([path, entry]) => [
                path,
                typeof entry?.content === "string" ? entry.content : "",
            ]),
        );

        res.json({
            _id: project._id,
            name: project.name,
            description: project.description,
            files,
            messages: project.messages,
            version: project.version,
            status: project.status,
            applied,
            errors,
            aiDescription: result.description || "",
        });
    } catch (error) {
        console.error("[AI Revision Error] " + error.message);
        project.status = "failed";
        project.error = error.message || "Failed to process revision request";
        await project.save();
        res.status(500).json({
            error: error.message || "Failed to process revision request",
        });
    }
}
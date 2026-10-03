import crypto from 'node:crypto';
import mongoose from "mongoose";
import { Project } from "../models/Project.js";
import { generateProject } from "../services/ai.js";
import { repairProjectFiles } from "../services/projectRepair.js";


function hashContent(content) {
    return crypto.createHash("md5").update(content).digest("hex").slice(0, 12);
}
function hasInvalidProjectId(req, res) {
    if (!mongoose.isValidObjectId(req.params.id)) {
        res.status(400).json({ error: "Invalid project id" });
        return true;
    }
    return false;
}

function toFilesObject(files = {}) {
    return Object.fromEntries(
        Object.entries(files).map(([path, entry]) => [
            path,
            typeof entry?.content === "string" ? entry.content : "",
        ]),
    );
}

function startGeneration(projectId, prompt) {
    runBackgroundGeneration(projectId, prompt).catch((error) => {
        console.error(`[Background AI] Fatal generation error for project ${projectId}:`, error);
        Project.findByIdAndUpdate(projectId, {
            status: "failed",
            error: error.message || String(error),
        }).catch(() => {});
    });
}

// POST /api/projects
// Create a new project from AI prompt 
export async function createProject(req, res) {
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";

    if (!prompt || typeof prompt !== "string") {
        res.status(400).json({ error: "Prompt is required" });
        return;
    }

    if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    // Create project in DB immediately with "pending" status
    let project;
    try {
        project = await Project.create({
            name: "Planning project ...",
            description: prompt,
            files: {},
            messages: [
                { role: "user", content: prompt },
                { role: "assistant", content: 'Planning project structure ...' },
            ],
            version: 0,
            owner: req.user.userId,
            status: "pending",
            filesPlanned: [],
            filesGenerated: [],
            currentFile: null,
            error: null,
        });
    } catch (e) {
        res.status(500).json({ error: "Failed to create project" });
        return;
    }

    // Start background generation
    startGeneration(project._id.toString(), prompt);

    res.status(201).json({
        id: project._id,
        name: project.name,
        description: project.description,
        files: {},
        messages: project.messages,
        version: project.version,
        status: project.status,
        filesPlanned: project.filesPlanned,
        filesGenerated: project.filesGenerated,
        currentFile: project.currentFile,
        error: project.error,
        createdAt: project.createdAt,
    });
}

// POST /api/projects/:id/retry
// Start a clean generation attempt for a failed project using its original prompt.
export async function retryProject(req, res) {
    if (hasInvalidProjectId(req, res)) return;

    if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
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

    if (project.status !== "failed") {
        res.status(409).json({ error: "Only failed projects can be retried" });
        return;
    }

    const prompt = typeof project.description === "string" ? project.description.trim() : "";
    if (!prompt) {
        res.status(400).json({ error: "This project has no generation prompt to retry" });
        return;
    }

    project.name = "Planning project ...";
    project.files = {};
    project.filesPlanned = [];
    project.filesGenerated = [];
    project.currentFile = null;
    project.error = null;
    project.status = "pending";
    project.version = (project.version || 0) + 1;
    project.messages.push({
        role: "assistant",
        content: "Retrying generation with the latest AI configuration...",
        timestamp: new Date(),
    });
    project.markModified("files");
    await project.save();

    startGeneration(project._id.toString(), prompt);

    res.status(202).json({
        id: project._id,
        name: project.name,
        description: project.description,
        files: {},
        messages: project.messages,
        version: project.version,
        status: project.status,
        filesPlanned: project.filesPlanned,
        filesGenerated: project.filesGenerated,
        currentFile: project.currentFile,
        error: project.error,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
    });
}

// Background worker to progressively generate files and update database in real-time
export async function runBackgroundGeneration(projectId, prompt) {
    try {
        console.log(`[Background AI] Starting generation for project ${projectId}`);
        await generateProject(prompt, {
            onPlan: async (plan) => {
                console.log(`[Background AI] Plan created for project ${projectId}. Planned ${plan.files.length} files.`);
                const fileList = plan.files.map((f) => `- ${f.path}: ${f.description}`).join("\n");

                await Project.findByIdAndUpdate(projectId, {
                    name: plan.projectName,
                    status: "generating",
                    filesPlanned: plan.files,
                    $push: {
                        messages: {
                            role: "assistant",
                            content: `Planned website structure: \n${fileList}`,
                            timestamp: new Date(),
                            note: "Generated Project"
                        }
                    }
                });
            },

            onFileStart: async (path) => {
                console.log(`[Background AI] Starting file ${path} for project ${projectId}`);
                await Project.findByIdAndUpdate(projectId, {
                    currentFile: path
                });
            },

            onFileComplete: async (path, code) => {
                console.log(`[Background AI] Finished file ${path} for project ${projectId}`);

                const project = await Project.findById(projectId);
                if (project) {
                    if (!project.files) project.files = {};
                    project.files[path] = {
                        content: code,
                        hash: hashContent(code)
                    };
                    if (!project.filesGenerated) project.filesGenerated = [];
                    if (!project.filesGenerated.includes(path)) {
                        project.filesGenerated.push(path);
                    }
                    if (!project.messages) project.messages = [];
                    project.messages.push({
                        role: "assistant",
                        content: `Created file "${path}"`,
                        timestamp: new Date(),
                    });

                    project.currentFile = null;
                    project.markModified("files");
                    project.markModified("filesGenerated");
                    project.markModified("messages");
                    await project.save();
                }
            },

            onError: async (error) => {
                console.error(`[Background AI] Error during generation for project ${projectId}:`, error);
                await Project.findByIdAndUpdate(projectId, {
                    status: "failed",
                    error: error.message || String(error)
                });
            },

            onDone: async ({ files } = {}) => {
                const project = await Project.findById(projectId);
                if (project) {
                    if (files && typeof files === "object") {
                        project.files = Object.fromEntries(
                            Object.entries(files).map(([path, content]) => [path, {
                                content: typeof content === "string" ? content : "",
                                hash: hashContent(typeof content === "string" ? content : ""),
                            }]),
                        );
                        project.filesGenerated = Object.keys(project.files);
                        project.markModified("files");
                        project.markModified("filesGenerated");
                    }
                    project.status = "completed";
                    project.currentFile = null;
                    await project.save();
                }
                console.log(`[Background AI] Generation complete for project ${projectId}`);
            }
        });
    } catch (error) {
        console.error(`[Background AI] Fatal error for project ${projectId}:`, error);
        await Project.findByIdAndUpdate(projectId, {
            status: "failed",
            error: error.message || String(error)
        });
    }
}

    



//GET /api/projects

//list all the projects owned by the user (summary omly ,no file contents)
export async function listProjects(req, res) {

    if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;

    }

    const projects = await Project.find(
        { owner: req.user.userId },
        { name: 1, description: 1, version: 1, createdAt: 1, updatedAt: 1 }
    ).sort({ updatedAt: -1 });

    res.json(projects)



}

//GET /api/projects/:id

//get full project details
export async function getProject(req, res) {
    if (hasInvalidProjectId(req, res)) return;

    if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;

    }

    const project = await Project.findOne({
        _id: req.params.id, owner: req.
            user.userId
    })

    if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
    }

    const filesObj = toFilesObject(project.files);

    res.json({
        id: project._id,
        name: project.name,
        description: project.description,
        files: filesObj,
        messages: project.messages,
        version: project.version,
        status: project.status,
        filesPlanned: project.filesPlanned,
        filesGenerated: project.filesGenerated,
        currentFile: project.currentFile,
        error: project.error,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,


    })




}

//DELETE  /api/projects/:id

//Delete a project
export async function deleteProject(req, res) {
    if (hasInvalidProjectId(req, res)) return;

    if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;

    }
    const result = await Project.findOneAndDelete({
        _id: req.params.id,
        owner: req.user.userId
    })
    if (!result) {
        res.status(404).json({ error: "Project not found" });
        return;
    }
    res.json({ success: true })



}

//PUT  /api/projects/:id

//Update project files (manual edits)
export async function updateProjectFiles(req, res) {
    if (hasInvalidProjectId(req, res)) return;


    const { files } = req.body ?? {};
    if (!files || typeof files !== "object" || Array.isArray(files)) {
        res.status(400).json({ error: "files object is required" });
        return

    }

    if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    const project = await Project.findOne({ _id: req.params.id, owner: req.user.userId })

    if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
    }

    // Normalize and repair the whole project before saving manual edits. This
    // keeps JSX, imports, and styles consistent even when the editor receives
    // code from an older generation.
    const repairResult = repairProjectFiles(files);
    const newFiles = Object.fromEntries(
        Object.entries(repairResult.files).map(([path, content]) => [path, {
            content,
            hash: hashContent(content),
        }]),
    );

    const previousFiles = toFilesObject(project.files);
    const filePaths = new Set([...Object.keys(previousFiles), ...Object.keys(newFiles)]);
    const filesChanged = [...filePaths].some((path) => previousFiles[path] !== newFiles[path]);

    if (filesChanged) {
        project.files = newFiles;
        project.version = (project.version || 0) + 1;
        project.markModified("files");
        await project.save();
    }
    const filesObj = toFilesObject(project.files);

    res.json({
        id: project._id,
        name: project.name,
        description: project.description,
        files: filesObj,
        messages: project.messages,
        version: project.version,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,

    });





}

//POST  /api/projects/:id/publish

//Mark a project as publicly published
export async function publishProject(req, res) {
    if (hasInvalidProjectId(req, res)) return;

    if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    const project = await Project.findOneAndUpdate(
        { _id: req.params.id, owner: req.user.userId },
        { published: true },
        { new: true }

    )

    if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
    }
    res.json({ success: true, published: project.published });



}

//POST  /api/project/public/:id

//Mark a project as publicly published details (without auth)
export async function getPublicProject(req, res) {
    if (hasInvalidProjectId(req, res)) return;


    const project = await Project.findById(req.params.id);
    if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
    }

    if (!project.published) {
        res.status(403).json({ error: "Project is not published yet" });
        return;
    }

    const filesObj = toFilesObject(project.files);

    res.json({
        id: project._id,
        name: project.name,
        description: project.description,
        files: filesObj,
        version: project.version,




    })
}


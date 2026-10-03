import { z } from "zod";

const FileImportSchema = z.union([
    z.string(),
    z.object({
        path: z.string(),
        import: z.string().nullable().optional(),
    }).transform(({ path }) => path),
]);


export const GenerationResultSchema = z.object({
    files: z.record(z.string(),  z.string()),
    description: z.string().default('Generated project')
})

const FileOperationSchema = z.string().transform((value) => {
    const normalized = value.trim().toLowerCase();
    if (["create", "add", "new"].includes(normalized)) return "create";
    if (["update", "edit", "modify", "patch", "replace"].includes(normalized)) return "update";
    if (["delete", "remove", "del", "rm"].includes(normalized)) return "delete";
    return normalized;
}).pipe(z.enum(["create", "update", "delete"]));

export const FileOpSchema = z.object({
    op: FileOperationSchema,
    path: z.string(),
    content: z.string().nullable().optional(),
    search: z.string().nullable().optional(),
    replace: z.string().nullable().optional(),
})

export const RevisionResultSchema = z.object({
    operations: z.array(FileOpSchema),
    description: z.string().default('Applied revisions')
})

export const FilePlanSchema = z.object({
    files: z.array(
        z.object({
            path: z.string(),
            description: z.string(),
            // Stylesheets and asset files have no JavaScript export. Some
            // providers express that as null or an array of declarations.
            // Normalize these equivalent representations before the generation pipeline consumes the plan.
            exports: z.union([z.string(), z.array(z.string())]).nullable().optional().transform((value) => {
                if (Array.isArray(value)) return value.join(", ");
                return value ?? "";
            }),
            imports: z.array(FileImportSchema).nullable().optional().transform((value) => value ?? []),
        })
    ),
    projectName: z.string().default('Generated Project'),
    projectDescription: z.string().default('A React project')
})

export const FileCodeSchema = z.object({
    code: z.string(),
})
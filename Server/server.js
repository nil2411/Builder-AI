import "dotenv/config";
import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import { connectDB } from "./config/db.js";
import authRouter from "./Routes/authRoutes.js";
import projectRouter from "./Routes/ProjectRoutes.js";

const app = express();

const configuredOrigins = [
    process.env.ORIGINS,
    process.env.ORIGIN,
    process.env.FRONTEND_URL,
]
    .filter(Boolean)
    .flatMap((origins) => origins.split(","))
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);

const localOrigins = process.env.NODE_ENV === "production"
    ? []
    : [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ];

// Keep the deployed frontend available even if ORIGINS was not added to Vercel
// yet. Additional preview/custom frontend URLs should still be configured via
// ORIGINS or FRONTEND_URL instead of allowing every *.vercel.app origin.
const deployedFrontendOrigin = "https://builder-ai-rouge.vercel.app";
const allowedOrigins = new Set([
    ...configuredOrigins,
    ...localOrigins,
    deployedFrontendOrigin,
]);

const corsOptions = {
    credentials: true,
    origin(origin, callback) {
        const normalizedOrigin = origin?.replace(/\/$/, "");
        if (!normalizedOrigin || allowedOrigins.has(normalizedOrigin)) {
            callback(null, true);
            return;
        }

        callback(new Error("Origin not allowed by CORS"));
    },
};

// CORS must run before database initialization so browser preflight requests
// receive the required headers even when MongoDB is unavailable or slow.
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));

app.get("/", (_req, res) => res.send("server is live!"));

// Vercel keeps the Express app warm between requests, so connect lazily and
// reuse Mongoose's connection rather than blocking module initialization.
app.use("/api", async (_req, _res, next) => {
    try {
        await connectDB();
        next();
    } catch (error) {
        next(error);
    }
});

app.use("/api/auth", authRouter);
app.use("/api/projects", projectRouter);

app.use((_req, res) => {
    res.status(404).json({ success: false, message: "Route not found" });
});

app.use((err, _req, res, next) => {
    if (res.headersSent) {
        next(err);
        return;
    }

    const status = err.type === "entity.too.large"
        ? 413
        : err.message === "Origin not allowed by CORS"
            ? 403
            : 500;

    console.error("[Error] " + err.message);
    res.status(status).json({
        success: false,
        message: status === 500 ? "Internal Server Error" : err.message,
    });
});

export default app;

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
}

if (!process.env.VERCEL) {
    app.listen(port, () => {
        console.log("Server is running at http://localhost:" + port);
    });
}

import mongoose from "mongoose";
import "dotenv/config";

let listenersRegistered = false;

export async function connectDB() {
    const uri = process.env.MONGODB_URL?.trim();
    if (!uri) {
        throw new Error("MONGODB_URL is not configured");
    }

    if (!listenersRegistered) {
        mongoose.connection.on("connected", () => {
            console.log("Connected to MongoDB");
        });
        mongoose.connection.on("error", (error) => {
            console.error("[MongoDB] " + error.message);
        });
        listenersRegistered = true;
    }

    if (mongoose.connection.readyState === 1) {
        return;
    }

    await mongoose.connect(uri);
}
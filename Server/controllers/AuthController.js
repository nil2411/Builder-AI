import "dotenv/config";
import { User } from "../models/user.js";
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET?.trim();
const isProduction = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
const sessionCookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/",
};

// Helper to set cookie
const setSessionCookie = (res, payload) => {
    if (!JWT_SECRET) {
        throw new Error("JWT_SECRET is not configured");
    }
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
    res.cookie("token", token, sessionCookieOptions);
};

export async function register(req, res) {
    const { name, email, password } = req.body ?? {};

    if ([name, email, password].some((value) => typeof value !== "string" || !value.trim())) {
        res.status(400).json({ error: "All fields are required" });
        return;
    }

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const existing = await User.findOne({ email: trimmedEmail });

    if (existing) {
        res.status(400).json({ error: "User already exists" });
        return;
    }

    const user = await User.create({ name: trimmedName, email: trimmedEmail, password });

    setSessionCookie(res, { userId: user._id.toString(), email: user.email });

    res.status(201).json({
        user: {
            _id: user._id,
            name: user.name,
            email: user.email,
        }
    });
}

export async function login(req, res) {
    const { email, password } = req.body ?? {};

    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
        res.status(400).json({ error: "Email and password are required" });
        return;
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
    }

    const isValid = await user.comparePassword(password);
    if (!isValid) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
    }

    setSessionCookie(res, { userId: user._id.toString(), email: user.email });

    res.status(200).json({
        user: {
            _id: user._id,
            name: user.name,
            email: user.email,
        }
    });
}

export async function logout(req, res) {
    res.cookie("token", "", { ...sessionCookieOptions, maxAge: 0 });
    res.json({ success: true });
}

export async function me(req, res) {
    if (!req.user) {
        res.status(401).json({ error: "Not authenticated" });
        return;
    }

    const user = await User.findById(req.user.userId).select("-password");
    if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
    }

    res.json({ user });
}

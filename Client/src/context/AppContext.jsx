/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api from "../api/api";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import debounce from "lodash.debounce";

const AppContext = createContext(undefined);

function normalizeProject(project) {
    if (!project) return null;

    const normalized = {
        ...project,
        _id: project._id ?? project.id,
        files: project.files ?? {},
        messages: project.messages ?? [],
    };

    if (project.status != null) {
        normalized.status = String(project.status).toLowerCase();
    }

return normalized;
}

function hasVisibleProjectChange(previous, next) {
    if (!previous) return true;

    const previousFiles = Object.keys(previous.files ?? {});
    const nextFiles = Object.keys(next.files ?? {});
    const previousGenerated = previous.filesGenerated ?? [];
    const nextGenerated = next.filesGenerated ?? [];

    return (
        previous.status !== next.status ||
        previous.version !== next.version ||
        previous.currentFile !== next.currentFile ||
        previous.error !== next.error ||
        previousFiles.length !== nextFiles.length ||
        previous.filesPlanned?.length !== next.filesPlanned?.length ||
        previousGenerated.length !== nextGenerated.length ||
        previousGenerated.some((path, index) => path !== nextGenerated[index]) ||
        previous.messages?.length !== next.messages?.length
    );
}

export function AppContextProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loadingUser, setLoadingUser] = useState(true);
    const [projects, setProjects] = useState([]);
    const [loadingProjects, setLoadingProjects] = useState(true);
    const [activeProject, setActiveProject] = useState(null);
    const [loadingActiveProject, setLoadingActiveProject] = useState(true);
    const [chatLoading, setChatLoading] = useState(false);
    const [generatingProject, setGeneratingProject] = useState(false);
    const [retryingProject, setRetryingProject] = useState(false);
    const [activeFile, setActiveFile] = useState("/App.js");
    const [showCode, setShowCode] = useState(false);
    const navigate = useNavigate();

    const checkSession = useCallback(async () => {
        try {
            const { data } = await api.get("/api/auth/me");
            setUser(data.user);
        } catch {
            setUser(null);
        } finally {
            setLoadingUser(false);
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        checkSession();
    }, [checkSession]);

    const login = useCallback(async (email, password) => {
        try {
            const { data } = await api.post("/api/auth/login", { email, password });
            setUser(data.user);
            toast.success("Welcome back!");
            navigate("/");
        } catch (error) {
            const message = error?.response?.data?.error || "Invalid email or password";
            toast.error(message);
            throw new Error(message, { cause: error });
        }
    }, [navigate]);

    const register = useCallback(async (name, email, password) => {
        try {
            const { data } = await api.post("/api/auth/register", { name, email, password });
            setUser(data.user);
            toast.success("Account created successfully!");
            navigate("/");
        } catch (error) {
            const message = error?.response?.data?.error || "Registration failed";
            toast.error(message);
            throw new Error(message, { cause: error });
        }
    }, [navigate]);

    const logout = useCallback(async () => {
        try {
            await api.post("/api/auth/logout");
        } catch (error) {
            console.error("Logout failed:", error);
        } finally {
            setUser(null);
            setProjects([]);
            setActiveProject(null);
            toast.success("Logged out successfully");
            navigate("/login");
        }
    }, [navigate]);

    const loadProjects = useCallback(async () => {
        if (!user) {
            setProjects([]);
            setLoadingProjects(false);
            return;
        }

        setLoadingProjects(true);
        try {
            const { data } = await api.get("/api/projects");
            setProjects(Array.isArray(data) ? data.map(normalizeProject) : []);
        } catch (error) {
            console.error("Failed to list projects:", error);
            toast.error(error?.response?.data?.error || "Failed to load projects");
            setProjects([]);
        } finally {
            setLoadingProjects(false);
        }
    }, [user]);

    const loadProject = useCallback(async (id, silent = false) => {
        if (!user || !id) {
            if (!silent) setLoadingActiveProject(false);
            return;
        }

        if (!silent) setLoadingActiveProject(true);

        try {
            const { data } = await api.get("/api/projects/" + id);
            const project = normalizeProject(data);

            setActiveProject((previous) => (
                hasVisibleProjectChange(previous, project) ? project : previous
            ));

            const files = Object.keys(project.files);
            if (files.length > 0) {
                setActiveFile((previous) => {
                    if (files.includes(previous)) return previous;
                    return files.includes("/App.js") ? "/App.js" : files[0];
                });
            }
        } catch (error) {
            console.error("Failed to load project:", error);
            if (!silent) {
                toast.error(error?.response?.data?.error || "Failed to load project");
                navigate("/");
            }
        } finally {
            if (!silent) setLoadingActiveProject(false);
        }
    }, [navigate, user]);

    useEffect(() => {
        if (!activeProject?._id || !user) return undefined;

        const status = (activeProject.status || "").toLowerCase();
        const ongoing = ["pending", "generating", "revising"].includes(status);

        if (!ongoing) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setChatLoading(false);
            return undefined;
        }

        setChatLoading(true);
        const interval = setInterval(() => {
            loadProject(activeProject._id, true);
        }, 2000);

        return () => clearInterval(interval);
    }, [activeProject?._id, activeProject?.status, loadProject, user]);

    const handleGenerate = useCallback(async (prompt) => {
        if (!user) {
            toast.error("Sign in to create a project");
            navigate("/login");
            return;
        }

        const trimmedPrompt = typeof prompt === "string" ? prompt.trim() : "";
        if (!trimmedPrompt) {
            toast.error("Describe the project you want to build");
            return;
        }

        setGeneratingProject(true);
        try {
            const { data } = await api.post("/api/projects", { prompt: trimmedPrompt });
            const projectId = data?._id ?? data?.id;

            if (!projectId) {
                throw new Error("The server did not return a project id");
            }

            setProjects((previous) => [
                normalizeProject({ ...data, _id: projectId }),
                ...previous.filter((project) => project._id !== projectId),
            ]);
            toast.success("AI agent is planning the project...");
            navigate("/builder/" + projectId);
        } catch (error) {
            console.error("Failed to generate project:", error);
            toast.error(error?.response?.data?.error || error.message || "Failed to generate project");
        } finally {
            setGeneratingProject(false);
        }
    }, [navigate, user]);

    const handleRetry = useCallback(async () => {
        if (!activeProject?._id || !user || (activeProject.status || "").toLowerCase() !== "failed") return;

        setRetryingProject(true);
        try {
            const { data } = await api.post("/api/projects/" + activeProject._id + "/retry");
            const project = normalizeProject(data);

            setActiveProject(project);
            setActiveFile("/App.js");
            setShowCode(false);
            setProjects((previous) => previous.map((item) => (
                item._id === project._id
                    ? { ...item, name: project.name, version: project.version, updatedAt: project.updatedAt }
                    : item
            )));
            toast.success("Retry started. The AI agent is planning the project...");
        } catch (error) {
            console.error("Failed to retry project generation:", error);
            toast.error(error?.response?.data?.error || "Could not retry project generation");
        } finally {
            setRetryingProject(false);
        }
    }, [activeProject, user]);
    const handleDelete = useCallback(async (id) => {
        if (!user || !id) return;

        try {
            await api.delete("/api/projects/" + id);
            setProjects((previous) => previous.filter((project) => project._id !== id));
            if (activeProject?._id === id) {
                setActiveProject(null);
            }
            toast.success("Project deleted successfully");
        } catch (error) {
            console.error("Failed to delete project:", error);
            toast.error(error?.response?.data?.error || "Failed to delete project");
        }
    }, [activeProject, user]);

    const handleChat = useCallback(async (prompt) => {
        if (!activeProject?._id || !user) return;

        const trimmedPrompt = typeof prompt === "string" ? prompt.trim() : "";
        if (!trimmedPrompt) return;

        setChatLoading(true);
        try {
            const { data } = await api.post(
                "/api/projects/" + activeProject._id + "/chat",
                { prompt: trimmedPrompt },
            );
            const project = normalizeProject(data);
            setActiveProject(project);
            setProjects((previous) => previous.map((item) => (
                item._id === project._id
                    ? { ...item, name: project.name, version: project.version, updatedAt: project.updatedAt }
                    : item
            )));

            if (project.errors?.length > 0) {
                toast.error(project.errors.length + " revision patch(es) failed");
            } else {
                toast.success("Updated to version " + project.version);
            }
        } catch (error) {
            console.error("Revision request failed:", error);
            toast.error(error?.response?.data?.error || "Revision request failed");
        } finally {
            setChatLoading(false);
        }
    }, [activeProject, user]);

    const debouncedSave = useMemo(
        () => debounce(async (files, id) => {
            try {
                const { data } = await api.put("/api/projects/" + id + "/files", { files });
                const savedProject = normalizeProject(data);
                setActiveProject((previous) => {
                    if (!previous) return previous;
                    const nextProject = {
                        ...previous,
                        ...savedProject,
                        _id: previous._id,
                    };
                    // A no-op PUT must not create a new active-project object.
                    // This prevents the preview watcher from treating its own
                    // response as another file-change event.
                    return hasVisibleProjectChange(previous, nextProject) ? nextProject : previous;
                });
            } catch (error) {
                console.error("Failed to auto-save files:", error);
                toast.error(error?.response?.data?.error || "Failed to save code changes");
            }
        }, 1000),
        [],
    );

    useEffect(() => () => {
        debouncedSave.flush();
        debouncedSave.cancel();
    }, [debouncedSave]);

    const updateProjectFiles = useCallback((files) => {
        if (!activeProject?._id || !user) return;
        debouncedSave(files, activeProject._id);
    }, [activeProject, debouncedSave, user]);

    return (
        <AppContext.Provider value={{
            user,
            loadingUSer: loadingUser,
            login,
            register,
            logout,
            projects,
            loadingprojects: loadingProjects,
            activeprojects: activeProject,
            loadingactiveprojects: loadingActiveProject,
            chatloading: chatLoading,
            generatingProject,
            retryingProject,
            activeFile,
            showcode: showCode,
            setActiveFile,
            setShowCode,
            loadProject,
            loadprojects: loadProjects,
            handleGenerate,
            handleRetry,
            handleDelete,
            setProjects,
            handleChat,
            updateProjectFiles,
        }}>
            {children}
        </AppContext.Provider>
    );
}

export function useAppContext() {
    const context = useContext(AppContext);

    if (context === undefined) {
        throw new Error("useAppContext must be used within an AppContextProvider");
    }

    return context;
}
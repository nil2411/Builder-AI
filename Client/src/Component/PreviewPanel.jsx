import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SandpackProvider, useSandpack, SandpackLayout, SandpackCodeEditor, SandpackPreview } from '@codesandbox/sandpack-react'
import { createSandpackFiles, detectDependencies, getPreviewEntry, normalizePreviewCode, SANDPACK_BUNDLER_URL } from '../utils/sandpackUtils';
import { useAppContext } from '../context/AppContext';
import SandpackErrorMonitor from './SandpackErrorMonitor';

function getFileCode(content) {
    if (typeof content === "string") return content;
    return content?.content || content?.code || "";
}

// Watches for file edits inside sandpack editor and saves changes to DB & live state
function SandpackFileWatcher({ onLiveFilesChange }) {
    const { sandpack } = useSandpack();
    const { files } = sandpack;
    const { activeprojects: activeProject, updateProjectFiles } = useAppContext();

    const activeProjectRef = useRef(activeProject);
    const updateProjectFilesRef = useRef(updateProjectFiles);
    const onLiveFilesChangeRef = useRef(onLiveFilesChange);
    const hasHydratedRef = useRef(false);

    // Keep the latest values available without making the Sandpack file watcher
    // re-run merely because the parent context produced a new callback/object.
    useEffect(() => {
        activeProjectRef.current = activeProject;
        updateProjectFilesRef.current = updateProjectFiles;
        onLiveFilesChangeRef.current = onLiveFilesChange;
    }, [activeProject, updateProjectFiles, onLiveFilesChange]);

    useEffect(() => {
        const project = activeProjectRef.current;
        if (!project) return;
        const updatedFiles = {};
        let hasChanges = false;

        for (const [path, fileObj] of Object.entries(files || {})) {
            // Sandpack injects its own preview document and template files. Only
            // persist files that already belong to the generated project.
            if (path === "/public/index.html" || project.files?.[path] === undefined) {
                continue;
            }

            const fileCode = fileObj?.code ?? "";
            updatedFiles[path] = fileCode;
            const storedCode = normalizePreviewCode(project.files?.[path], path);
            const hydratedCode = normalizePreviewCode(fileCode, path);
            // Sandpack trims/normalizes source during hydration. Compare the
            // canonical text so preview boot does not look like a user edit.
            if (storedCode !== hydratedCode) {
                hasChanges = true;
            }
        }

        onLiveFilesChangeRef.current(updatedFiles);
        // The first files event is Sandpack hydration, never a user edit.
        if (!hasHydratedRef.current) {
            hasHydratedRef.current = true;
            return;
        }
        if (hasChanges) {
            updateProjectFilesRef.current(updatedFiles);
        }
    }, [files])

    return null;
}

const PreviewPanel = ({ project, activeFile, showCode }) => {
    const [showErrorOverlay, setShowErrorOverlay] = useState(true);
    const initialProjectKey = `${project._id}-${project.version}`;
    const [liveFilesState, setLiveFilesState] = useState({
        key: initialProjectKey,
        files: project.files,
    });

    const currentKey = `${project._id}-${project.version}`;
    const previewFiles = liveFilesState.key === currentKey ? liveFilesState.files : project.files;

    const handleLiveFilesChange = useCallback((newFiles) => {
        setLiveFilesState((previous) => {
            const previousFiles = previous.key === currentKey ? previous.files : project.files;
            let changed = false;
            for (const [p, code] of Object.entries(newFiles)) {
                if (getFileCode(previousFiles?.[p]).trim() !== String(code ?? "").trim()) {
                    changed = true;
                    break;
                }
            }
            return changed ? { key: currentKey, files: newFiles } : previous;
        });
    }, [currentKey, project.files])

    const sandpackFiles = useMemo(
        () => createSandpackFiles(previewFiles, activeFile),
        [previewFiles, activeFile],
    );

    const dependencies = useMemo(() => {
        return detectDependencies(previewFiles)
    }, [previewFiles])

    const previewEntry = useMemo(() => getPreviewEntry(previewFiles), [previewFiles]);

    return (
        <div className='w-full h-full'>
            <SandpackProvider
                key={currentKey}
                template='react'
                files={sandpackFiles}
                customSetup={{ dependencies, entry: previewEntry }}
                options={{
                    bundlerURL: SANDPACK_BUNDLER_URL,

                    classes: {
                        "sp-wrapper": "sp-wrapper",
                        "sp-layout": "sp-layout",
                        "sp-preview": "sp-preview",
                    },
                    logLevel: 0,
                }}
                theme={{
                    colors: {
                        surface1: "#ffffff",
                        surface2: "#f4f4f5",
                        surface3: "#e4e4e7",
                        clickable: "#71717a",
                        base: "#09090b",
                        disabled: "#a1a1aa",
                        hover: "#18181b",
                        accent: "#18181b",
                        error: "#ef4444",
                        errorSurface: "#fef2f2"
                    },
                    font: {
                        body: "'Urbanist', system-ui, -apple-system, sans-serif",
                        mono: "'Geist Mono', ui-monospace, monospace",
                        size: "13px",
                        lineHeight: "1.6",
                    }
                }}
            >
                <SandpackFileWatcher onLiveFilesChange={handleLiveFilesChange} />
                <SandpackErrorMonitor onErrorChange={setShowErrorOverlay} />
                <SandpackLayout
                    style={{
                        height: "100%",
                        border: "none",
                        borderRadius: 0,
                        background: "transparent"
                    }}
                >
                    {showCode && (
                        <SandpackCodeEditor showTabs showLineNumbers showInlineErrors wrapContent style={{ height: "100%", flex: 1, minWidth: 0 }} />
                    )}
                    <SandpackPreview showNavigator={false} showRefreshButton showOpenInCodeSandbox={false} showSandpackErrorOverlay={showErrorOverlay} />
                </SandpackLayout>
            </SandpackProvider>
        </div>
    )
}

export default PreviewPanel

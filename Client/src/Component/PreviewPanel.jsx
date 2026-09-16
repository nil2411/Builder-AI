import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SandpackProvider, useSandpack, SandpackLayout, SandpackCodeEditor, SandpackPreview } from '@codesandbox/sandpack-react'
import { detectDependencies } from '../utils/sandpackUtils';
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

    useEffect(() => {
        activeProjectRef.current = activeProject;
    }, [activeProject])

    useEffect(() => {
        const project = activeProjectRef.current;
        if (!project) return;
        const updatedFiles = {};
        let hasChanges = false;

        for (const [path, fileObj] of Object.entries(files || {})) {
            const fileCode = fileObj?.code ?? "";
            updatedFiles[path] = fileCode;
            if (project.files?.[path] !== undefined && getFileCode(project.files[path]) !== fileCode) {
                hasChanges = true;
            }
        }

        onLiveFilesChange(updatedFiles);
        if (hasChanges) {
            updateProjectFiles(updatedFiles);
        }
    }, [files, onLiveFilesChange, updateProjectFiles])

    return null;
}

const PreviewPanel = ({ project, activeFile, showCode }) => {
    const [showErrorOverlay, setShowErrorOverlay] = useState(true);
    const [liveFiles, setLiveFiles] = useState(project.files);
    const [prevProjectKey, setPrevProjectKey] = useState(`${project._id}-${project.version}`);

    const currentKey = `${project._id}-${project.version}`;

    if (prevProjectKey !== currentKey) {
        setPrevProjectKey(currentKey);
        setLiveFiles(project.files);
    }

    const handleLiveFilesChange = useCallback((newFiles) => {
        setLiveFiles((prev) => {
            const prevFiles = prev || {};
            let changed = false;
            for (const [p, code] of Object.entries(newFiles)) {
                if (getFileCode(prevFiles[p]) !== code) {
                    changed = true;
                    break;
                }
            }
            return changed ? newFiles : prev
        })
    }, [])

    const sandpackFiles = useMemo(() => {
        const spFiles = {};

        for (const [path, content] of Object.entries(liveFiles || {})) {
            spFiles[path] = {
                code: getFileCode(content),
                active: path === activeFile
            }
        }
        return spFiles;
    }, [liveFiles, activeFile])

    const dependencies = useMemo(() => {
        return detectDependencies(liveFiles)
    }, [liveFiles])

    return (
        <div className='w-full h-full'>
            <SandpackProvider
                key={currentKey}
                template='react'
                files={sandpackFiles}
                customSetup={{ dependencies }}
                options={{
                    externalResources: [
                        "https://cdn.tailwindcss.com",
                        "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css",
                    ],
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

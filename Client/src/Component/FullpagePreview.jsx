import React from 'react'
import { useState,useMemo} from 'react';
import { detectDependencies } from '../utils/sandpackUtils';
import { SandpackLayout, SandpackPreview, SandpackProvider } from '@codesandbox/sandpack-react';
import SandpackErrorMonitor from './SandpackErrorMonitor';

function getFileCode(content) {
    if (typeof content === "string") return content;
    return content?.content || content?.code || "";
}

const FullpagePreview = ({ files }) => {

    const [showErrorOverlay, setShowErrorOverlay] = useState(true);


    const sandpackFiles = useMemo(() => {
        if(!files) return {};   
        const spFiles = {};

        for (const [path, content] of Object.entries(files || {})) {
            spFiles[path] = {
                code: getFileCode(content)
            }
        }
        return spFiles;
    }, [files])

    const dependencies = useMemo(() => {
        if(!files) return {};
        return detectDependencies(files)
    }, [files])
    return (
        <div className='h-screen w-screen bg-white overflow-hidden'>
            <SandpackProvider
                template='react'
                files={sandpackFiles}
                customSetup={{ dependencies }}
                options={{
                    externalResources: [
                        "https://cdn.tailwindcss.com",
                        "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css",
                    ],
                    logLevel: 0,
                }}
                className='h-full w-full'
                
            >
                <SandpackErrorMonitor onErrorChange={setShowErrorOverlay} />
                <SandpackLayout
                    className = "h-full w-full border-none bg-transparent! "
                    style={{ height: "100%", border: "none", borderRadius: 0, background: "transparent" }}
                >
                   
                    <SandpackPreview showNavigator={false} showRefreshButton = {false} showOpenInCodeSandbox={false} showSandpackErrorOverlay = {showErrorOverlay} className='h-full w-full'/>
                </SandpackLayout>
            </SandpackProvider>
        </div>
    )
}

export default FullpagePreview

import { useState,useMemo} from 'react';
import { createSandpackFiles, detectDependencies, getPreviewEntry, SANDPACK_BUNDLER_URL } from '../utils/sandpackUtils';
import { SandpackLayout, SandpackPreview, SandpackProvider } from '@codesandbox/sandpack-react';
import SandpackErrorMonitor from './SandpackErrorMonitor';


const FullpagePreview = ({ files }) => {

    const [showErrorOverlay, setShowErrorOverlay] = useState(true);


    const sandpackFiles = useMemo(() => createSandpackFiles(files), [files]);

    const dependencies = useMemo(() => {
        if(!files) return {};
        return detectDependencies(files)
    }, [files])
    const previewEntry = useMemo(() => getPreviewEntry(files), [files]);
    return (
        <div className='h-screen w-screen bg-white overflow-hidden'>
            <SandpackProvider
                template='react'
                files={sandpackFiles}
                customSetup={{ dependencies, entry: previewEntry }}
                options={{
                    bundlerURL: SANDPACK_BUNDLER_URL,

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

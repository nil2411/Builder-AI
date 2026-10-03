import { ArrowLeftIcon, EyeIcon, Code2Icon, ExternalLinkIcon ,Loader2Icon ,GlobeIcon,DownloadIcon} from 'lucide-react'
import logo from '../public/logo.svg'

const BuilderHeader = ({
    projectName,
    version,
    showCode,
    publishing,
    onToggleShowCode,
    onOpenPreview,
    onPublish,
    onDownload,
    onBack,
    onLogout,
}) => {
    return (
        <header className='min-h-12 shrink-0 flex flex-wrap items-center gap-x-2 gap-y-1 px-2 py-2 sm:px-3 border-b border-zinc-200 bg-white'>
            <div className='flex min-w-0 flex-1 items-center gap-2'>
                <button
                    onClick={onBack}
                    type="button"
                    aria-label="Back to projects"
                    title="Back to projects"
                    className='p-1.5 rounded-md text-zinc-400 hover:text-zinc-950 hover:bg-zinc-100 cursor-pointer'
                >
                    <ArrowLeftIcon size={16} />
                </button>
                <img src={logo} alt="Logo" className="invert size-5" />
                <span className="min-w-0 truncate text-sm font-semibold max-w-[42vw] sm:max-w-50">
                    {projectName}
                </span>
                <span className='shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 font-medium'>v{version}</span>


            </div>

            <div className='flex w-full sm:w-auto max-w-full items-center justify-end gap-1 overflow-x-auto hide-scrollbar'>
                <button
                    onClick={onToggleShowCode}
                    type="button"
                    aria-label={showCode ? "Show preview" : "Show code"}
                    title={showCode ? "Show preview" : "Show code"}
                    className={`inline-flex items-center justify-center gap-1.5 py-1.5 px-3 border border-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 text-xs font-medium rounded-lg cursor-pointer bg-white ${showCode ? "bg-zinc-100 text-zinc-900" : ""}`}
                >
                    {showCode ? (
                        <>
                            <EyeIcon size={13} /><span className="hidden sm:inline">Preview</span>
                        </>
                    ) : (
                        <>
                            <Code2Icon size={13} /><span className="hidden sm:inline">Code</span>
                        </>



                    )}
                </button>

                <button
                    onClick={onOpenPreview}
                    type="button"
                    aria-label="Open preview"
                    title="Open preview"
                    className="inline-flex items-center justify-center gap-1.5 py-1.5 px-3 border border-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 text-xs font-medium rounded-lg cursor-pointer bg-white"
                >
                    <ExternalLinkIcon size={13} /><span className="hidden sm:inline">Open Preview</span>
                </button>

                <button
                    onClick={onPublish}
                    disabled={publishing}
                    type="button"
                    aria-label="Publish project"
                    title="Publish project"
                    className="inline-flex items-center justify-center gap-1.5 py-1.5 px-3 border border-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 text-xs font-medium rounded-lg cursor-pointer bg-white"
                >
                    {publishing ? (
                        <>
                            <Loader2Icon size={13} className="animate-spin" />
                            
                        </>
                    ) : <>
                    <GlobeIcon size = {13}/><span className="hidden sm:inline">Publish</span>
                    
                    </>}
                </button>

                <button
                    onClick={onDownload}
                    type="button"
                    aria-label="Export project"
                    title="Export project"
                    className="inline-flex items-center justify-center gap-1.5 py-1.5 px-3 border border-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 text-xs font-medium rounded-lg cursor-pointer bg-white"
                >
                    <DownloadIcon size={13} /><span className="hidden sm:inline">Export</span>
                </button>

                <button
                    onClick={onLogout}
                    type="button"
                    aria-label="Sign out"
                    title="Sign out"
                    className="inline-flex items-center justify-center gap-1.5 py-1.5 px-3 border border-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 text-xs font-medium rounded-lg cursor-pointer bg-white"
                >
                    <span className="hidden sm:inline">Sign out</span>
                    <span className="sm:hidden">Exit</span>
                </button>
           




            </div>

        </header>
    )
}

export default BuilderHeader

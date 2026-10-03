import { useEffect, useState } from "react";
import { useAppContext } from '../context/AppContext'
import { useNavigate, useParams } from 'react-router-dom';
import Loading from '../Component/Loading';
import BuilderHeader from '../Component/BuilderHeader';
import { MessageSquareIcon, FolderTreeIcon, Loader2Icon } from 'lucide-react'
import ChatPanel from '../Component/ChatPanel';
import FileExplorer from '../Component/FileExplorer';
import PreviewPanel from '../Component/PreviewPanel';
import AgentProgressDashboard from '../Component/AgentProgressDashboard';
import PublishModal from '../Component/PublishModal';
import { exportProjectZip } from '../utils/exportProject';
import toast from 'react-hot-toast';
import api from '../api/api';

const Builderpage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [leftTab, setLeftTab] = useState('chat');
  const [publishing, setPublishing] = useState(false);
  const [publishUrl, setPublishUrl] = useState(null);


  const {
    activeprojects: activeProject,
    loadingactiveprojects: loadingActiveProject,
    activeFile,
    showcode: showCode,
    setActiveFile,
    setShowCode,
    loadProject,
    logout,
    chatloading, handleChat, handleRetry, retryingProject
  } = useAppContext();

  
 

  useEffect(() => {
    if (!id) return;
    loadProject(id);

  }, [id, loadProject])

  const handleOpenPreview = () => {
    if (!id) return;

    window.open(`/preview/${id}`, "_blank")
  }

  const handlePublish = async () => {
    if(!id) return ;
    setPublishing(true);

    try {
      await api.post(`/api/projects/${id}/publish`);
      const url = `${window.location.origin}/publish/${id}`;

      setPublishUrl(url);
      toast.success("website Published Successfully !");

      
    } catch (error) {
      console.error("Publish Failed : ",error);
      toast.error(error?.response?.data?.error || "Publish Failed");  
      
      
    }
    finally{
      setPublishing(false);
    }

  }
  const handleDownload = () => {
    if(!activeProject)return ;
    exportProjectZip(activeProject)



  }

  if (!activeProject) {
    return <Loading />
  }



  return (
    <div className='h-screen flex flex-col bg-white overflow-hidden text-zinc-900 relative'>
      {loadingActiveProject && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/80">
          <Loader2Icon size={26} className="animate-spin text-zinc-950" />
        </div>
      )}
      {/* Top bar Header */}
      <BuilderHeader
        projectName={activeProject.name}
        version={activeProject.version}
        showCode={showCode}
        publishing={publishing}
        onToggleShowCode={() => setShowCode(!showCode)}
        onOpenPreview={handleOpenPreview}
        onPublish={handlePublish}
        onDownload={handleDownload}
        onBack={() => navigate('/')}
        onLogout={logout}
      />


      {/* Main layout */}
      <div className='flex-1 flex overflow-hidden'>
        {/* Left sidebar */}
        <div className='w-[320px] shrink-0 flex flex-col border-r border-zinc-200 bg-white'>
          {/* sidebar tabs */}

          <div className="flex border-b border-zinc-100">
            <button
              onClick={() => setLeftTab("chat")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium cursor-pointer ${leftTab === "chat"
                ? "text-zinc-900 border-b-2 border-zinc-900"
                : "text-zinc-400 hover:text-zinc-700"
                }`}
            >
              <MessageSquareIcon size={13} /> Chat
            </button>


            <button
              onClick={() => setLeftTab("files")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium cursor-pointer ${leftTab === "files"
                ? "text-zinc-900 border-b-2 border-zinc-900"
                : "text-zinc-400 hover:text-zinc-700"
                }`}
            >
              <FolderTreeIcon size={13} /> Files
            </button>
          </div>

          {/* sidebar content */}
          <div className="flex-1 overflow-hidden">
            {leftTab === 'chat' ? (
              <ChatPanel messages={activeProject.messages} onSend={handleChat} loading={chatloading} />
            ) : (
              <FileExplorer files={activeProject.files} activeFile={activeFile} onFileSelect={
                (path) =>{
                  setActiveFile(path);
                  setShowCode(true);
                }
              }/>
            )}
       
          </div>







        </div>

        {/* /preview / code Area */}

        <div className='flex-1 overflow-hidden'>
          {["pending", "generating", "failed"].includes((activeProject.status || "").toLowerCase()) ? (
            <AgentProgressDashboard project={activeProject} onRetry={handleRetry} retrying={retryingProject} />
          ):(
            <PreviewPanel project={activeProject} activeFile={activeFile} showCode={showCode}/>
          )}

        </div>

      </div>

      {publishUrl && <PublishModal publishurl={publishUrl} onclose={() => setPublishUrl(null)}/>}



    </div>
  )
}

export default Builderpage
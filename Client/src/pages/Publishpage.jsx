import { useEffect, useState } from "react";
import { useParams } from 'react-router-dom'
import Loading from '../Component/Loading';
import {AlertCircleIcon} from "lucide-react"
import FullpagePreview from '../Component/FullpagePreview';
import api from '../api/api';

const Publishpage = () => {

  const { id } = useParams();
  const [project, setProject] = useState(null);

  const [loading, setloading] = useState(Boolean(id));

  const [error, setError] = useState(id ? "" : "This website is not available or it is not published yet!");

  useEffect(() => {
    if (!id) return;

    const fetchPublicProject = async () => {
      try {
        const { data } = await api.get(`/api/projects/public/${id}`);
        setProject(data);
      } catch (error) {

        console.error("Failed to load public project :",error);
        setError(error?.response?.data?.error || "This website is not available or it not published yet!")
        

      }
      finally{
        setloading(false);
      }


    }

    fetchPublicProject();



  }, [id])

  if(loading){
    return <Loading/>
  }

  if(error || !project){
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-zinc-50 px-4 text-center">
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center text-red-600 mb-4">
          <AlertCircleIcon size={24} />
        </div>
        <h1 className="text-lg font-semibold text-zinc-900 mb-1.5">Website Unavailable</h1>
        <p className="text-sm text-zinc-500 max-w-sm leading-relaxed mb-6">{error}</p>
        <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">BuilderAI</div>
      </div>
    )
  }
  return (
    <div>
      <FullpagePreview files={project.files}/>

    </div>
  )
}

export default Publishpage

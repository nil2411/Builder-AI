import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Loading from '../Component/Loading';
import { AlertCircleIcon } from "lucide-react"
import FullpagePreview from '../Component/FullpagePreview';
import api from '../api/api';

const Previewpage = () => {

  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) {
      setError("This preview is not available.");
      setProject(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchProject = async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await api.get(`/api/projects/${id}`);
        if (cancelled) return;
        setProject(data);
      } catch (err) {
        console.error("Failed to load preview project :", err);
        if (cancelled) return;
        setProject(null);
        setError(err?.response?.data?.error || "This preview is not available.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchProject();

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return <Loading />;
  }

  if (error || !project?.files) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-zinc-50 px-4 text-center">
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center text-red-600 mb-4">
          <AlertCircleIcon size={24} />
        </div>
        <h1 className="text-lg font-semibold text-zinc-900 mb-1.5">Preview Unavailable</h1>
        <p className="text-sm text-zinc-500 max-w-sm leading-relaxed mb-6">
          {error || "This project could not be loaded."}
        </p>
        <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">BuilderAI</div>
      </div>
    );
  }

  return (
    <div>
      <FullpagePreview files={project.files} />
    </div>
  );
}

export default Previewpage

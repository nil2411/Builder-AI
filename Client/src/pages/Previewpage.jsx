import React, { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import Loading from '../Component/Loading';
import FullpagePreview from '../Component/FullpagePreview';
import { useAppContext } from '../context/AppContext'

const Previewpage = () => {

  const { id } = useParams();
  const {activeprojects : project, loadingactiveprojects : loading, loadProject} = useAppContext();

  useEffect(() => {
      if(id){
        loadProject(id);
      }
    
  }, [id,])

  if(loading || !project){
    return <Loading/>
  }

  
  return (
    <div>
      <FullpagePreview files={project.files}/>

    </div>
  )
}

export default Previewpage

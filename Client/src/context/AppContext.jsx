import { createContext, useCallback, useContext, useEffect, useState,useMemo } from "react";
import api from "../api/api";
import toast from "react-hot-toast";
import { Navigate, useNavigate } from "react-router-dom";
import debounce from 'lodash.debounce'

const AppContext = createContext(undefined);

//Auth states



export function AppContextProvider({ children }) {
    //Auth states
    const [user, setuser] = useState(null);
    const [loadingUSer, setloadingUser] = useState(true);
    const navigate = useNavigate();
    const [projects, setProjects] = useState([]);
    const [loadingprojects, setLoadingProjects] = useState(true);
    const [activeprojects, setActiveProjects] = useState(null);
    const [loadingactiveprojects, setLoadingActiveProjects] = useState(true);
    const [chatloading, setChatLoading] = useState(false);
    const [generatingProject, setGeneratingProject] = useState(false);
    const [activeFile, setActiveFile] = useState("/App.js");
    const [showcode, setShowCode] = useState(false);


    //Auth Actions
    const checksession = async () => {
        try {

            const { data } = await api.get("/api/auth/me");
            setuser(data.user);

        } catch (error) {
            setuser(null);

        }
        finally {
            setloadingUser(false);
        }
    }

    useEffect(() => {
        checksession();
    }, [])

    const login = async (email, password) => {
        try {
            const { data } = await api.post("/api/auth/login", { email, password });
            setuser(data.user);
            toast.success("welcome back !");
            navigate('/');

        } catch (error) {
            console.log(error);

            const errmsg = error?.response?.data?.error || "Invalid email or password";
            toast.error(errmsg);
            throw new Error(errmsg);


        }
    }
    const register = async (name, email, password) => {
        try {
            const { data } = await api.post("/api/auth/register", { name, email, password });
            setuser(data.user);
            toast.success("Account Created Successfully!");
            navigate('/');

        } catch (error) {
            console.log("Registraton failed : ", error);

            const errmsg = error?.response?.data?.error || "Registration failed ";
            toast.error(errmsg);
            throw new Error(errmsg);


        }
    }

    const logout = async () => {
        try {
            await api.post("/api/auth/logout");
            setuser(null);
            setProjects([]);
            setActiveProjects(null);
            toast.success("logged out successfully")
            navigate('/login')

        } catch (err) {
            console.log("logout failed:", err);
            toast.error("Logout Failed !");


        }
    }

    const loadprojects = useCallback(async () => {
        if (!user) {
            setProjects([]);
            setLoadingProjects(false);
            return;
        }

        try {
            const { data } = await api.get("/api/projects");
            setProjects(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error("Failed to list projects : ", error);
            toast.error("Failed to load Projects list!");
            setProjects([]);
        } finally {
            setLoadingProjects(false);
        }
    }, [user]);

    const loadProject = useCallback(async (id, silent = false) => {
        if (!user) return;

        if (!silent) setLoadingActiveProjects(true);
        try {

            const { data } = await api.get(`/api/projects/${id}`);
            setActiveProjects((prev) => {
                if (prev && prev.status === data.status && prev.version === data.version) {
                    return prev;
                }
                return data;
            });


            //Default file selection

            const files = Object.keys(data.files);
            if (files.length > 0) {
                setActiveFile((prev) => {
                    if (files.includes(prev)) return prev;
                    if (files.includes("/App.js")) return "/App.js";
                    return files[0];


                })
            }

        } catch (error) {
            console.error("Failed to load project", error);
            if (!silent) {
                toast.error("Failed to load project details !");
                navigate("/");

            }


        }
        finally {
            if (!silent) setLoadingActiveProjects(false);


        }


    }, [user, navigate]);

    //Automatically poll active project status if generating or pending;

    useEffect(() => {
        if (!activeprojects?._id || !user) return;

        const ongoing = activeprojects.status === "Generating" || activeprojects.status === "Pending" || activeprojects.status === "Revising";

        if (ongoing) {
            setChatLoading(true);
            const interval = setInterval(() => {
                loadProject(activeprojects._id, true);
            }, 2000);
            return () => clearInterval(interval);
        }
        else {
            setChatLoading(false);
        }

    }, [activeprojects?._id, activeprojects?.status, loadProject, user]);

    const handleGenerate = useCallback(async (prompt) => {
        if (!user) return;
        setGeneratingProject(true);

        try {
            const { data } = await api.get("/api/projects", { prompt });
            toast.success("AI agent is planning structure...");
            navigate(`/builder/${data._id}`);


        } catch (error) {
            console.error("Failed to generate project", error);
            toast.error(error?.response?.data?.error || "Failed to generate projects !");


        }
        finally {
            setGeneratingProject(false);
        }



    }, [NavigateEvent, user]);


    const handleDelete = useCallback(async (id) => {
        if (!user) return;


        try {
            await api.delete(`/api/projects/${id}`);

            setProjects((prev) => prev.filter((p) => p._id !== id));

            toast.success("Project deleted successfully");





        } catch (error) {
            console.error("Failed to delete project", error);
            toast.error(error?.response?.data?.error || "Failed to delete project!");



        }




    }, [user]);

    const handleChat = useCallback(
        async(prompt) =>{
            if(!activeprojects || !user) return;
            
            setChatLoading(true);

            try {
                const {data} = await api.post(`/api/projects/${activeprojects._id}/chat`,{prompt});

                setActiveProjects(data);

                if(data.errors && data.errors.length > 0){
                    toast.error(`${data.erros.length} revision  patch(es) failed`);


                }
                else{
                    toast.success(`updated to version ${data.version}`);
                }
            } catch (error) {

                console.error("Revision request failed : ",error);

                
            }
            finally{
                setChatLoading(false);
            }

        },[activeprojects,user]
    )

    const debouncedSave = useMemo(
        () => debounce(async(files,id) =>{
            try {
                await api.put(`/api/projects/${id}/files`,{files});
                
            } catch (error) {
                console.error("failed to auto-save files", error);
                toast.error("Failed to save code modificatons");
                
                
            }

        },1000),[],
    )

    useEffect(() => {
        return() =>{
            debouncedSave.flush();
        }
    },[debouncedSave])

    const updateProjectFiles = useCallback(
        async(files) =>{
            if(!activeprojects || !user)return;

            debouncedSave(files, activeprojects._id);



        },[activeprojects,user,debouncedSave]
    )


    return (
        <AppContext.Provider value={{
            user,
            loadingUSer,
            login,
            register,
            logout,
            projects,
            loadingprojects,
            activeprojects,
            loadingactiveprojects,
            chatloading,
            generatingProject,
            activeFile,
            showcode,
            setActiveFile,
            setShowCode,
            loadProject,
            loadprojects,
            handleGenerate,
            handleDelete,
            setProjects,
            handleChat,
            updateProjectFiles
           
        }}>





            {children}

        </AppContext.Provider>
    )
}

export function useAppContext() {
    const context = useContext(AppContext);

    if (context === undefined) {
        throw new Error("useAppContext must be use within an AppContextProvider");
    }

    return context;

}
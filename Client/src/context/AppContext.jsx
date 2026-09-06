import { createContext, useContext, useEffect, useState } from "react";
import api from "../api/api";
import toast from "react-hot-toast";
import { Navigate, useNavigate } from "react-router-dom";

 const AppContext = createContext(undefined);

 //Auth states
 
 
 
 export function AppContextProvider({children}){
    //Auth states
     const [user,setuser] = useState(null);
     const [loadingUSer,setloadingUser] = useState(true);
     const navigate = useNavigate();

     //Auth Actions
     const checksession = async () =>{
        try {

            const {data} = await api.get("/api/auth/me");
            setuser(data.user);
            
        } catch (error) {
            setuser(null);
            
        }
        finally{
            setloadingUser(false);
        }
     }

     useEffect(() =>{
        checksession();
     },[])

     const login = async(email,password) =>{
        try {
            const {data} = await api.post("/api/auth/login",{email,password});
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
     const register = async(name,email,password) =>{
        try {
            const {data} = await api.post("/api/auth/register",{name,email,password});
            setuser(data.user);
            toast.success("Account Created Successfully!");
            navigate('/');
            
        } catch (error) {
            console.log("Registraton failed : ",error);

            const errmsg = error?.response?.data?.error || "Registration failed ";
            toast.error(errmsg);
            throw new Error(errmsg);
            
            
        }
     }
    return (
        <AppContext.Provider value={{ user, loadingUSer, login, register }}>
   
            {children}

        </AppContext.Provider>
    )
 }

 export function useAppContext(){ 
    const context = useContext(AppContext);

    if(context === undefined){
        throw new Error("useAppContext must be use within an AppContextProvider");
    }

    return context;

 }
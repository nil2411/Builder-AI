import { createContext, useContext, useEffect, useState } from "react";
import api from "../api/api";

 const AppContext = createContext(undefined);

 //Auth states
 
 
 
 export function AppContextProvider({children}){
    //Auth states
     const [user,setuser] = useState(null);
     const [loadingUSer,setloadingUser] = useState(true);

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
     },[checksession])
    return (
        <AppContext.Provider value={{ user, loadingUSer }}>
   
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
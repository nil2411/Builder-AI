import { Outlet, Navigate } from 'react-router-dom'
import { useAppContext } from '../context/AppContext'
import Loading from '../Component/Loading';

export function AuthLayout(){

    const { user, loadingUSer } = useAppContext();

    if(loadingUSer){
        return <Loading></Loading>
    }

    if(!user){
        return <Navigate to = '/login' replace></Navigate>
    }

    return <Outlet></Outlet>

}
export function GuestLayout(){

    const { loadingUSer } = useAppContext();

    if(loadingUSer){
        return <Loading></Loading>
    }

    return <Outlet></Outlet>

}


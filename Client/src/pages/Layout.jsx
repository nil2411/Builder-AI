import React, { useContext } from 'react'
import { Outlet ,Navigate} from 'react-router-dom'
import { useAppContext } from '../context/AppContext'
import LoadingUser from '../Component/Loading';
import lodingPage from '../Component/Loading';
import Loading from '../Component/Loading';

export function AuthLayout(){

    const { user, loadingUSer } = useAppContext();

    if(loadingUSer){
        return <Loading></Loading>
    }

    if(!user){
        return <Navigae to = '/login' replace></Navigae>
    }

    return <Outlet></Outlet>

}
export function GuestLayout(){

    const { user, loadingUSer } = useAppContext();

    if(loadingUSer){
        return <Loading></Loading>
    }

    if(user){
        return <Navigae to = '/' replace></Navigae>
    }

    return <Outlet></Outlet>

}


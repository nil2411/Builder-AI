import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthLayout, GuestLayout } from './pages/Layout'
import Authpage from './pages/Authpage'
import Homepage from './pages/Homepage'
import Builderpage from './pages/Builderpage'
import Previewpage from './pages/Previewpage'
import { Toaster } from 'react-hot-toast'


const App = () => {
  return (
    <>
    <Toaster></Toaster>
    <Routes>
      {/* Login Routes */}
      <Route element={<GuestLayout />}>
        <Route path='/login' element={<Authpage mode="login" />} />
        <Route path='/register' element={<Authpage mode="Register" />} />
      </Route>

      {/* Protected Routes */}
      <Route element={<AuthLayout />}>
        <Route path='/' element={<Homepage />} />
        <Route path='/builder/:id' element={<Builderpage/>} />
        <Route path='/preview/:id' element={<Previewpage/>} />
        

      </Route>

      {/* catch all routes */}
      <Route path='*' element={<Navigate to='/' />} />
    </Routes>
    </>
    
  )
}

export default App

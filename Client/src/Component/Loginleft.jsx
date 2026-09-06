import React from 'react'
import bgImg from '../public/bg-img.png'
import logo from '../public/logo.svg'

const Loginleft = () => {
  return (
    <div
      className='hidden lg:flex lg:w-2/5 bg-cover bg-center bg-no-repeat flex-col justify-between p-12 shrink-0 select-none'
      style={{ backgroundImage: `url(${bgImg})` }}
    >
      <div className='flex items-center gap-3'>
        <img src={logo} alt="logo" className='size-9.5' />
        <span className='text-4xl font-medium text-white'>Builder AI</span>

      </div>
      <div>
        <h2 className='text-3xl text-white font-medium leading-snug mb-3 tracking-tight '>Build your presence on web</h2>
        <p className='text-zinc-300'>
          Describe what you need, preview instantly, and customize your site  
          in real-time. React with clean JSX, verified layouts, and instant
          code exports.
        </p>

        <p className='text-zinc-300 text-sm mt-12'>
          © {new Date().getFullYear()} Builder AI
        </p>
   

      </div>

    </div>
  )
}

export default Loginleft
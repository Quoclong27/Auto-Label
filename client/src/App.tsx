import React, { useCallback, useEffect, useRef, useState } from 'react'
import Landing from './pages/Landing'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import AdminDashboard from './pages/AdminDashboard'
import Explore from './pages/Explore'
import Sidebar from './components/Sidebar'
import { api, apiWithRetry, API } from './lib/api'
import { User } from './lib/types'

export default function App(){
  const [user, setUser] = useState<User|null>(null)
  const [projectId, setProjectId] = useState<number|null>(null)
  const [currentPage, setCurrentPage] = useState<'projects' | 'explore' | 'admin'>('projects')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showSplash, setShowSplash] = useState(false)
  const splashTimerRef = useRef<number | null>(null)

  const triggerSplash = useCallback(() => {
    if (splashTimerRef.current) {
      window.clearTimeout(splashTimerRef.current)
    }
    setShowSplash(true)
    splashTimerRef.current = window.setTimeout(() => {
      setShowSplash(false)
      splashTimerRef.current = null
    }, 1200)
  }, [])

  useEffect(() => {
    return () => {
      if (splashTimerRef.current) {
        window.clearTimeout(splashTimerRef.current)
      }
    }
  }, [])

  useEffect(()=>{
    // Check if we just returned from OAuth callback with email in URL
    const params = new URLSearchParams(window.location.search)
    const authEmail = params.get('auth_email')
    
    if (authEmail) {
      console.log('📝 Auth email from OAuth callback:', authEmail)
      // Store in localStorage BEFORE removing from URL
      localStorage.setItem('auth_email', authEmail)
      // Remove the auth_email param from URL to clean it up
      window.history.replaceState({}, '', window.location.pathname)
    }
    
    // Call /me - api() will automatically add auth_email from localStorage
    // Use retry for OAuth callback, normal call otherwise
    const mePromise = authEmail ? apiWithRetry('/me', {}, 5) : api('/me')
    
    mePromise
      .then((data: any) => {
        console.log('✅ User authenticated:', data.email, 'is_admin:', data.is_admin)
        setUser(data as User)
        triggerSplash()
      })
      .catch((err) => {
        console.error('❌ Auth failed. Not logged in yet.', err.message || err)
        setUser(null)
      })
  }, [triggerSplash])

  async function handleLogout(){
    try {
      await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' })
    } catch (err) {
      console.error('logout failed', err)
    } finally {
      setUser(null)
      setProjectId(null)
      setShowSplash(false)
      if (splashTimerRef.current) {
        window.clearTimeout(splashTimerRef.current)
        splashTimerRef.current = null
      }
    }
  }

  const handleNavigate = (page: 'projects' | 'explore' | 'admin') => {
    setCurrentPage(page)
    setProjectId(null) // Close any open project detail
  }

  return (
    <>
      {showSplash && <SplashOverlay />}
      {!user ? (
        <Landing />
      ) : projectId ? (
        <ProjectDetail id={projectId} onBack={() => setProjectId(null)} onLogout={handleLogout} />
      ) : (
        <div className="flex h-screen overflow-hidden">
          {/* Sidebar - ẩn khi showSplash */}
          {!showSplash && (
            <Sidebar
              user={user}
              currentPage={currentPage}
              isOpen={sidebarOpen}
              onToggle={() => setSidebarOpen(!sidebarOpen)}
              onNavigate={handleNavigate}
              onLogout={handleLogout}
            />
          )}
          <div className={`flex-1 transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-0'}`}>
            {currentPage === 'projects' && (
              <Projects onOpen={setProjectId} onLogout={handleLogout} onShowSplash={triggerSplash} />
            )}
            {currentPage === 'explore' && (
              <Explore onOpenProject={setProjectId} />
            )}
            {currentPage === 'admin' && user.is_admin && (
              <AdminDashboard user={user} onLogout={handleLogout} onOpenProject={setProjectId} />
            )}
          </div>
        </div>
      )}
    </>
  )
}

function SplashOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      {/* Animated gradient background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -inset-[10px] opacity-50">
          <div className="absolute top-0 -left-4 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl animate-blob"></div>
          <div className="absolute top-0 -right-4 w-72 h-72 bg-yellow-500 rounded-full mix-blend-multiply filter blur-xl animate-blob animation-delay-2000"></div>
          <div className="absolute -bottom-8 left-20 w-72 h-72 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl animate-blob animation-delay-4000"></div>
        </div>
      </div>

      {/* Content */}
      <div className="relative flex flex-col items-center gap-6">
        <div className="relative">
          {/* Spinning ring */}
          <div className="absolute inset-0 animate-spin-slow">
            <div className="h-80 w-80 rounded-full border-4 border-transparent border-t-white/30 border-r-white/20"></div>
          </div>
          
          {/* Logo with pulse and scale animation */}
          <img
            src="/logo2.png"
            alt="Loading"
            className="h-72 w-72 object-contain animate-pulse-scale"
            draggable={false}
          />
        </div>
        
        {/* Loading text with fade animation */}
        <div className="flex flex-col items-center gap-2 mt-8">
          <p className="text-xl font-bold tracking-wide text-white animate-fade-in">
            Đang tải...
          </p>
          <div className="flex gap-1">
            <span className="h-2 w-2 bg-white rounded-full animate-bounce"></span>
            <span className="h-2 w-2 bg-white rounded-full animate-bounce animation-delay-200"></span>
            <span className="h-2 w-2 bg-white rounded-full animate-bounce animation-delay-400"></span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes blob {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse-scale {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.05); opacity: 0.8; }
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animate-spin-slow {
          animation: spin-slow 3s linear infinite;
        }
        .animate-pulse-scale {
          animation: pulse-scale 2s ease-in-out infinite;
        }
        .animate-fade-in {
          animation: fade-in 0.5s ease-out;
        }
        .animation-delay-200 {
          animation-delay: 0.2s;
        }
        .animation-delay-400 {
          animation-delay: 0.4s;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
    </div>
  )
}
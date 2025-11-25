import React from 'react'
import { User } from '../lib/types'

interface SidebarProps {
  user: User | null
  currentPage: 'projects' | 'explore' | 'admin'
  isOpen: boolean
  onToggle: () => void
  onNavigate: (page: 'projects' | 'explore' | 'admin') => void
  onLogout: () => void
}

export default function Sidebar({ user, currentPage, isOpen, onToggle, onNavigate, onLogout }: SidebarProps) {
  const menuItems = [
    { id: 'projects' as const, label: 'Projects', icon: '📁', show: true },
    { id: 'explore' as const, label: 'Explore', icon: '🔍', show: true },
    { id: 'admin' as const, label: 'Admin', icon: '⚙️', show: user?.is_admin },
  ]

  return (
    <>
      {/* Sidebar */}
      <aside className={`w-64 bg-gradient-to-b from-slate-900 to-slate-950 border-r border-white/10 flex flex-col transition-transform duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-40`}>
      {/* Logo */}
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white font-bold">
            VD
          </div>
          <div>
            <h1 className="font-bold text-white">VietDynamic</h1>
            <p className="text-xs text-slate-400">Auto-Label</p>
          </div>
        </div>
      </div>

      {/* User Info */}
      {user && (
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center gap-3 p-2 rounded-lg bg-white/5">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center text-white text-sm font-bold">
              {user.email[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user.email.split('@')[0]}</p>
              <p className="text-xs text-slate-400">{user.is_admin ? 'Admin' : 'User'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {menuItems.filter(item => item.show).map(item => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${
              currentPage === item.id
                ? 'bg-purple-600 text-white shadow-lg'
                : 'text-slate-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <span className="text-lg">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-white/10">
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-rose-300 hover:bg-rose-500/10 hover:text-rose-200 transition"
        >
          <span className="text-lg">🚪</span>
          Sign Out
        </button>
      </div>
      </aside>

      {/* Toggle Button - Circular button at middle of sidebar right edge */}
      <button
        onClick={onToggle}
        className={`fixed top-1/2 transform -translate-y-1/2 w-10 h-10 rounded-full bg-slate-800 border-2 border-white/30 text-white hover:bg-slate-700 hover:border-white/50 transition-all duration-300 shadow-xl z-50 flex items-center justify-center ${
          isOpen ? 'left-60' : 'left-0'
        }`}
        title={isOpen ? 'Hide sidebar' : 'Show sidebar'}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
          {isOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          )}
        </svg>
      </button>
    </>
  )
}

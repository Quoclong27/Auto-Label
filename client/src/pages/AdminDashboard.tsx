import React, { useEffect, useState } from 'react'
import { api, API } from '../lib/api'

interface AdminDashboardProps {
  user: any
  onLogout: () => void
  onOpenProject?: (id: number) => void
}

interface ProjectStats {
  id: number
  name: string
  project_type: string
  owner_email: string
  created_at: string
  publish_level: string
  image_count: number
  annotation_count: number
  annotation_approved: number
  annotation_rejected: number
}

export default function AdminDashboard({ user, onLogout, onOpenProject }: AdminDashboardProps) {
  const [projects, setProjects] = useState<ProjectStats[]>([])
  const [stats, setStats] = useState({ totalUsers: 0, totalImages: 0, totalAnnotations: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 5000) // Refresh every 5 seconds
    return () => clearInterval(interval)
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      // Load projects (already includes image_count and annotation_count)
      const projectsData = await api<any[]>('/projects')
      const enrichedProjects = projectsData.map((proj: any) => ({
        id: proj.id,
        name: proj.name,
        project_type: proj.project_type,
        owner_email: proj.owner_email || 'Unknown',
        created_at: proj.created_at,
        publish_level: proj.publish_level,
        image_count: proj.image_count || 0,
        annotation_count: proj.annotation_count || 0,
        annotation_approved: 0, // TODO: Add if needed
        annotation_rejected: 0, // TODO: Add if needed
      }))
      setProjects(enrichedProjects)
      
      // Calculate aggregate stats
      const totalImages = enrichedProjects.reduce((sum, p) => sum + p.image_count, 0)
      const totalAnnotations = enrichedProjects.reduce((sum, p) => sum + p.annotation_count, 0)
      setStats({
        totalUsers: projectsData.length || 0,
        totalImages,
        totalAnnotations,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
      console.error('Error loading data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    try {
      await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' })
    } catch (err) {
      console.error('logout failed', err)
    }
    onLogout()
  }

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-br from-slate-950 to-slate-900 text-white">
      {/* Company Logo */}
      <div className="flex items-center justify-center py-8 border-b border-white/10">
        <img
          src="/logo2.png"
          alt="VietDynamic Logo"
          className="h-24 w-auto object-contain"
          draggable={false}
        />
      </div>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">👑 Admin Dashboard</h1>
          <p className="text-slate-400">Monitor all public projects and system statistics</p>
        </div>
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="rounded-lg border border-white/10 bg-white/5 p-6 backdrop-blur">
            <p className="text-slate-400 text-sm mb-2">Total Projects</p>
            <p className="text-3xl font-bold">{projects.length}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-6 backdrop-blur">
            <p className="text-slate-400 text-sm mb-2">Total Images</p>
            <p className="text-3xl font-bold">{stats.totalImages.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-6 backdrop-blur">
            <p className="text-slate-400 text-sm mb-2">Total Annotations</p>
            <p className="text-3xl font-bold">{stats.totalAnnotations.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-6 backdrop-blur">
            <p className="text-slate-400 text-sm mb-2">Completion Rate</p>
            <p className="text-3xl font-bold">
              {stats.totalImages > 0 
                ? Math.round((stats.totalAnnotations / stats.totalImages) * 100)
                : 0}%
            </p>
          </div>
        </div>

        {/* Projects Table */}
        <div className="rounded-lg border border-white/10 bg-white/5 backdrop-blur overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center">
            <h2 className="text-lg font-semibold">All Projects</h2>
            <button
              onClick={loadData}
              className="text-xs px-3 py-1 rounded bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/50 text-blue-400"
            >
              🔄 Refresh
            </button>
          </div>

          {loading ? (
            <div className="px-6 py-12 text-center text-slate-400">Loading...</div>
          ) : error ? (
            <div className="px-6 py-12 text-center text-red-400">{error}</div>
          ) : projects.length === 0 ? (
            <div className="px-6 py-12 text-center text-slate-400">No projects yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-white/10 bg-white/5">
                  <tr>
                    <th className="px-6 py-3 text-left font-semibold text-slate-300">Project</th>
                    <th className="px-6 py-3 text-left font-semibold text-slate-300">Owner</th>
                    <th className="px-6 py-3 text-center font-semibold text-slate-300">Images</th>
                    <th className="px-6 py-3 text-center font-semibold text-slate-300">Annotations</th>
                    <th className="px-6 py-3 text-center font-semibold text-slate-300">Progress</th>
                    <th className="px-6 py-3 text-left font-semibold text-slate-300">Status</th>
                    <th className="px-6 py-3 text-center font-semibold text-slate-300">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {projects.map((project) => {
                    const progress = project.image_count > 0 
                      ? Math.round((project.annotation_count / project.image_count) * 100)
                      : 0
                    return (
                      <tr key={project.id} className="hover:bg-white/5 transition">
                        <td className="px-6 py-3">
                          <div>
                            <p className="font-medium">{project.name}</p>
                            <p className="text-xs text-slate-400">{project.project_type}</p>
                          </div>
                        </td>
                        <td className="px-6 py-3 text-slate-400">{project.owner_email}</td>
                        <td className="px-6 py-3 text-center font-semibold">{project.image_count}</td>
                        <td className="px-6 py-3 text-center font-semibold">{project.annotation_count}</td>
                        <td className="px-6 py-3 text-center">
                          <div className="flex items-center gap-2 justify-center">
                            <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-gradient-to-r from-green-500 to-emerald-500"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <span className="text-xs font-semibold w-8 text-right">{progress}%</span>
                          </div>
                        </td>
                        <td className="px-6 py-3">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            project.publish_level === 'public'
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-yellow-500/20 text-yellow-400'
                          }`}>
                            {project.publish_level}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-center">
                          {onOpenProject && (
                            <button
                              onClick={() => onOpenProject(project.id)}
                              className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded transition"
                            >
                              View →
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

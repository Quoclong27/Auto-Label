import React, { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { getProjectTypeInfo } from '../lib/projectTypes'
import { Project } from '../lib/types'

interface ExploreProps {
  onOpenProject: (id: number) => void
}

export default function Explore({ onOpenProject }: ExploreProps) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadPublicProjects()
  }, [])

  async function loadPublicProjects() {
    setLoading(true)
    try {
      // GET /projects returns public projects for all users
      const data = await api<Project[]>('/projects')
      // Filter only public projects
      const publicProjects = data.filter(p => p.publish_level === 'public')
      setProjects(publicProjects)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load public projects')
    } finally {
      setLoading(false)
    }
  }

  const [selectedProjectType, setSelectedProjectType] = useState<string>('all')
  const [selectedModel, setSelectedModel] = useState<string>('all')

  const projectTypes = [
    { label: 'All Projects', value: 'all' },
    { label: 'Object Detection', value: 'object_detection' },
    { label: 'Classification', value: 'classification' },
    { label: 'Instance Segmentation', value: 'instance_segmentation' },
    { label: 'Keypoint Detection', value: 'keypoint_detection' },
    { label: 'Semantic Segmentation', value: 'semantic_segmentation' },
    { label: 'Multimodal', value: 'multimodal' }
  ]

  const filteredProjects = projects.filter(project => {
    // Filter by search query
    const matchesSearch = project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.description?.toLowerCase().includes(searchQuery.toLowerCase())
    
    // Filter by project type
    const matchesType = selectedProjectType === 'all' || project.project_type === selectedProjectType
    
    return matchesSearch && matchesType
  })

  const models = [
    'All Models',
    'RF-DETR',
    'YOLOv12',
    'YOLOv11',
    'YOLOv10',
    'YOLOv9',
    'YOLO-NAS',
    'YOLOv8',
    'YOLOv5'
  ]

  return (
    <div className="h-full overflow-y-auto">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-purple-600 via-blue-600 to-cyan-600 text-white px-8 py-20">
        <div className="max-w-6xl mx-auto text-center">
          <div className="inline-flex items-center gap-3 mb-6">
            <div className="h-16 w-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center text-4xl">
              🚀
            </div>
            <h1 className="text-5xl font-bold">Explore the VietDynamic Universe</h1>
          </div>
          <p className="text-xl text-white/90 mb-8">
            The world's largest collection of open source computer vision datasets and projects
          </p>
          <div className="flex items-center justify-center gap-8 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-2xl">📷</span>
              <span><strong>500 MILLION+</strong> IMAGES</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">📊</span>
              <span><strong>1,000,000+</strong> DATASETS</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">🎯</span>
              <span><strong>250,000+</strong> FINE-TUNED MODELS</span>
            </div>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white border-b border-neutral-200 px-8 py-6">
        <div className="max-w-6xl mx-auto">
          <div className="relative mb-6">
            <input
              type="text"
              placeholder="Search 1,000,000+ Open Source Computer Vision Projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-6 py-4 pr-12 rounded-xl border-2 border-neutral-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none text-lg"
            />
            <button className="absolute right-3 top-1/2 -translate-y-1/2 px-6 py-2 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition">
              🔍 Search
            </button>
          </div>

          {/* Filters */}
          <div className="space-y-4">
            {/* Project Type Filter */}
            <div>
              <h3 className="text-sm font-semibold text-neutral-700 mb-2">BY PROJECT TYPE:</h3>
              <div className="flex flex-wrap gap-2">
                {projectTypes.map((type) => (
                  <button
                    key={type.value}
                    onClick={() => setSelectedProjectType(type.value)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                      selectedProjectType === type.value
                        ? 'bg-purple-600 text-white'
                        : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                    }`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Model Filter */}
            <div>
              <h3 className="text-sm font-semibold text-neutral-700 mb-2">BY MODEL:</h3>
              <div className="flex flex-wrap gap-2">
                {models.map((model) => (
                  <button
                    key={model}
                    onClick={() => setSelectedModel(model.toLowerCase().replace(/\s+/g, '_'))}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                      selectedModel === model.toLowerCase().replace(/\s+/g, '_') || (selectedModel === 'all' && model === 'All Models')
                        ? 'bg-blue-600 text-white'
                        : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                    }`}
                  >
                    {model}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Project Grid */}
      <div className="bg-neutral-50 px-8 py-12">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold text-neutral-900">
              ❤️ Featured Projects
            </h2>
            <span className="text-sm text-neutral-600">
              {filteredProjects.length} projects found
            </span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-dashed border-purple-500" />
            </div>
          ) : error ? (
            <div className="text-center py-16 text-rose-600">{error}</div>
          ) : filteredProjects.length === 0 ? (
            <div className="text-center py-16 text-neutral-500">
              <p className="text-4xl mb-4">🔍</p>
              <p>No public projects found. Create one and set it to public to share with the community!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProjects.map(project => {
                const typeInfo = getProjectTypeInfo(project.project_type as any)
                return (
                  <div
                    key={project.id}
                    className="bg-white rounded-2xl shadow-md hover:shadow-xl transition-all overflow-hidden border border-neutral-200 hover:border-purple-300"
                  >
                    {/* Project Preview */}
                    <div className="h-48 bg-gradient-to-br from-purple-100 via-blue-100 to-cyan-100 flex items-center justify-center relative overflow-hidden">
                      {project.thumbnail_url ? (
                        <img 
                          src={project.thumbnail_url} 
                          alt={project.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-6xl">📊</div>
                      )}
                      <div className="absolute top-3 right-3 flex items-center gap-1 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-xs font-semibold">
                        <span>⭐</span>
                        <span>{project.image_count || 0}</span>
                      </div>
                    </div>

                    {/* Project Info */}
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <h3 className="font-bold text-lg text-neutral-900 line-clamp-1">
                          {project.name}
                        </h3>
                      </div>

                      {project.description && (
                        <p className="text-sm text-neutral-600 mb-4 line-clamp-2">
                          {project.description}
                        </p>
                      )}

                      <div className="flex flex-wrap gap-2 mb-4">
                        {typeInfo && (
                          <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-semibold rounded-full">
                            {typeInfo.label}
                          </span>
                        )}
                        {project.owner_email && (
                          <span className="px-2 py-1 bg-neutral-100 text-neutral-700 text-xs font-semibold rounded-full">
                            by {project.owner_email.split('@')[0]}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-xs text-neutral-500">
                        {project.image_count !== undefined && (
                          <span>📷 {project.image_count} images</span>
                        )}
                        {project.annotation_count !== undefined && (
                          <span>🏷️ {project.annotation_count} labels</span>
                        )}
                      </div>

                      {project.created_at && (
                        <div className="mt-3 pt-3 border-t border-neutral-200 text-xs text-neutral-400">
                          Updated {new Date(project.created_at).toLocaleDateString()}
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="mt-4 flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onOpenProject(project.id)
                          }}
                          className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 transition"
                        >
                          👁️ View
                        </button>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation()
                            try {
                              const forked = await api<{ id: number }>(`/projects/${project.id}/fork`, {
                                method: 'POST',
                              })
                              onOpenProject(forked.id)
                            } catch (err) {
                              alert(err instanceof Error ? err.message : 'Failed to fork project')
                            }
                          }}
                          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition"
                        >
                          🍴 Fork & Edit
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

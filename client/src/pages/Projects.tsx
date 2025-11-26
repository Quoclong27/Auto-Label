import React, { useEffect, useState } from 'react'
import { api, API, addAuthToUrl } from '../lib/api'
import {
  PROJECT_TYPE_OPTIONS,
  getProjectTypeInfo,
  ProjectTypeId,
  PUBLISH_OPTIONS,
  PublishLevel,
} from '../lib/projectTypes'

type ProjectSummary = {
  id: number
  name: string
  description?: string | null
  project_type: ProjectTypeId
  publish_level: PublishLevel
  created_at?: string | null
}

type ProjectsProps = {
  onOpen: (id: number) => void
  onLogout: () => void
  onShowSplash: () => void
}

export default function Projects({ onOpen, onLogout, onShowSplash }: ProjectsProps) {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [selectedType, setSelectedType] = useState<ProjectTypeId>('object_detection')
  const [publishLevel, setPublishLevel] = useState<PublishLevel>('private')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)


  async function loadProjects() {
    setLoading(true)
    try {
      const data = await api<ProjectSummary[]>('/projects')
      setError(null)
      setProjects(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProjects()
  }, [])

  async function createProject() {
    if (!name.trim()) {
      setError('Project name is required.')
      return
    }
    setSubmitting(true)
    setError(null)
    setFeedback(null)
    try {
      const created = await api<ProjectSummary>('/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          project_type: selectedType,
          publish_level: publishLevel,
        }),
      })
      setName('')
      setDescription('')
      setFeedback('Project created successfully.')
      setProjects((prev) => [created, ...prev])
      onShowSplash()
      onOpen(created.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleProjectVisibility(projectId: number, currentLevel: PublishLevel) {
    const newLevel = currentLevel === 'private' ? 'public' : 'private'
    setSubmitting(true)
    setError(null)
    setFeedback(null)
    try {
      const response = await fetch(addAuthToUrl(`${API}/projects/${projectId}`), {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publish_level: newLevel }),
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || 'Failed to update project visibility')
      }
      setFeedback(`Project visibility changed to ${newLevel}.`)
      loadProjects()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update project visibility')
    } finally {
      setSubmitting(false)
    }
  }

  async function removeProject(projectId: number) {
    if (!window.confirm('Delete this project? This cannot be undone.')) return
    setSubmitting(true)
    setError(null)
    setFeedback(null)
    try {
      const response = await fetch(addAuthToUrl(`${API}/projects/${projectId}`), {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || 'Failed to delete project')
      }
      setFeedback('Project deleted.')
      loadProjects()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-br from-slate-950 via-slate-900 to-neutral-950">
      <main className="mx-auto max-w-7xl px-6 py-12">
        {/* Company Logo */}
        <div className="flex items-center justify-center mb-8">
          <img
            src="/logo2.png"
            alt="VietDynamic Logo"
            className="h-32 w-auto object-contain"
            draggable={false}
          />
        </div>

        <section className="mt-12 rounded-3xl border border-white/10 bg-white/5 p-8 text-white shadow-[0_40px_120px_-40px_rgba(15,23,42,0.55)] backdrop-blur">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <p className="text-sm uppercase tracking-[0.5em] text-slate-300">Getting started</p>
              <h2 className="text-3xl font-semibold text-white sm:text-4xl">Design your next labeling project</h2>
              <p className="max-w-2xl text-sm text-slate-300 sm:text-base">
                Choose the perfect blueprint, invite your labeling team, then move straight into inference-ready
                tooling. Everything you need sits together in a clean workspace.
              </p>
            </div>
            <div className="flex w-full flex-col justify-center gap-3 rounded-2xl border border-white/15 bg-white/5 p-6 text-sm text-slate-200 shadow-inner sm:w-72">
              <div className="font-semibold uppercase tracking-wide text-slate-300">Project checklist</div>
              <ul className="space-y-2 text-[13px] text-slate-200">
                <li className="flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-200">
                    ✓
                  </span>
                  Pick a labeling workflow preset
                </li>
                <li className="flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-200">
                    ✓
                  </span>
                  Define access level & notes
                </li>
                <li className="flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-200">
                    ✓
                  </span>
                  Import media and begin auto-labeling
                </li>
              </ul>
            </div>
          </div>
        </section>

        <div className="mt-8 space-y-4">
          {feedback && (
            <div className="rounded-3xl border border-emerald-400/40 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-200 shadow">
              {feedback}
            </div>
          )}
          {error && (
            <div className="rounded-3xl border border-rose-400/40 bg-rose-500/10 px-5 py-4 text-sm text-rose-200 shadow">
              {error}
            </div>
          )}
        </div>

        <section className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <CreateProjectPanel
            name={name}
            description={description}
            onNameChange={setName}
            onDescriptionChange={setDescription}
            selectedType={selectedType}
            onTypeChange={setSelectedType}
            publishLevel={publishLevel}
            onPublishLevelChange={setPublishLevel}
            onSubmit={createProject}
            submitting={submitting}
          />

          <ProjectListPanel
            projects={projects}
            loading={loading}
            submitting={submitting}
            onOpen={(id) => {
              onShowSplash()
              onOpen(id)
            }}
            onDelete={removeProject}
            onToggleVisibility={toggleProjectVisibility}
          />
        </section>
      </main>
    </div>
  )
}

type CreateProjectPanelProps = {
  name: string
  description: string
  onNameChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  selectedType: ProjectTypeId
  onTypeChange: (type: ProjectTypeId) => void
  publishLevel: PublishLevel
  onPublishLevelChange: (level: PublishLevel) => void
  onSubmit: () => void
  submitting: boolean
}

function CreateProjectPanel({
  name,
  description,
  onNameChange,
  onDescriptionChange,
  selectedType,
  onTypeChange,
  publishLevel,
  onPublishLevelChange,
  onSubmit,
  submitting,
}: CreateProjectPanelProps) {
  return (
    <div className="overflow-hidden rounded-3xl border border-white/15 bg-white/95 shadow-[0_40px_80px_-45px_rgba(15,23,42,0.7)]">
      <div className="bg-gradient-to-r from-sky-500/10 via-transparent to-transparent px-8 py-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-neutral-400">Workspace</p>
            <h2 className="text-2xl font-semibold text-neutral-900">New Project Blueprint</h2>
            <p className="mt-2 text-sm text-neutral-500">
              Configure your dataset pipeline in minutes. Fill in the essentials and we&apos;ll stage the workspace
              for you automatically.
            </p>
          </div>
          <div className="rounded-full border-2 border-sky-10 0 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-sky-600 shadow-md shadow-xl">
            Rapid Setup
          </div>
        </div>
      </div>

      <div className="space-y-8 px-8 pb-8 pt-6">
        <div className="grid gap-5 lg:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm font-medium text-neutral-700">
            Project Name
            <input
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="e.g. Street Scenes"
              className="w-full rounded-2xl border border-neutral-400 bg-white px-4 py-3 text-sm text-neutral-900 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium text-neutral-700">
            Notes (optional)
            <input
              value={description}
              onChange={(event) => onDescriptionChange(event.target.value)}
              placeholder="Add a short description"
              className="w-full rounded-2xl border border-neutral-400 bg-white px-4 py-3 text-sm text-neutral-900 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
            />
          </label>
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-neutral-800">Project type</h3>
            <span className="text-xs text-neutral-400">Select one workflow preset to start from</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {PROJECT_TYPE_OPTIONS.map((option) => {
              const isActive = option.id === selectedType
              const abbreviation = option.label
                .split(' ')
                .map((word) => word.charAt(0))
                .join('')
                .slice(0, 2)
                .toUpperCase()
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onTypeChange(option.id)}
                  className={`group relative flex h-full flex-col items-start gap-4 overflow-hidden rounded-2xl border p-5 text-left transition shadow-sm hover:-translate-y-0.5 hover:shadow-md ${
                    isActive ? 'border-sky-400 bg-sky-50' : 'border-neutral-400 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm font-semibold transition ${
                        isActive ? 'bg-sky-500 text-white' : 'bg-neutral-900/5 text-neutral-700'
                      }`}
                    >
                      {abbreviation}
                    </div>
                    <div>
                      <div className="text-base font-semibold text-neutral-900">{option.label}</div>
                      <p className="text-xs text-neutral-500">Best for {option.description.toLowerCase()}</p>
                    </div>
                  </div>
                  <p className="text-sm text-neutral-600">{option.description}</p>
                  <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                    {option.tags.map((tag) => (
                      <span
                        key={tag}
                        className={`rounded-full px-2 py-1 transition ${
                          isActive ? 'bg-white text-sky-600 shadow-sm' : 'bg-neutral-100 text-neutral-600'
                        }`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  {isActive && (
                    <span className="absolute right-4 top-4 rounded-full bg-sky-500/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
                      Selected
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-neutral-800">Visibility</h3>
            <span className="text-xs text-neutral-400">Control who can explore the dataset</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {PUBLISH_OPTIONS.map((option) => {
              const isActive = option.id === publishLevel
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onPublishLevelChange(option.id)}
                  className={`rounded-2xl border px-4 py-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${
                    isActive ? 'border-sky-400 bg-sky-50' : 'border-neutral-400 bg-white'
                  }`}
                >
                  <div className="text-sm font-semibold text-neutral-900">{option.label}</div>
                  <div className="mt-1 text-xs text-neutral-500">{option.note}</div>
                </button>
              )
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Creating...' : 'Create project'}
        </button>
      </div>
    </div>
  )
}

type ProjectListPanelProps = {
  projects: ProjectSummary[]
  loading: boolean
  submitting: boolean
  onOpen: (id: number) => void
  onDelete: (id: number) => void
  onToggleVisibility: (id: number, currentLevel: PublishLevel) => void
}

function ProjectListPanel({ projects, loading, submitting, onOpen, onDelete, onToggleVisibility }: ProjectListPanelProps) {
  return (
    <div className="overflow-hidden rounded-3xl border border-white/15 bg-white/90 shadow-[0_40px_80px_-45px_rgba(15,23,42,0.6)]">
      <div className="flex items-center justify-between gap-4 border-b border-neutral-100 bg-gradient-to-r from-neutral-50 to-white px-7 py-6">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Existing projects</h2>
          <p className="text-xs text-neutral-500">Jump back into any workspace or tidy up those you no longer need.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (projects.length) onOpen(projects[0].id)
          }}
          disabled={!projects.length}
          className="rounded-full border border-neutral-400 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-600 transition hover:border-neutral-400 hover:text-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Quick open
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center gap-2 px-7 py-16 text-sm text-neutral-500">
          <div className="h-12 w-12 animate-spin rounded-full border-2 border-dashed border-neutral-300" />
          Loading projects...
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 px-7 py-16 text-center text-sm text-neutral-500">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">✱</div>
          <p className="max-w-xs text-neutral-500">No projects yet. Create one on the left to launch your workflow.</p>
        </div>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {projects.map((project) => {
            const info = getProjectTypeInfo(project.project_type)
            return (
              <li key={project.id} className="px-7 py-5 transition hover:bg-neutral-50/60">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-neutral-900">{project.name}</span>
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                        #{project.id}
                      </span>
                    </div>
                    {project.description ? (
                      <p className="max-w-md text-sm text-neutral-500">{project.description}</p>
                    ) : (
                      <p className="text-sm italic text-neutral-400">No notes added yet.</p>
                    )}
                    <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                      {info && <span className="rounded-full bg-neutral-100 px-2 py-1">{info.label}</span>}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onToggleVisibility(project.id, project.publish_level)
                        }}
                        disabled={submitting}
                        className={`rounded-full px-2 py-1 transition ${
                          project.publish_level === 'public'
                            ? 'bg-green-200 text-green-700 hover:bg-green-300'
                            : 'bg-yellow-200 text-yellow-700 hover:bg-yellow-300'
                        } ${submitting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        title="Click to toggle visibility"
                      >
                        {project.publish_level}
                      </button>
                      {project.created_at && (
                        <span className="rounded-full bg-neutral-100 px-2 py-1">
                          {new Date(project.created_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpen(project.id)}
                      className="rounded-2xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-neutral-800"
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        onDelete(project.id)
                      }}
                      className="rounded-2xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:border-rose-400 hover:text-rose-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}




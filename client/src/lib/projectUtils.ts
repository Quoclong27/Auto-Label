import { api } from './api'

/**
 * Check if user needs to fork a project before editing
 * Returns forked project ID if forking happened, otherwise returns original ID
 */
export async function ensureEditableProject(
  projectId: number,
  isOwner: boolean,
  isPublic: boolean
): Promise<number> {
  // If user owns the project, no need to fork
  if (isOwner) {
    return projectId
  }

  // If it's a public project and user doesn't own it, fork it
  if (isPublic) {
    try {
      const forked = await api<{ id: number }>(`/projects/${projectId}/fork`, {
        method: 'POST',
      })
      console.log('✅ Project forked:', forked.id)
      return forked.id
    } catch (err) {
      console.error('❌ Failed to fork project:', err)
      throw new Error('Failed to create your own copy of this project')
    }
  }

  // For private shared projects, user can edit directly
  return projectId
}

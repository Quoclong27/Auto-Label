export interface User {
  email: string
  is_admin: boolean
}

export interface Project {
  id: number
  name: string
  description: string | null
  project_type: string
  publish_level: 'private' | 'public'
  created_at: string | null
  owner_email?: string
  image_count?: number
  annotation_count?: number
  thumbnail_url?: string
}

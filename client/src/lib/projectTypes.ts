export type ProjectTypeId =
  | 'object_detection'
  | 'classification'
  | 'instance_segmentation'
  | 'keypoint_detection'
  | 'multimodal'

interface ProjectTypeInfo {
  id: ProjectTypeId
  label: string
  description: string
  tags: string[]
}

export const PROJECT_TYPE_OPTIONS: ProjectTypeInfo[] = [
  {
    id: 'object_detection',
    label: 'Object Detection',
    description: 'Identify objects and their positions with bounding boxes.',
    tags: ['Bounding Boxes', 'Counts', 'Tracking'],
  },
  {
    id: 'classification',
    label: 'Classification',
    description: 'Assign labels to the entire image.',
    tags: ['Image Labels', 'Filtering', 'Multi Label'],
  },
  {
    id: 'instance_segmentation',
    label: 'Instance Segmentation',
    description: 'Detect multiple objects and their shape.',
    tags: ['Polygons', 'Measuring', 'Odd Shapes'],
  },
  {
    id: 'keypoint_detection',
    label: 'Keypoint Detection',
    description: 'Identify keypoints on subjects.',
    tags: ['Skeleton Structure', 'Pose Estimation'],
  },
  {
    id: 'multimodal',
    label: 'Multimodal',
    description: 'Describe images using text pairs.',
    tags: ['Prompts', 'Visual QA', 'Captions'],
  },
]

const typeInfoMap: Record<ProjectTypeId, ProjectTypeInfo> = PROJECT_TYPE_OPTIONS.reduce(
  (acc, info) => {
    acc[info.id] = info
    return acc
  },
  {} as Record<ProjectTypeId, ProjectTypeInfo>,
)

export function getProjectTypeInfo(id: ProjectTypeId | string | null | undefined): ProjectTypeInfo | undefined {
  if (!id) return undefined
  const key = id as ProjectTypeId
  return typeInfoMap[key]
}

export type PublishLevel = 'private' | 'public'

export const PUBLISH_OPTIONS: { id: PublishLevel; label: string; note: string }[] = [
  { id: 'private', label: 'Private', note: 'Only you can access this project.' },
  { id: 'public', label: 'Publish', note: 'Anyone with an account can view it.' },
]


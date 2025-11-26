import React, {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { api, API, addAuthToUrl } from '../lib/api'
import { getProjectTypeInfo, ProjectTypeId } from '../lib/projectTypes'
import ImagePicker, { PickerImage, PickerDetection } from '../components/ImagePicker'
import LabelReview, { DetectionInstance } from '../components/LabelReview'
import { PROMPT_FREE_VOCAB } from '../lib/promptFreeVocab'

type Mode = 'text' | 'visualBox' | 'visualMask' | 'promptFree'

type ProjectImage = PickerImage

interface ProjectMeta {
  id: number
  name: string
  description: string | null
  project_type: ProjectTypeId
  publish_level: 'private' | 'public'
  created_at: string | null
}

type SegmentationFlag = {
  index: number
  name: string
  reason: string[]
}

type Proposal = {
  instances: DetectionInstance[]
  prompt_labels: string[]
  prompt_embeddings: number[][]
  prompt_embeddings_raw: number[][]
  prompt_label_keys: string[]
  diagnostics: {
    num_masks: number
    raw_masks: number
    threshold: number
    prompt_type: string
    low_quality: boolean
    auto_split_index: number
    auto_assignment: { auto: number; review: number }
  }
  flagged_instances: SegmentationFlag[]
  flagged_images: string[]
}

type Box = {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
  label: string
  embedding: number[] | null
}

interface OverlayBox {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
  instanceIndex: number
  label: string
  muted: boolean
}

type LastInferencePreset =
  | { mode: 'text'; texts: string[] }
  | { mode: 'promptFree' }
  | { mode: 'visualBox'; labels: string[]; embeddings: number[][] }

type VisualBoxPreset = Extract<LastInferencePreset, { mode: 'visualBox' }>

interface ProjectDetailProps {
  id: number
  onBack: () => void
  onLogout: () => void
}

const DETECTION_MODEL_OPTIONS = ['yoloe-v8s', 'yoloe-v8m', 'yoloe-v8l', 'yoloe-11s', 'yoloe-11m', 'yoloe-11l']
const SAM2_MODEL_OPTIONS = ['sam2_t', 'sam2_s', 'sam2_b', 'sam2_l', 'sam2.1_t', 'sam2.1_s', 'sam2.1_b', 'sam2.1_l']
const DETECTION_MODES: Mode[] = ['text', 'visualBox', 'visualMask', 'promptFree']
const SAM_MODES: Mode[] = ['text', 'visualBox', 'visualMask']

const MODE_LABELS_BASE: Record<Mode, string> = {
  text: 'Text Prompt',
  visualBox: 'Box Prompt',
  visualMask: 'Mask Prompt',
  promptFree: 'Prompt-Free',
}

const MODE_LABELS_SEG: Record<Mode, string> = {
  text: 'Smart Select - Text',
  visualBox: 'Smart Select - Box',
  visualMask: 'Smart Select - Mask',
  promptFree: 'Prompt-Free',
}


function classNames(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

function withCacheBuster(url: string, key: string | number): string {
  if (!url) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}cb=${key}`
}

function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function makeBoxId(): string {
  return `box-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function computeBoxStyle(box: { x1: number; y1: number; x2: number; y2: number }, image: ProjectImage) {
  const width = Math.max(image.width, 1)
  const height = Math.max(image.height, 1)
  const left = (Math.min(box.x1, box.x2) / width) * 100
  const top = (Math.min(box.y1, box.y2) / height) * 100
  const boxWidth = (Math.abs(box.x2 - box.x1) / width) * 100
  const boxHeight = (Math.abs(box.y2 - box.y1) / height) * 100
  return {
    left: `${clamp(left, 0, 100)}%`,
    top: `${clamp(top, 0, 100)}%`,
    width: `${clamp(boxWidth, 0, 100)}%`,
    height: `${clamp(boxHeight, 0, 100)}%`,
  }
}

/**
 * NEW: send integer pixel coordinates to backend
 */
function toIntegerPixelBoxes(
  boxes: { x1: number; y1: number; x2: number; y2: number }[]
) {
  return boxes.map(({ x1, y1, x2, y2 }) => {
    const X1 = Math.round(Math.min(x1, x2))
    const Y1 = Math.round(Math.min(y1, y2))
    const X2 = Math.round(Math.max(x1, x2))
    const Y2 = Math.round(Math.max(y1, y2))
    return { x1: X1, y1: Y1, x2: X2, y2: Y2 }
  })
}

const sanitizeEmbeddingVector = (vec: unknown): number[] => {
  if (!Array.isArray(vec)) return []
  const cleaned = vec
    .map((value) => {
      if (typeof value === 'number' && Number.isFinite(value)) return value
      if (typeof value === 'string') {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : null
      }
      return null
    })
    .filter((value): value is number => typeof value === 'number')
  return cleaned
}

const stripVariant = (label: string): string => {
  if (typeof label !== 'string') return `${label}`
  const raw = label.trim()
  if (!raw.includes('#')) return raw
  const [base] = raw.split('#', 1)
  return base.trim()
}

const makeUniqueLabels = (bases: string[]): string[] => {
  const counts: Record<string, number> = {}
  return bases.map((rawBase, index) => {
    const base = rawBase && rawBase.trim().length ? rawBase.trim() : `prompt_${index + 1}`
    const current = (counts[base] = (counts[base] ?? 0) + 1)
    return current === 1 ? base : `${base}#${current}`
  })
}

export default function ProjectDetail({ id, onBack, onLogout }: ProjectDetailProps) {
  const [project, setProject] = useState<ProjectMeta | null>(null)
  const [projectLoading, setProjectLoading] = useState(true)

  const [images, setImages] = useState<ProjectImage[]>([])
  const [loadingImages, setLoadingImages] = useState(false)
  const [selectedImageId, setSelectedImageId] = useState<number | null>(null)

  const [mode, setMode] = useState<Mode>('text')
  const [textPrompts, setTextPrompts] = useState('person,car')
  const [modelId, setModelId] = useState('yoloe-v8l')
  const [imageSize, setImageSize] = useState(640)
  const [confThreshold, setConfThreshold] = useState(0.25)
  const [overlapThreshold, setOverlapThreshold] = useState(0.7)

  const [boxPrompts, setBoxPrompts] = useState<Box[]>([])
  const [visualUsage, setVisualUsage] = useState<'intra' | 'cross'>('intra')
  const [targetImageId, setTargetImageId] = useState<number | null>(null)
  const [maskUpload, setMaskUpload] = useState<{ base64: string | null; name: string | null }>({
    base64: null,
    name: null,
  })
  const [smartSelectMode, setSmartSelectMode] = useState<'polygon' | 'pixels'>('polygon')
  const [pixelBrushMode, setPixelBrushMode] = useState<'add' | 'erase'>('add')
  const [pixelBrushSize, setPixelBrushSize] = useState(24)
  const [pixelMaskData, setPixelMaskData] = useState<string | null>(null)
  const [pixelMaskUndoStack, setPixelMaskUndoStack] = useState<string[]>([])
  const [pixelMaskRedoStack, setPixelMaskRedoStack] = useState<string[]>([])

  const [annotationId, setAnnotationId] = useState<number | null>(null)
  const [proposals, setProposals] = useState<Proposal | null>(null)
  const [keepSelection, setKeepSelection] = useState<boolean[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [isReviewing, setIsReviewing] = useState(false)

  const [exportingFormat, setExportingFormat] = useState<null | 'coco' | 'yolo'>(null)
  const [exportResult, setExportResult] = useState<{
    format: 'coco' | 'yolo'
    url: string
    ratios: { train: number; val: number; test: number }
    generatedAt: number
  } | null>(null)
  const [splitTrain, setSplitTrain] = useState('80')
  const [splitVal, setSplitVal] = useState('10')
  const [splitTest, setSplitTest] = useState('10')
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)

  const [approvedCache, setApprovedCache] = useState<Record<number, { instances: DetectionInstance[]; updatedAt: string | null }>>({})
  const annotationIdRef = useRef<number | null>(annotationId)
  const approvedClassSummary = useMemo(() => {
    const counts: Record<string, number> = {}
    Object.values(approvedCache).forEach((entry) => {
      entry.instances?.forEach((inst) => {
        const name = inst.class_name?.trim() || 'unlabeled'
        counts[name] = (counts[name] ?? 0) + 1
      })
    })
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
  }, [approvedCache])

  const [lastInferencePreset, setLastInferencePreset] = useState<LastInferencePreset | null>(null)
  const [autoPresetReady, setAutoPresetReady] = useState(false) // toggled once a usable prompt preset is available

  const [pendingAutoRun, setPendingAutoRun] = useState<LastInferencePreset | null>(null)
  const [customLabelHistory, setCustomLabelHistory] = useState<string[]>([])
  const [pendingLabelBoxId, setPendingLabelBoxId] = useState<string | null>(null)
  const autoRunAttemptedRef = useRef<Record<number, boolean>>({})
  const [isImageDrawingMode, setIsImageDrawingMode] = useState(false)

  const applyPromptPresetFromProposals = useCallback(
    (
      proposal: Proposal | null | undefined,
      options: { mergeWith: VisualBoxPreset | null }
    ): LastInferencePreset | null => {
      if (!proposal) return null
      const rawLabels = proposal.prompt_labels ?? []
      const rawEmbeddings =
        proposal.prompt_embeddings_raw ??
        proposal.prompt_embeddings ??
        []
      if (!rawEmbeddings.length) return null

      const embeddings = rawEmbeddings
        .map((vec) => sanitizeEmbeddingVector(vec))
        .filter((vec): vec is number[] => Array.isArray(vec) && vec.length > 0)
      if (!embeddings.length) return null

      const labels =
        rawLabels.length === embeddings.length
          ? rawLabels.map((label, idx) => label.trim() || `prompt_${idx + 1}`)
          : embeddings.map((_, idx) => `prompt_${idx + 1}`)

      const mergeWith = options.mergeWith
      let preset: VisualBoxPreset = {
        mode: 'visualBox',
        labels,
        embeddings,
      }
      if (mergeWith) {
        preset = {
          mode: 'visualBox',
          labels: [...mergeWith.labels, ...labels],
          embeddings: [...mergeWith.embeddings, ...embeddings],
        }
      }
      setLastInferencePreset(preset)
      setAutoPresetReady(true)
      return preset
    },
    []
  )

  const projectTypeInfo = useMemo(
    () => getProjectTypeInfo(project?.project_type ?? null),
    [project?.project_type]
  )
  const isInstanceSegmentation = project?.project_type === 'instance_segmentation'
  const modeLabels = isInstanceSegmentation ? MODE_LABELS_SEG : MODE_LABELS_BASE
  const availableModes = isInstanceSegmentation ? SAM_MODES : DETECTION_MODES
  const modelOptions = isInstanceSegmentation ? SAM2_MODEL_OPTIONS : DETECTION_MODEL_OPTIONS

  const labelSuggestions = useMemo(() => {
    const base = parseCsv(textPrompts)
    const presetLabels =
      lastInferencePreset && lastInferencePreset.mode === 'visualBox'
        ? lastInferencePreset.labels.map(stripVariant)
        : []
    const history = customLabelHistory
    const current = boxPrompts.map((box) => box.label).filter(Boolean).map(stripVariant)
    return Array.from(new Set([...base, ...presetLabels, ...history, ...current].filter((item) => item && item.length))).slice(0, 128)
  }, [textPrompts, lastInferencePreset, customLabelHistory, boxPrompts])

  const handlePixelMaskChange = useCallback(
    (dataUrl: string | null, opts: { pushHistory: boolean }) => {
      setPixelMaskData((prev) => {
        if (opts.pushHistory && prev && prev !== dataUrl) {
          setPixelMaskUndoStack((stack) => [...stack.slice(-19), prev])
          setPixelMaskRedoStack([])
        }
        return dataUrl
      })
    },
    []
  )

  const handlePixelMaskReset = useCallback(() => {
    setPixelMaskData(null)
    setPixelMaskUndoStack([])
    setPixelMaskRedoStack([])
  }, [])

  const handlePixelMaskUndo = useCallback(() => {
    setPixelMaskUndoStack((stack) => {
      if (!stack.length) return stack
      const nextStack = stack.slice(0, -1)
      const last = stack[stack.length - 1]
      setPixelMaskRedoStack((redo) => (pixelMaskData ? [...redo.slice(-19), pixelMaskData] : redo))
      setPixelMaskData(last)
      return nextStack
    })
  }, [pixelMaskData])

  const handlePixelMaskRedo = useCallback(() => {
    setPixelMaskRedoStack((stack) => {
      if (!stack.length) return stack
      const nextStack = stack.slice(0, -1)
      const last = stack[stack.length - 1]
      setPixelMaskUndoStack((undo) => (pixelMaskData ? [...undo.slice(-19), pixelMaskData] : undo))
      setPixelMaskData(last)
      return nextStack
    })
  }, [pixelMaskData])

  useEffect(() => {
    if (isInstanceSegmentation) {
      if (!SAM2_MODEL_OPTIONS.includes(modelId)) {
        setModelId(SAM2_MODEL_OPTIONS[0])
      }
      if (mode === 'promptFree') {
        setMode('visualBox')
      }
      setImageSize((prev) => (prev === 1024 ? prev : 1024))
      if (autoPresetReady || lastInferencePreset) {
        setAutoPresetReady(false)
        setLastInferencePreset(null)
        setPendingAutoRun(null)
      }
    } else {
      if (!DETECTION_MODEL_OPTIONS.includes(modelId)) {
        setModelId('yoloe-v8l')
      }
    }
  }, [isInstanceSegmentation, mode, modelId, autoPresetReady, lastInferencePreset])

  // Load project meta
  useEffect(() => {
    setProjectLoading(true)
    api<ProjectMeta>(`/projects/${id}`)
      .then((data) => {
        setProject(data)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load project details')
      })
      .finally(() => setProjectLoading(false))
  }, [id])

  const loadImages = useCallback(async () => {
    setLoadingImages(true)
    try {
      const data = await api<ProjectImage[]>(`/projects/${id}/images`)
      const cacheKey = Date.now().toString(36)
      const hydrated = data.map((img) => {
        const preview = (img.annotation_preview as PickerDetection[] | undefined) ?? []
        return {
          ...img,
          annotation_id: img.annotation_id ?? null,
          annotation_updated_at: img.annotation_updated_at ?? null,
          annotation_preview: preview,
            url: withCacheBuster(img.url, `${cacheKey}-${img.id}-${img.annotation_updated_at ?? 'na'}`),
        }
      })
      setImages(hydrated)
      setApprovedCache(() => {
        const next: Record<number, { instances: DetectionInstance[]; updatedAt: string | null }> = {}
        hydrated.forEach((img) => {
          if (img.annotation_preview && img.annotation_preview.length) {
            next[img.id] = {
              instances: img.annotation_preview.map((inst: PickerDetection) => ({
                bbox: inst.bbox as [number, number, number, number],
                class_name: inst.class_name,
                confidence: inst.confidence,
                embedding: inst.embedding ?? null,
                instance_name: (inst as any).instance_name ?? undefined,
                match_score: (inst as any).match_score ?? undefined,
              })),
              updatedAt: img.annotation_updated_at ?? null,
            }
          }
        })
        return next
      })
      setError(null)
      setSelectedImageId((prev) => {
        if (prev && hydrated.some((img) => img.id === prev)) {
          return prev
        }
        return hydrated.length ? hydrated[0].id : null
      })
      return hydrated
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load images')
      return []
    } finally {
      setLoadingImages(false)
    }
  }, [id])

  useEffect(() => {
    loadImages()
  }, [loadImages])

  // Reset per-image state on selection change
  useEffect(() => {
    setBoxPrompts([])
    setProposals(null)
    setAnnotationId(null)
    annotationIdRef.current = null
    setKeepSelection([])
    setStatus(null)
    setVisualUsage('intra')
    setTargetImageId(null)
    setMaskUpload({ base64: null, name: null })
  }, [selectedImageId])

  // Reset per-mode UI when mode changes
  useEffect(() => {
    setProposals(null)
    setAnnotationId(null)
    annotationIdRef.current = null
    setKeepSelection([])
    if (mode !== 'visualBox') {
      setBoxPrompts([])
    }
    if (mode !== 'visualMask') {
      setMaskUpload({ base64: null, name: null })
    }
    if (mode === 'text' || mode === 'promptFree') {
      setVisualUsage('intra')
      setTargetImageId(null)
    }
  }, [mode])

useEffect(() => {
  annotationIdRef.current = annotationId
}, [annotationId])

  useEffect(() => {
    if (isInstanceSegmentation) {
      setIsExportModalOpen(false)
    }
  }, [isInstanceSegmentation])

  useEffect(() => {
    if (!isExportModalOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsExportModalOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isExportModalOpen])

useEffect(() => {
  handlePixelMaskReset()
}, [selectedImageId, handlePixelMaskReset])

  const selectedImage = useMemo(
    () => images.find((img) => img.id === selectedImageId) ?? null,
    [images, selectedImageId]
  )
  const selectedAnnotationVersion = selectedImage?.annotation_updated_at ?? null
  const cachedApproved = selectedImageId ? approvedCache[selectedImageId] : undefined

  // Pull latest approved annotation preview for the selected image
  useEffect(() => {
    if (!selectedImageId || !selectedImage) return

    if (!selectedImage.annotation_id || !selectedAnnotationVersion) {
      if (cachedApproved) {
        setApprovedCache((prev) => {
          if (!(selectedImageId in prev)) return prev
          const next = { ...prev }
          delete next[selectedImageId]
          return next
        })
      }
      if (!annotationIdRef.current) {
        setProposals(null)
        setKeepSelection([])
      }
      return
    }

    const applyInstances = (instances: DetectionInstance[]) => {
        if (annotationIdRef.current) return
        setProposals((prev) => {
          const prevInstances = prev?.instances ?? []
        const sameLength = prevInstances.length === instances.length
        const same =
          sameLength &&
          prevInstances.every((inst, idx) => {
            const other = instances[idx]
            return (
              inst.class_name === other.class_name &&
              Math.abs(inst.confidence - other.confidence) < 1e-6 &&
              inst.bbox.every((value, i) => value === other.bbox[i])
            )
          })
        return same ? prev : { instances }
      })
      setKeepSelection((prev) => {
        if (prev.length === instances.length && prev.every((value) => value === true)) return prev
        return Array.from({ length: instances.length }, () => true)
      })
    }

    if (cachedApproved && cachedApproved.updatedAt === selectedAnnotationVersion) {
      applyInstances(cachedApproved.instances)
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const data = await api<{ annotation_id: number | null; instances: DetectionInstance[]; updated_at: string | null }>(
          `/images/${selectedImageId}/annotations/latest`
        )
        if (cancelled) return
          const instances = data.instances ?? []
          const updatedAt = data.updated_at ?? selectedAnnotationVersion
        setApprovedCache((prev) => ({
          ...prev,
          [selectedImageId]: { instances, updatedAt },
        }))
        applyInstances(instances)
      } catch {
        // silent
      }
    })()

    return () => {
      cancelled = true
    }
    // NOTE: do not add `api` (imported function) to deps
  }, [selectedImageId, selectedImage, selectedAnnotationVersion, cachedApproved, annotationId])

  const instances = proposals?.instances ?? []

  const detectionBoxes = useMemo<OverlayBox[]>(() => {
    if (!selectedImage) return []
    return instances.map((inst, index) => ({
      id: `det-${index}`,
      instanceIndex: index,
      x1: inst.bbox[0],
      y1: inst.bbox[1],
      x2: inst.bbox[2],
      y2: inst.bbox[3],
        label: inst.instance_name || inst.class_name,
      muted: keepSelection[index] === false,
    }))
  }, [instances, selectedImage, keepSelection])

  const selectableTargets = useMemo(
    () => images.filter((img) => img.id !== selectedImageId),
    [images, selectedImageId]
  )

  useEffect(() => {
      if (visualUsage === 'cross') {
        if (!selectableTargets.some((item) => item.id === targetImageId)) {
          setTargetImageId(selectableTargets[0]?.id ?? null)
        }
    } else {
      setTargetImageId(null)
    }
  }, [visualUsage, selectableTargets, targetImageId])

  const handleMaskFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      setMaskUpload({ base64: null, name: null })
      return
    }
    const reader = new FileReader()
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : null
      setMaskUpload({ base64: result, name: file.name })
    }
    reader.readAsDataURL(file)
  }

  const handleToggleInstance = (index: number) => {
    if (!annotationId) return
    setKeepSelection((prev) => {
      const baseline = instances.map((_, idx) => prev[idx] ?? true)
      baseline[index] = !baseline[index]
      return baseline
    })
  }

  const handleUpdateInstanceBBox = (index: number, bbox: [number, number, number, number]) => {
    if (!annotationId) return
    setProposals((current) => {
      if (!current || !current.instances || !current.instances[index]) return current
      const updated = [...current.instances]
      updated[index] = {
        ...updated[index],
        bbox,
      }
      return { ...current, instances: updated }
    })
  }

  const handleRenameInstance = (index: number, name: string) => {
    if (!annotationId) return
    setProposals((current) => {
      if (!current || !current.instances || !current.instances[index]) return current
      const updated = [...current.instances]
      const cleaned = name.trim()
      const existingInstance = updated[index]
      const instanceName = existingInstance.instance_name
      let displayName = instanceName
        if (instanceName) {
          const base = instanceName.split('_')[0]
          const suffix = instanceName.split('_')[1] ?? '1'
        displayName = `${cleaned || base}_${suffix}`
      }
      updated[index] = {
        ...updated[index],
        class_name: cleaned,
        instance_name: displayName || (cleaned || name),
      }
      return { ...current, instances: updated }
    })
    const trimmed = name.trim()
    if (trimmed) {
      const base = stripVariant(trimmed)
      setCustomLabelHistory((prev) => Array.from(new Set([...prev, base])).slice(-256))
    }
  }

  const handleAddManualBoxes = (manualBoxes: Array<{ x1: number; y1: number; x2: number; y2: number; class_name: string }>) => {
    if (!annotationId) return

    setProposals((current) => {
      if (!current) return current
      const newInstances = manualBoxes.map((box, idx) => ({
        bbox: [box.x1, box.y1, box.x2, box.y2] as [number, number, number, number],
        confidence: 1.0,
        class_name: box.class_name,
        instance_name: `${box.class_name}_manual_${idx + 1}`,
        embedding: null,
      }))
      return {
        ...current,
        instances: [...(current.instances || []), ...newInstances],
      }
    })

    // Update custom label history
    manualBoxes.forEach((box) => {
      const base = stripVariant(box.class_name)
      setCustomLabelHistory((prev) => Array.from(new Set([...prev, base])).slice(-256))
    })
  }

  const handleSmartSelectReset = useCallback(() => {
    if (smartSelectMode === 'pixels') {
      handlePixelMaskReset()
    } else {
      setBoxPrompts([])
    }
  }, [smartSelectMode, handlePixelMaskReset])

  const runSam2Inference = async (modeToUse: Mode, preset: LastInferencePreset) => {
    const targetImage = selectedImage
    if (!targetImage) {
      throw new Error('Select an image before running Smart Select.')
    }
    const promptType =
      modeToUse === 'text'
        ? 'text'
        : modeToUse === 'visualMask' || (modeToUse === 'visualBox' && smartSelectMode === 'pixels')
          ? 'mask'
          : 'box'
    const payload: Record<string, unknown> = {
      project_id: id,
      image_id: targetImage.id,
      prompt_type: promptType,
      model_id: modelId,
      threshold: confThreshold,
      save_masks: true,
      multimask_output: true,
      text_box_threshold: Math.max(0.15, confThreshold),
      text_threshold: 0.25,
    }
    if (promptType === 'text') {
      const source = preset?.mode === 'text' ? preset.texts.join(',') : textPrompts
      const cleaned = source.trim()
      if (!cleaned) {
        throw new Error('Nh p  t nh t m t m  t     Smart Select s  d ng.')
      }
      payload.text = cleaned
    } else if (promptType === 'box') {
      if (!boxPrompts.length) throw new Error('Draw at least one guide box.')
      payload.boxes = toIntegerPixelBoxes(boxPrompts)
      payload.labels = boxPrompts.map((box, idx) => {
        const label = box.label?.trim() ?? ''
        return label && label.length ? label : `object_${idx + 1}`
      })
    } else if (promptType === 'mask') {
      const maskSource =
        modeToUse === 'visualMask'
          ? maskUpload.base64
          : smartSelectMode === 'pixels'
            ? pixelMaskData
            : null
      if (!maskSource) {
        throw new Error(
          smartSelectMode === 'pixels'
            ? 'Use the Smart Select brush to paint a foreground region before running.'
            : 'Upload or draw a mask to guide Smart Select.'
        )
      }
        payload.mask_base64 = maskSource
        if (modeToUse === 'visualMask') {
          payload.labels = maskUpload.name ? [maskUpload.name] : undefined
        } else if (smartSelectMode === 'pixels') {
          const brushLabel = boxPrompts[0]?.label?.trim() ?? ''
          payload.labels = [brushLabel && brushLabel.length ? brushLabel : 'pixel_prompt']
        }
    }
    return api<{ annotation_id: number; proposals: Proposal }>('/sam2/infer', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  const handleRunInference = async (preset: LastInferencePreset) => {
    const targetImage = selectedImage
    if (!targetImage) {
      setError('Please select an image before running inference.')
      return
    }

    const modeToUse: Mode = preset?.mode ?? mode
    if (preset && mode !== preset.mode) {
      setMode(preset.mode)
    }

    setIsRunning(true)
    setError(null)
    setStatus(null)

    try {
      let response: { annotation_id: number; proposals: Proposal }

      if (isInstanceSegmentation) {
        response = await runSam2Inference(modeToUse, preset)
        setLastInferencePreset(null)
        setAutoPresetReady(false)
      } else if (modeToUse === 'text') {
        const prompts = preset?.mode === 'text' ? preset.texts : parseCsv(textPrompts)
        if (!prompts.length) throw new Error('Enter at least one text prompt.')
        response = await api<{ annotation_id: number; proposals: Proposal }>('/infer/text', {
          method: 'POST',
          body: JSON.stringify({
            project_id: id,
            image_id: targetImage.id,
            texts: prompts,
            model_id: modelId,
            image_size: imageSize,
            conf: confThreshold,
            iou: overlapThreshold,
          }),
        })
        setLastInferencePreset({ mode: 'text', texts: prompts })
      } else if (modeToUse === 'visualBox') {
        const boxesForInference = boxPrompts
        const resolvedPreset: VisualBoxPreset | null =
          preset?.mode === 'visualBox'
            ? (preset as VisualBoxPreset)
            : autoPresetReady && lastInferencePreset?.mode === 'visualBox'
              ? (lastInferencePreset as VisualBoxPreset)
              : null

        const presetEmbeddings = (resolvedPreset?.embeddings ?? [])
          .map((vec) => sanitizeEmbeddingVector(vec))
          .filter((vec): vec is number[] => Array.isArray(vec) && vec.length > 0)
        const presetLabels = (resolvedPreset?.labels ?? []).map((label, idx) => label.trim() || `prompt_${idx + 1}`)

        const hasPresetLibrary = presetEmbeddings.length > 0
        const usingExplicitPreset = Boolean(preset?.mode === 'visualBox' && hasPresetLibrary)
        const presetOnlyRun = !usingExplicitPreset && hasPresetLibrary && boxesForInference.length === 0
        const mergingPresetAndBoxes = !usingExplicitPreset && hasPresetLibrary && boxesForInference.length > 0

        if (usingExplicitPreset || presetOnlyRun) {
          if (!autoPresetReady) {
            throw new Error('No approved prompt library yet. Draw boxes and approve once before auto-run.')
          }
          if (!hasPresetLibrary) {
            throw new Error('No approved prompt library yet. Draw boxes and approve once before auto-run.')
          }
          response = await api<{ annotation_id: number; proposals: Proposal }>('/infer/visual', {
            method: 'POST',
            body: JSON.stringify({
              project_id: id,
              image_id: targetImage.id,
              prompt_type: 'bboxes',
                embeddings: presetEmbeddings,
                labels: presetLabels,
                target_image_id: visualUsage === 'cross' ? targetImageId : null,
              model_id: modelId,
              image_size: imageSize,
              conf: confThreshold,
              iou: overlapThreshold,
              capture_embeddings: false,
              detect_self_image: visualUsage !== 'cross',
            }),
          })
          applyPromptPresetFromProposals(response.proposals)
        } else {
          if (!boxesForInference.length) throw new Error('Draw at least one prompt box on the image.')
          if (visualUsage === 'cross' && (!targetImageId || targetImageId === targetImage.id)) {
            throw new Error('Select a different target image for cross-image prompts.')
          }

          const boxesPayload = boxPrompts.map(({ x1, y1, x2, y2 }) => {
            const _x1 = Math.round(Math.min(x1, x2));
            const _y1 = Math.round(Math.min(y1, y2));
            const _x2 = Math.round(Math.max(x1, x2));
            const _y2 = Math.round(Math.max(y1, y2));
            return [_x1, _y1, _x2, _y2];
          });

          const labelsForBoxes = boxesForInference.map((box, idx) => {
            const label = box.label?.trim() ?? ''
            return label && label.length ? label : `prompt_${idx + 1}`
          })

          const requestBody: Record<string, unknown> = {
            project_id: id,
            image_id: targetImage.id,
            prompt_type: 'bboxes',
            boxes: boxesPayload,
            labels: mergingPresetAndBoxes ? [...presetLabels, ...labelsForBoxes] : labelsForBoxes,
            target_image_id: visualUsage === 'cross' ? targetImageId : null,
            model_id: modelId,
            image_size: imageSize,
            conf: confThreshold,
            iou: overlapThreshold,
            capture_embeddings: true,
            detect_self_image: visualUsage !== 'cross',
          }
          if (mergingPresetAndBoxes) {
            requestBody.embeddings = presetEmbeddings
          }

          response = await api<{ annotation_id: number; proposals: Proposal }>('/infer/visual', {
            method: 'POST',
            body: JSON.stringify(requestBody),
          })
        const mergeBase =
          mergingPresetAndBoxes && lastInferencePreset?.mode === 'visualBox'
            ? (lastInferencePreset as VisualBoxPreset)
            : null
          const appliedPreset = applyPromptPresetFromProposals(response.proposals, { mergeWith: mergeBase })
          if (!appliedPreset && !mergeBase) {
            setLastInferencePreset(null)
            setAutoPresetReady(false)
          }
        }
      } else if (modeToUse === 'visualMask') {
        if (!maskUpload.base64) throw new Error('Upload a mask image for mask prompts.')
        if (visualUsage === 'cross' && (!targetImageId || targetImageId === targetImage.id)) {
          throw new Error('Select a different target image for cross-image prompts.')
        }
        response = await api<{ annotation_id: number; proposals: Proposal }>('/infer/visual', {
          method: 'POST',
          body: JSON.stringify({
            project_id: id,
            image_id: targetImage.id,
            prompt_type: 'masks',
            mask_base64: maskUpload.base64,
            target_image_id: visualUsage === 'cross' ? targetImageId : null,
            model_id: modelId,
            image_size: imageSize,
            conf: confThreshold,
            iou: overlapThreshold,
            detect_self_image: visualUsage !== 'cross',
          }),
        })
        setLastInferencePreset(null)
      } else {
        const vocab = PROMPT_FREE_VOCAB
        response = await api<{ annotation_id: number; proposals: Proposal }>('/infer/promptfree', {
          method: 'POST',
          body: JSON.stringify({
            project_id: id,
            image_id: targetImage.id,
            vocab,
            model_id: modelId,
            image_size: imageSize,
            conf: confThreshold,
            iou: overlapThreshold,
          }),
        })
        setLastInferencePreset({ mode: 'promptFree' })
      }

      setAnnotationId(response.annotation_id)
      annotationIdRef.current = response.annotation_id
      setProposals(response.proposals)
        const length = response.proposals?.instances?.length ?? 0
      setKeepSelection(Array.from({ length }, () => true))
      if (length === 0) {
        setStatus('No detections from the current prompt library. Draw new boxes and run inference again.')
      } else {
        setStatus('Inference complete. Review the predicted boxes and confirm the result.')
      }
    } catch (err) {
      setProposals(null)
      setAnnotationId(null)
      annotationIdRef.current = null
      setKeepSelection([])
      setError(err instanceof Error ? err.message : 'Inference failed')
    } finally {
      setIsRunning(false)
    }
  }

  // Auto-run next image once a prompt preset is ready
  useEffect(() => {
    if (isInstanceSegmentation) return
    if (!selectedImage) return
    if (mode !== 'visualBox') return
    if (!autoPresetReady) return
    if (!lastInferencePreset || lastInferencePreset.mode !== 'visualBox') return
    if (annotationIdRef.current) return
    if (pendingAutoRun) return
    if (autoRunAttemptedRef.current[selectedImage.id]) return
    const cached = approvedCache[selectedImage.id]
    if (cached && cached.instances.length) return
    if (selectedImage.annotation_id) return

    autoRunAttemptedRef.current[selectedImage.id] = true
    setPendingAutoRun(lastInferencePreset)
  }, [selectedImage, mode, autoPresetReady, lastInferencePreset, pendingAutoRun, approvedCache, isInstanceSegmentation])

  // Fire pending auto-run when ready
  useEffect(() => {
    if (isInstanceSegmentation) return
    if (!pendingAutoRun) return
    if (!selectedImage) return
    if (isRunning) return
    if (annotationIdRef.current) return

    if (pendingAutoRun.mode === 'text') {
      if (mode !== 'text') {
        setMode('text')
        return
      }
      setTextPrompts(pendingAutoRun.texts.join(','))
    } else if (pendingAutoRun.mode === 'promptFree') {
      if (mode !== 'promptFree') {
        setMode('promptFree')
        return
      }
    } else if (pendingAutoRun.mode === 'visualBox') {
      if (mode !== 'visualBox') {
        setMode('visualBox')
        return
      }
      setBoxPrompts([])
    }
    setStatus('Auto-labelling next image...')
    ;(async () => {
      try {
        await handleRunInference(pendingAutoRun)
      } finally {
        setPendingAutoRun(null)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAutoRun, selectedImage, isRunning, mode, isInstanceSegmentation])

  const handleApprove = async () => {
    if (!annotationId || !selectedImage) return
    setIsReviewing(true)
    setError(null)
    try {
        const keepIndices = keepSelection
          .map((keep, idx) => (keep ? idx : null))
        .filter((idx): idx is number => idx !== null)

      await api('/review', {
        method: 'POST',
        body: JSON.stringify({
          annotation_id: annotationId,
          approve: true,
          keep_indices: keepIndices,
          instances: instances.map((inst) => ({
            bbox: inst.bbox,
            confidence: inst.confidence,
            class_name: inst.class_name,
          })),
        }),
      })

      // Build prompt library & preset ONLY after Approve
      let nextPreset: LastInferencePreset | null = lastInferencePreset

      setLastInferencePreset(nextPreset)
      setStatus('Annotation approved. The selection has been saved.')
      setProposals(null)
      setAnnotationId(null)
      annotationIdRef.current = null
      setKeepSelection([])

    const updated = await loadImages()

    // Move to next unlabeled image and auto-run using the approved preset
    if (nextPreset) {
      const currentIndex = updated.findIndex((img) => img.id === selectedImage.id)
      const ordered =
        currentIndex >= 0
          ? [...updated.slice(currentIndex + 1), ...updated.slice(0, currentIndex)]
          : updated
      const nextImage = ordered.find((img) => !img.annotation_id)
      if (nextImage) {
        autoRunAttemptedRef.current[nextImage.id] = true
        setSelectedImageId(nextImage.id)
        setPendingAutoRun(nextPreset)
        }
      }
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to approve annotation')
    } finally {
      setIsReviewing(false)
    }
  }

  const handleReject = async () => {
    if (!annotationId) return
    setIsReviewing(true)
    setError(null)
    try {
      await api('/review', {
        method: 'POST',
        body: JSON.stringify({
          annotation_id: annotationId,
          approve: false,
        }),
      })
      setStatus('Annotation rejected.')
      setProposals(null)
      setAnnotationId(null)
      annotationIdRef.current = null
      setKeepSelection([])
      loadImages()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject annotation')
    } finally {
      setIsReviewing(false)
    }
  }

  const parseRatioInput = (value: string): number => {
    const numeric = Number(value)
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return 0
    }
    return numeric > 1 ? numeric / 100 : numeric
  }

  const buildSplitRatios = (): { train: number; val: number; test: number } => {
    const ratios = {
      train: parseRatioInput(splitTrain),
      val: parseRatioInput(splitVal),
      test: parseRatioInput(splitTest),
    }
    const total = ratios.train + ratios.val + ratios.test
    if (total <= 0) {
      throw new Error('Provide a non-zero split for at least one dataset partition.')
    }
    return ratios
  }

  const performExport = async (
    format: 'coco' | 'yolo',
    ratios: { train: number; val: number; test: number },
  ): Promise<void> => {
    setExportingFormat(format)
    setError(null)
    setStatus(null)
    try {
      const total = ratios.train + ratios.val + ratios.test
      const normalized = {
        train: ratios.train / total,
        val: ratios.val / total,
        test: ratios.test / total,
      }
      const result = await api<{ format: 'coco' | 'yolo'; url: string }>('/export/dataset', {
        method: 'POST',
        body: JSON.stringify({
          project_id: id,
          format,
          split: normalized,
        }),
      })
      setExportResult({
        format,
        url: result.url,
        ratios: normalized,
        generatedAt: Date.now(),
      })
      setStatus(`${format === 'coco' ? 'COCO' : 'YOLO'} dataset ready. Opening a new tab for download.`)
      window.open(result.url, '_blank', 'noopener')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to export dataset'
      setError(message)
    } finally {
      setExportingFormat(null)
    }
  }

  const handleExportClick = (format: 'coco' | 'yolo') => {
    try {
      const ratios = buildSplitRatios()
      void performExport(format, ratios)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid split ratios'
      setError(message)
    }
  }

  const handleRefreshExport = () => {
    if (!exportResult) return
    void performExport(exportResult.format, exportResult.ratios)
  }

  const handleResetExport = () => {
    setSplitTrain('80')
    setSplitVal('10')
    setSplitTest('10')
    setExportResult(null)
    setStatus(null)
  }

  const handleUploaded = () => {
    setStatus('Upload complete. Images are ready for labeling.')
    setError(null)
    loadImages()
  }

  const handleUploadError = (message: string) => {
    setError(message)
    setStatus(null)
  }

  const handleDeleteImage = async (image: PickerImage) => {
    if (!window.confirm('Delete this image')) return
    setError(null)
    setStatus(null)
    try {
      const response = await fetch(`${API}/images/${image.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || 'Failed to delete image')
      }
      setProposals(null)
      setAnnotationId(null)
      annotationIdRef.current = null
      setKeepSelection([])
      setSelectedImageId((prev) => (prev === image.id ? null : prev))
      setStatus('Image deleted.')
      await loadImages()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete image')
    }
  }

  const handleDeleteProject = async () => {
    if (!window.confirm('Delete this project and all associated images')) return
    setError(null)
    setStatus(null)
    try {
      const response = await fetch(addAuthToUrl(`${API}/projects/${id}`), {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || 'Failed to delete project')
      }
      setStatus('Project deleted.')
      onBack()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project')
    }
  }

  const rootGradientClass = isInstanceSegmentation
    ? 'bg-gradient-to-br from-[#090114] via-[#1c0a34] to-[#04010c]'
    : 'bg-gradient-to-br from-slate-950 via-slate-900 to-neutral-950'

  const headerSurfaceClass = classNames(
    'flex flex-wrap items-center justify-between gap-4 rounded-3xl px-6 py-5 text-white shadow-[0_40px_120px_-50px_rgba(15,23,42,0.75)] backdrop-blur',
    isInstanceSegmentation
      ? 'border border-fuchsia-400/30 bg-gradient-to-r from-[#241142]/70 via-[#1a103a]/70 to-[#0b021b]/70'
      : 'border border-white/10 bg-white/5'
  )

  const datasetCardClass = classNames(
    'space-y-4 rounded-3xl p-6 shadow-[0_40px_80px_-45px_rgba(15,23,42,0.6)]',
    isInstanceSegmentation
      ? 'border border-fuchsia-400/25 bg-[#0f051d]/95 text-fuchsia-50'
      : 'border border-white/15 bg-white/95'
  )

  return (
    <div className={classNames('min-h-screen pb-16 pt-10', rootGradientClass)}>
      <div className="mx-auto max-w-7xl space-y-8 px-6">
        <header className={headerSurfaceClass}>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onBack}
              className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:border-white hover:bg-white/10"
            >
              Back to projects
            </button>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-300">
                {projectLoading ? 'Loading project...' : projectTypeInfo?.label || 'Project'}
              </p>
              <h1 className="text-3xl font-semibold text-white sm:text-4xl">{project?.name ?? `Project ${id}`}</h1>
              <p className="text-sm text-slate-300">
                {(project?.publish_level ?? 'private').toUpperCase()} · {images.length} image(s) in workspace
              </p>
              {project?.description ? (
                <p className="text-xs text-slate-300/90">{project.description}</p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!isInstanceSegmentation && (
              <button
                type="button"
                onClick={() => setIsExportModalOpen(true)}
                className="rounded-full border border-emerald-300/60 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-50 transition hover:border-emerald-200 hover:bg-emerald-500/20"
              >
                Export dataset
              </button>
            )}
            <button
              type="button"
              onClick={handleDeleteProject}
              className="rounded-full border border-rose-400/60 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-rose-200 transition hover:border-rose-300 hover:bg-rose-500/10"
            >
              Delete project
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:border-white hover:bg-white/10"
            >
              Sign out
            </button>
          </div>
        </header>

        {status && (
          <div className="rounded-3xl border border-emerald-400/40 bg-emerald-500/15 px-5 py-4 text-sm text-emerald-200 shadow">
            {status}
          </div>
        )}
        {error && (
          <div className="rounded-3xl border border-rose-400/40 bg-rose-500/15 px-5 py-4 text-sm text-rose-200 shadow">
            {error}
          </div>
        )}

        {isInstanceSegmentation && (
          <SegmentationInsightBoard
            proposals={proposals}
            selectedImage={selectedImage}
            isRunning={isRunning}
          />
        )}

        <div className="grid gap-8 lg:grid-cols-[360px,1fr]">
          <aside className="space-y-6">
            <UploadSection projectId={id} onUploaded={handleUploaded} onError={handleUploadError} />

            <div className="space-y-3 rounded-3xl border border-white/15 bg-white/95 p-4 shadow-[0_30px_60px_-40px_rgba(15,23,42,0.55)]">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Project images</h2>
                <button
                  type="button"
                  onClick={loadImages}
                  className="text-xs font-medium text-neutral-500 hover:text-neutral-700"
                >
                  Refresh
                </button>
              </div>
              <ImagePicker
                items={images}
                activeId={selectedImageId}
                onSelect={setSelectedImageId}
                onDelete={handleDeleteImage}
                loading={loadingImages}
              />
            </div>
          </aside>

          <main className="space-y-6">
            {selectedImage ? (
              <>
                <ImagePreview
                  image={selectedImage}
                  mode={mode}
                  manualBoxes={boxPrompts}
                  setManualBoxes={setBoxPrompts}
                  detectionBoxes={detectionBoxes}
                  onEditDetection={annotationId ? handleUpdateInstanceBBox : undefined}
                  onCreateBox={(newId) => setPendingLabelBoxId(newId)}
                  smartSelectMode={smartSelectMode}
                  pixelBrushMode={pixelBrushMode}
                  pixelBrushSize={pixelBrushSize}
                  pixelMaskData={pixelMaskData}
                  onPixelMaskChange={handlePixelMaskChange}
                  isDrawingMode={isImageDrawingMode}
                  onDrawingComplete={(boxes) => {
                    handleAddManualBoxes(boxes)
                    setIsImageDrawingMode(false)
                  }}
                  labelSuggestions={labelSuggestions}
                />

                <div className="space-y-4 rounded-3xl border bg-white p-5 shadow-sm">
                  {isInstanceSegmentation && (
                    <SmartSelectPanel
                      currentMode={mode}
                      smartSelectMode={smartSelectMode}
                      onSmartModeChange={setSmartSelectMode}
                      onClear={handleSmartSelectReset}
                      disabled={isRunning}
                      brushMode={pixelBrushMode}
                      onBrushModeChange={setPixelBrushMode}
                      brushSize={pixelBrushSize}
                      onBrushSizeChange={setPixelBrushSize}
                      canUndo={pixelMaskUndoStack.length > 0}
                      canRedo={pixelMaskRedoStack.length > 0}
                      onUndo={handlePixelMaskUndo}
                      onRedo={handlePixelMaskRedo}
                    />
                  )}
                  {!isInstanceSegmentation && approvedClassSummary.length > 0 && (
                    <ApprovedClassSummary stats={approvedClassSummary} />
                  )}
                  <div className="flex flex-wrap gap-2">
                    {availableModes.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setMode(option)}
                        className={classNames(
                          'rounded-xl px-4 py-2 text-sm font-medium transition',
                          mode === option
                            ? 'bg-neutral-900 text-white shadow'
                            : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                        )}
                      >
                        {modeLabels[option]}
                      </button>
                    ))}
                  </div>

                  {mode === 'text' && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-neutral-700">
                        {isInstanceSegmentation ? 'Smart Select prompt' : 'Text prompts'}
                        <textarea
                          value={textPrompts}
                          onChange={(event) => setTextPrompts(event.target.value)}
                          className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none"
                          rows={2}
                          placeholder={
                            isInstanceSegmentation ? 'e.g. "chrome concept car on stage"' : 'person, car, bus'
                          }
                        />
                      </label>
                      <p className="text-xs text-neutral-500">
                        {isInstanceSegmentation
                          ? 'Describe the object or part you want to extract. Smart Select turns plain text into masks.'
                          : 'Comma-separated list of categories for the model to search within the image.'}
                      </p>
                    </div>
                  )}

                  {mode === 'visualBox' && (
                    <div className="space-y-3">
                      <p className="text-sm text-neutral-500">
                        {isInstanceSegmentation
                          ? 'Use loose boxes as coarse hints. Smart Select will snap masks tightly around each object.'
                          : 'Draw one or more boxes on the image above to guide the detection. Each box becomes a prompt region for the model.'}
                      </p>
                      {!isInstanceSegmentation && (
                        <>
                          <div className="flex flex-wrap gap-2">
                            {(['intra', 'cross'] as const).map((option) => (
                              <button
                                key={option}
                                type="button"
                                onClick={() => setVisualUsage(option)}
                                className={classNames(
                                  'rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition',
                                  visualUsage === option
                                    ? 'border-neutral-900 bg-neutral-900 text-white shadow'
                                    : 'border-neutral-300 bg-neutral-100 text-neutral-600 hover:border-neutral-400'
                                )}
                              >
                                {option === 'intra' ? 'Intra-Image' : 'Cross-Image'}
                              </button>
                            ))}
                          </div>
                          {visualUsage === 'cross' && (
                            selectableTargets.length ? (
                              <label className="text-sm font-medium text-neutral-700">
                                Target image
                                <select
                                  value={targetImageId ?? selectableTargets[0]?.id ?? ''}
                                  onChange={(event) => setTargetImageId(Number(event.target.value))}
                                  className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none"
                                >
                                  {selectableTargets.map((candidate) => (
                                    <option key={candidate.id} value={candidate.id}>
                                      {candidate.filename || `Image ${candidate.id}`}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            ) : (
                              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                                Add another image to enable cross-image prompts.
                              </div>
                            )
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {mode === 'visualMask' && (
                    <div className="space-y-3">
                      <p className="text-sm text-neutral-500">
                        Upload a binary mask (white foreground on transparent/black background) that matches the
                        original image size.
                      </p>
                      {!isInstanceSegmentation && (
                        <>
                          <div className="flex flex-wrap gap-2">
                            {(['intra', 'cross'] as const).map((option) => (
                              <button
                                key={option}
                                type="button"
                                onClick={() => setVisualUsage(option)}
                                className={classNames(
                                  'rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition',
                                  visualUsage === option
                                    ? 'border-neutral-900 bg-neutral-900 text-white shadow'
                                    : 'border-neutral-300 bg-neutral-100 text-neutral-600 hover:border-neutral-400'
                                )}
                              >
                                {option === 'intra' ? 'Intra-Image' : 'Cross-Image'}
                              </button>
                            ))}
                          </div>
                          {visualUsage === 'cross' && (
                            selectableTargets.length ? (
                              <label className="text-sm font-medium text-neutral-700">
                                Target image
                                <select
                                  value={targetImageId ?? selectableTargets[0]?.id ?? ''}
                                  onChange={(event) => setTargetImageId(Number(event.target.value))}
                                  className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none"
                                >
                                  {selectableTargets.map((candidate) => (
                                    <option key={candidate.id} value={candidate.id}>
                                      {candidate.filename || `Image ${candidate.id}`}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            ) : (
                              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                                Add another image to enable cross-image prompts.
                              </div>
                            )
                          )}
                        </>
                      )}
                      <label className="text-sm font-medium text-neutral-700">
                        Mask image
                        <input
                          type="file"
                          accept="image/png,image/webp,image/jpeg"
                          onChange={handleMaskFileChange}
                          className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm shadow-sm file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-900 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-neutral-800 focus:border-neutral-500 focus:outline-none"
                        />
                      </label>
                      {maskUpload.name && (
                        <div className="rounded-xl border border-neutral-400 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                          Using mask: <strong>{maskUpload.name}</strong>
                        </div>
                      )}
                    </div>
                  )}

                  {mode === 'promptFree' && (
                    <div className="rounded-xl border border-neutral-300 bg-white p-4 text-sm text-neutral-600">
                      Prompt-free inference uses the predefined vocabulary.
                    </div>
                  )}

                  <div className="grid gap-3 md:grid-cols-4">
                    <label className="text-sm font-medium text-neutral-700">
                      {isInstanceSegmentation ? 'SAM 2 model' : 'Model ID'}
                      <select
                        value={modelId}
                        onChange={(event) => setModelId(event.target.value)}
                        className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none"
                      >
                        {modelOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm font-medium text-neutral-700">
                      Image size
                      <input
                        type="number"
                        value={imageSize}
                        min={256}
                        max={2048}
                        onChange={(event) =>
                          setImageSize(Number.isNaN(Number(event.target.value)) ? 640 : Number(event.target.value))
                        }
                        disabled={isInstanceSegmentation}
                        className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none disabled:bg-neutral-100 disabled:text-neutral-500"
                      />
                    </label>
                    <label className="text-sm font-medium text-neutral-700">
                      {isInstanceSegmentation ? 'Mask threshold' : 'Confidence'}
                      <input
                        type="number"
                        step="0.05"
                        value={confThreshold}
                        min={0}
                        max={1}
                        onChange={(event) => {
                          const value = parseFloat(event.target.value)
                          setConfThreshold(Number.isFinite(value) ? clamp(value, 0, 1) : 0.25)
                        }}
                        className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none"
                      />
                    </label>
                    {!isInstanceSegmentation && (
                      <label className="text-sm font-medium text-neutral-700">
                        Overlap filter
                        <input
                          type="number"
                          step="0.05"
                          value={overlapThreshold}
                          min={0}
                          max={1}
                          onChange={(event) => {
                            const value = parseFloat(event.target.value)
                            setOverlapThreshold(Number.isFinite(value) ? clamp(value, 0, 1) : 0.7)
                          }}
                          className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none"
                        />
                        <span className="mt-1 block text-xs font-normal text-neutral-500">
                          Lower values remove overlapping boxes more aggressively.
                        </span>
                      </label>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-neutral-500">
                      Target image: {selectedImage.filename || `Image ${selectedImage.id}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRunInference()}
                      disabled={isRunning}
                      className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isRunning ? 'Running...' : 'Run inference'}
                    </button>
                  </div>
                </div>

                {mode === 'visualBox' && smartSelectMode === 'polygon' && (
                  <BoxPromptList
                    boxes={boxPrompts}
                    setBoxes={setBoxPrompts}
                    image={selectedImage}
                    suggestions={labelSuggestions}
                    focusBoxId={pendingLabelBoxId}
                    onFocusHandled={() => setPendingLabelBoxId(null)}
                    onLabelChange={(value) =>
                      setCustomLabelHistory((prev) =>
                        Array.from(new Set([...prev, stripVariant(value)])).slice(-128),
                      )
                    }
                  />
                )}

                <LabelReview
                  instances={instances}
                  keepSelection={keepSelection}
                  onToggle={handleToggleInstance}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  disabled={isReviewing || isRunning || !annotationId}
                  editableNames={mode === 'visualBox'}
                  onNameChange={handleRenameInstance}
                  image={selectedImage}
                  suggestions={labelSuggestions}
                  onAddManualBoxes={handleAddManualBoxes}
                  onEnableImageDrawing={() => setIsImageDrawingMode(true)}
                />

                {isInstanceSegmentation && (
                  <section className={datasetCardClass}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold">Mask/Polygon export</h2>
                        <p className="text-sm text-neutral-500">
                          Split your annotated masks into COCO or YOLO packages ready for training.
                        </p>
                      </div>
                      {exportingFormat ? (
                        <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-neutral-600">
                          Exporting {exportingFormat.toUpperCase()}...
                        </span>
                      ) : null}
                    </div>

                    <DatasetExportControls
                      splitTrain={splitTrain}
                      splitVal={splitVal}
                      splitTest={splitTest}
                      onChangeTrain={setSplitTrain}
                      onChangeVal={setSplitVal}
                      onChangeTest={setSplitTest}
                      onExport={handleExportClick}
                      onReset={handleResetExport}
                      exportingFormat={exportingFormat}
                      tone="dark"
                    />
                  </section>
                )}
              </>
            ) : (
              <div className="rounded-3xl border border-dashed bg-white px-6 py-16 text-center text-sm text-neutral-500 shadow-sm">
                Upload or select an image from the gallery to begin labeling.
              </div>
            )}
          </main>
        </div>
      </div>
      {!isInstanceSegmentation && (
        <DatasetExportModal
          open={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          splitTrain={splitTrain}
          splitVal={splitVal}
          splitTest={splitTest}
          onChangeTrain={setSplitTrain}
          onChangeVal={setSplitVal}
          onChangeTest={setSplitTest}
          onExport={handleExportClick}
          onReset={handleResetExport}
          exportingFormat={exportingFormat}
          exportResult={exportResult}
        />
      )}
    </div>
  )
}

function SegmentationInsightBoard({
  proposals,
  selectedImage,
  isRunning,
}: {
  proposals: Proposal | null
  selectedImage: ProjectImage | null
  isRunning: boolean
}) {
  const diagnostics = proposals?.diagnostics ?? {}
  const maskCount = proposals?.instances?.length ?? 0
  const autoAssignment = diagnostics.auto_assignment ?? {}
  const autoApproved =
    autoAssignment.auto ??
    Math.min(maskCount, Math.max(0, diagnostics.auto_split_index ?? Math.ceil(maskCount * 0.8)))
  const needsReview = autoAssignment.review ?? Math.max(0, maskCount - autoApproved)
  const flaggedInstances = proposals?.flagged_instances ?? []
  const flaggedImages = Array.from(new Set(proposals?.flagged_images ?? []))
  const lowQuality = diagnostics.low_quality ?? false
  const dataStreamLabel = isRunning
    ? 'Running inference...'
    : selectedImage
      ? selectedImage.filename || `Image #${selectedImage.id}`
      : 'Select an image to get started'

  return (
    <section className="rounded-3xl border border-fuchsia-500/30 bg-gradient-to-r from-[#1f0b3d]/80 via-[#1a0933]/85 to-[#0b021c]/90 p-6 text-fuchsia-50 shadow-[0_45px_80px_-40px_rgba(110,30,190,0.6)]">
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.55em] text-fuchsia-200/70">
            Instance Studio
          </p>
          <h2 className="text-2xl font-semibold text-white">Segmentation health monitor</h2>
          <p className="text-sm text-fuchsia-100/80">{dataStreamLabel}</p>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-fuchsia-400/50 bg-fuchsia-500/10 px-4 py-3 text-right text-xs uppercase tracking-wide text-fuchsia-100/90">
          <span className="inline-flex h-2 w-2 rounded-full bg-fuchsia-300 shadow-[0_0_10px_rgba(232,121,249,0.9)]"></span>
          <div className="flex flex-col text-left">
            <span className="text-[11px] text-fuchsia-200/80">Low quality</span>
            <span className="text-base font-semibold text-white">{lowQuality ? 'Flagged' : 'Clear'}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <InsightBadge label="Total masks" value={maskCount} tone="primary" />
        <InsightBadge label="Auto-approved" value={autoApproved} tone="calm" />
        <InsightBadge label="Needs review" value={needsReview} tone="alert" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-fuchsia-400/30 bg-white/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-fuchsia-100/80">Flagged reasons</p>
          {flaggedImages.length === 0 ? (
            <p className="mt-3 text-sm text-fuchsia-50/80">No image-level warnings.</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {flaggedImages.map((reason) => (
                <span
                  key={reason}
                  className="rounded-full bg-fuchsia-500/20 px-3 py-1 text-xs font-semibold text-fuchsia-100 shadow-inner shadow-fuchsia-900/40"
                >
                  {reason.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-fuchsia-400/30 bg-white/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-fuchsia-100/80">Flagged masks</p>
          {flaggedInstances.length === 0 ? (
            <p className="mt-3 text-sm text-fuchsia-50/80">No masks require manual review.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {flaggedInstances.slice(0, 4).map((flag) => (
                <li
                  key={`${flag.index}-${flag.name ?? flag.index}`}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-fuchsia-50"
                >
                  <div className="font-semibold">{flag.name ?? `Mask #${flag.index + 1}`}</div>
                  <p className="text-xs text-fuchsia-100/80">
                    {flag.reason.map((item) => item.replace(/_/g, ' ')).join(', ')}
                  </p>
                </li>
              ))}
              {flaggedInstances.length > 4 ? (
                <li className="text-xs text-fuchsia-100/70">+{flaggedInstances.length - 4} more masks...</li>
              ) : null}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}

function InsightBadge({ label, value, tone }: { label: string; value: number; tone: 'primary' | 'calm' | 'alert' }) {
  const toneClass =
    tone === 'primary'
      ? 'border-fuchsia-400/60 bg-fuchsia-500/10 text-fuchsia-50'
      : tone === 'calm'
        ? 'border-emerald-400/60 bg-emerald-500/10 text-emerald-50'
        : 'border-amber-400/60 bg-amber-500/10 text-amber-50'
  return (
    <div className={classNames('rounded-2xl border px-4 py-3 shadow-inner', toneClass)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.4em] opacity-75">{label}</p>
      <p className="mt-1 text-3xl font-semibold">{value}</p>
    </div>
  )
}

type DatasetExportControlsProps = {
  splitTrain: string
  splitVal: string
  splitTest: string
  onChangeTrain: (value: string) => void
  onChangeVal: (value: string) => void
  onChangeTest: (value: string) => void
  onExport: (format: 'coco' | 'yolo') => void
  onReset: () => void
  exportingFormat: 'coco' | 'yolo' | null
  tone: 'light' | 'dark'
}

function DatasetExportControls({
  splitTrain,
  splitVal,
  splitTest,
  onChangeTrain,
  onChangeVal,
  onChangeTest,
  onExport,
  onReset,
  exportingFormat,
  tone = 'light',
}: DatasetExportControlsProps) {
  const labelClass =
    tone === 'dark' ? 'text-sm font-medium text-fuchsia-100' : 'text-sm font-medium text-neutral-700'
  const inputClass =
    tone === 'dark'
      ? 'mt-1 w-full rounded-2xl border border-fuchsia-500/40 bg-[#1e0d3a] px-4 py-3 text-sm text-fuchsia-50 shadow-sm focus:border-fuchsia-300 focus:outline-none focus:ring-2 focus:ring-fuchsia-700/30'
      : 'mt-1 w-full rounded-2xl border border-neutral-400 px-4 py-3 text-sm shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100'
  const helperClass = tone === 'dark' ? 'text-xs text-fuchsia-200/80' : 'text-xs text-neutral-500'

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={labelClass}>
          Train split
          <input
            type="number"
            min="0"
            step="0.1"
            inputMode="decimal"
            value={splitTrain}
            onChange={(event) => onChangeTrain(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Validation split
          <input
            type="number"
            min="0"
            step="0.1"
            inputMode="decimal"
            value={splitVal}
            onChange={(event) => onChangeVal(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Test split
          <input
            type="number"
            min="0"
            step="0.1"
            inputMode="decimal"
            value={splitTest}
            onChange={(event) => onChangeTest(event.target.value)}
            className={inputClass}
          />
        </label>
      </div>

      <p className={helperClass}>
        Enter percentages (e.g. 80) or decimal fractions (e.g. 0.8). Ratios are normalised before export.
      </p>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => onExport('coco')}
          disabled={!!exportingFormat}
          className="rounded-2xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Export COCO
        </button>
        <button
          type="button"
          onClick={() => onExport('yolo')}
          disabled={!!exportingFormat}
          className="rounded-2xl border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:border-neutral-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Export YOLO
        </button>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center rounded-2xl border border-transparent px-4 py-2 text-xs font-semibold text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-800"
        >
          Reset
        </button>
      </div>
    </>
  )
}

function ApprovedClassSummary({ stats }: { stats: { name: string; count: number }[] }) {
  const limited = stats.slice(0, 8)
  const totalObjects = stats.reduce((sum, item) => sum + item.count, 0)
  return (
    <div className="rounded-3xl border border-neutral-200 bg-white/95 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.35em] text-neutral-500">
        <span>Approved classes</span>
        <span className="text-neutral-800">
          {totalObjects} object{totalObjects === 1 ? '' : 's'}
        </span>
      </div>
      {limited.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {limited.map((item) => (
            <div
              key={item.name}
              className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-2"
            >
              <div>
                <p className="text-sm font-semibold text-neutral-800">{item.name}</p>
                <p className="text-[11px] uppercase tracking-wide text-neutral-500">Instances</p>
              </div>
              <span className="text-xl font-bold text-neutral-900">{item.count}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-neutral-500">Approve at least one detection to see class counts.</p>
      )}
      {stats.length > limited.length && (
        <p className="mt-2 text-[11px] font-medium text-neutral-500">
          Showing {limited.length} of {stats.length} classes
        </p>
      )}
    </div>
  )
}

type DatasetExportModalProps = {
  open: boolean
  onClose: () => void
  splitTrain: string
  splitVal: string
  splitTest: string
  onChangeTrain: (value: string) => void
  onChangeVal: (value: string) => void
  onChangeTest: (value: string) => void
  onExport: (format: 'coco' | 'yolo') => void
  onReset: () => void
  exportingFormat: 'coco' | 'yolo' | null
  exportResult: {
    format: 'coco' | 'yolo'
    url: string
    ratios: { train: number; val: number; test: number }
    generatedAt: number
  } | null
}

function DatasetExportModal({
  open,
  onClose,
  splitTrain,
  splitVal,
  splitTest,
  onChangeTrain,
  onChangeVal,
  onChangeTest,
  onExport,
  onReset,
  exportingFormat,
  exportResult,
}: DatasetExportModalProps) {
  if (!open) return null
  const lastExportedAt = exportResult ? new Date(exportResult.generatedAt).toLocaleString() : null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-neutral-500">Dataset export</p>
            <h2 className="text-2xl font-semibold text-neutral-900">Download ready-to-train packages</h2>
            <p className="text-sm text-neutral-500">
              Configure split ratios and export COCO or YOLO archives for this project.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-neutral-200 px-3 py-1 text-sm font-semibold text-neutral-600 hover:border-neutral-400"
          >
            Close
          </button>
        </div>

        <DatasetExportControls
          splitTrain={splitTrain}
          splitVal={splitVal}
          splitTest={splitTest}
          onChangeTrain={onChangeTrain}
          onChangeVal={onChangeVal}
          onChangeTest={onChangeTest}
          onExport={onExport}
          onReset={onReset}
          exportingFormat={exportingFormat}
        />

        {exportResult && (
          <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-600">
            <p>
              Last export:{' '}
              <strong>
                {exportResult.format.toUpperCase()} - {lastExportedAt}
              </strong>
            </p>
            <p className="mt-1">
              Split ratios - Train: {(exportResult.ratios.train * 100).toFixed(1)}% - Val:{' '}
              {(exportResult.ratios.val * 100).toFixed(1)}% - Test:{' '}
              {(exportResult.ratios.test * 100).toFixed(1)}%
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function SmartSelectPanel({
  currentMode,
  smartSelectMode,
  onSmartModeChange,
  onClear,
  disabled,
  brushMode,
  onBrushModeChange,
  brushSize,
  onBrushSizeChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  currentMode: Mode
  smartSelectMode: 'polygon' | 'pixels'
  onSmartModeChange: (mode: 'polygon' | 'pixels') => void
  onClear: () => void
  disabled: boolean
  brushMode: 'add' | 'erase'
  onBrushModeChange: (mode: 'add' | 'erase') => void
  brushSize: number
  onBrushSizeChange: (size: number) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}) {
  const supportsSmartToggle = currentMode === 'visualBox'
  const instruction =
    currentMode === 'text'
      ? 'Describe the object you want to extract. Smart Select will propose masks using text.'
      : currentMode === 'visualMask'
        ? 'Upload or draw a mask image to refine the selection. Bright pixels are treated as foreground.'
        : supportsSmartToggle && smartSelectMode === 'pixels'
          ? 'Paint rough strokes on the object. The brush snaps to pixels, so you can sculpt the mask.'
          : 'Draw loose boxes to hint where each object is. Smart Select will snap the mask around the object.'
  const showPolygonHint = supportsSmartToggle && smartSelectMode === 'polygon'
  const showBrushControls = supportsSmartToggle && smartSelectMode === 'pixels'
  return (
    <div className="rounded-3xl border border-fuchsia-400/30 bg-[#061226] p-4 text-fuchsia-50 shadow-inner shadow-black/40">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.5em] text-fuchsia-200/80">
          <span className="inline-flex h-2 w-2 rounded-full bg-fuchsia-300 shadow-[0_0_10px_rgba(236,72,153,0.8)]" />
          Smart Select
        </div>
        {supportsSmartToggle ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onSmartModeChange('polygon')}
              className={classNames(
                'rounded-xl px-3 py-1 text-xs font-semibold',
                smartSelectMode === 'polygon' ? 'bg-fuchsia-500 text-white' : 'bg-white/10 text-fuchsia-100/80'
              )}
            >
              Polygon
            </button>
            <button
              type="button"
              onClick={() => onSmartModeChange('pixels')}
              className={classNames(
                'rounded-xl px-3 py-1 text-xs font-semibold',
                smartSelectMode === 'pixels' ? 'bg-fuchsia-500 text-white' : 'bg-white/10 text-fuchsia-100/80'
              )}
            >
              Pixels
            </button>
          </div>
        ) : (
          <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-fuchsia-200/60">
            Switch to Smart Select - Box mode to unlock the pixel brush workflow.
          </span>
        )}
      </div>

      <p className="text-xs text-fuchsia-100/85">{instruction}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          className="rounded-full bg-fuchsia-500/20 px-3 py-1 text-xs font-semibold text-white transition hover:bg-fuchsia-500/30 disabled:opacity-40"
        >
          Reset prompts
        </button>
        {showPolygonHint ? (
          <span className="text-[11px] text-fuchsia-200/70">Use Shift+Drag to add precise control points.</span>
        ) : smartSelectMode === 'pixels' && supportsSmartToggle ? (
          <span className="text-[11px] text-fuchsia-200/70">
            Brush adds (green) or erases (transparent) pixels before SAM refines the contour.
          </span>
        ) : null}
      </div>

      {smartSelectMode === 'pixels' && showBrushControls && (
        <div className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="flex items-center justify-between text-xs font-semibold text-fuchsia-100/80">
            Brush mode
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onBrushModeChange('add')}
                className={classNames(
                  'rounded-full px-3 py-1 transition',
                  brushMode === 'add' ? 'bg-emerald-500 text-white' : 'bg-white/10 text-fuchsia-100/80'
                )}
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => onBrushModeChange('erase')}
                className={classNames(
                  'rounded-full px-3 py-1 transition',
                  brushMode === 'erase' ? 'bg-rose-500 text-white' : 'bg-white/10 text-fuchsia-100/80'
                )}
              >
                Erase
              </button>
            </div>
          </div>
          <label className="flex flex-col gap-1 text-xs text-fuchsia-100/80">
            Brush size: {brushSize}px
            <input
              type="range"
              min={4}
              max={64}
              step={2}
              value={brushSize}
              onChange={(event) => onBrushSizeChange(Number(event.target.value))}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className="flex-1 rounded-xl border border-white/20 px-3 py-1 text-xs font-semibold text-white transition hover:border-white disabled:opacity-30"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              className="flex-1 rounded-xl border border-white/20 px-3 py-1 text-xs font-semibold text-white transition hover:border-white disabled:opacity-30"
            >
              Redo
            </button>
          </div>
        </div>
      )}
      {smartSelectMode === 'pixels' && !showBrushControls && (
        <p className="mt-3 rounded-2xl border border-white/10 bg-black/10 px-3 py-2 text-[11px] text-fuchsia-200/70">
          Switch to Smart Select - Box mode to unlock the pixel brush workflow.
        </p>
      )}
    </div>
  )
}

function ImagePreview({
  image,
  mode,
  manualBoxes,
  setManualBoxes,
  detectionBoxes,
  onEditDetection,
  onCreateBox,
  smartSelectMode,
  pixelBrushMode,
  pixelBrushSize,
  pixelMaskData,
  onPixelMaskChange,
  isDrawingMode,
  onDrawingComplete,
  labelSuggestions,
}: {
  image: ProjectImage
  mode: Mode
  manualBoxes: Box[]
  setManualBoxes: Dispatch<SetStateAction<Box[]>>
  detectionBoxes: OverlayBox[]
  onEditDetection: (index: number, bbox: [number, number, number, number]) => void
  onCreateBox: (id: string) => void
  smartSelectMode: 'polygon' | 'pixels'
  pixelBrushMode: 'add' | 'erase'
  pixelBrushSize: number
  pixelMaskData: string | null
  onPixelMaskChange: (dataUrl: string | null, opts: { pushHistory: boolean }) => void
  isDrawingMode?: boolean
  onDrawingComplete?: (boxes: Array<{ x1: number; y1: number; x2: number; y2: number; class_name: string }>) => void
  labelSuggestions?: string[]
}) {
  type DraftBox = {
    startX: number
    startY: number
    currentX: number
   currentY: number
    rectWidth: number
    rectHeight: number
  }

  type DetectionAction = 'move' | 'resize-nw' | 'resize-ne' | 'resize-sw' | 'resize-se'

  type ActiveDetection = {
    index: number
    action: DetectionAction
    pointerId: number
    start: { x: number; y: number }
    original: { x1: number; y1: number; x2: number; y2: number }
  }

  const containerRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<DraftBox | null>(null)
  const [activeDetection, setActiveDetection] = useState<ActiveDetection | null>(null)
  const [drawingBoxes, setDrawingBoxes] = useState<Array<{ x1: number; y1: number; x2: number; y2: number; label: string }>>([])
  const [pendingDrawBox, setPendingDrawBox] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [labelSelectorActive, setLabelSelectorActive] = useState(false)
  const [currentLabel, setCurrentLabel] = useState('')
  const maskPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const maskDataCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const isPaintingRef = useRef(false)
  const lastPaintPointRef = useRef<{ x: number; y: number } | null>(null)
  const allowDrawing = mode === 'visualBox' && smartSelectMode === 'polygon'
  const enableBrush = mode === 'visualBox' && smartSelectMode === 'pixels'
  const canEditDetections = Boolean(onEditDetection)

  const toImageCoords = useCallback(
    (clientX: number, clientY: number) => {
      if (!containerRef.current) return null
      const rect = containerRef.current.getBoundingClientRect()
      const localX = clamp(clientX - rect.left, 0, rect.width)
      const localY = clamp(clientY - rect.top, 0, rect.height)
      const scaleX = image.width / rect.width
      const scaleY = image.height / rect.height
      return {
        x: Math.round(localX * scaleX),
        y: Math.round(localY * scaleY),
      }
    },
    [image.height, image.width]
  )

  useEffect(() => {
    maskDataCanvasRef.current = document.createElement('canvas')
    return () => {
      maskDataCanvasRef.current = null
    }
  }, [])

  useEffect(() => {
    const dataCanvas = maskDataCanvasRef.current
    const previewCanvas = maskPreviewCanvasRef.current
    if (dataCanvas) {
      dataCanvas.width = image.width
      dataCanvas.height = image.height
      const ctx = dataCanvas.getContext('2d')
      ctx.clearRect(0, 0, dataCanvas.width, dataCanvas.height)
    }
    if (previewCanvas) {
      previewCanvas.width = image.width
      previewCanvas.height = image.height
      const ctx = previewCanvas.getContext('2d')
      ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height)
    }
  }, [image.width, image.height])

  useEffect(() => {
    const dataCanvas = maskDataCanvasRef.current
    const previewCanvas = maskPreviewCanvasRef.current
    if (!dataCanvas || !previewCanvas) return
    const ctxData = dataCanvas.getContext('2d')
    const ctxPreview = previewCanvas.getContext('2d')
    if (!ctxData || !ctxPreview) return
    ctxData.clearRect(0, 0, dataCanvas.width, dataCanvas.height)
    ctxPreview.clearRect(0, 0, previewCanvas.width, previewCanvas.height)
    if (!pixelMaskData) return
    const img = new Image()
    img.onload = () => {
      ctxData.drawImage(img, 0, 0, dataCanvas.width, dataCanvas.height)
      ctxPreview.drawImage(img, 0, 0, previewCanvas.width, previewCanvas.height)
      ctxPreview.globalCompositeOperation = 'source-in'
      ctxPreview.fillStyle = 'rgba(74,222,128,0.35)'
      ctxPreview.fillRect(0, 0, previewCanvas.width, previewCanvas.height)
      ctxPreview.globalCompositeOperation = 'source-over'
    }
    img.src = pixelMaskData
  }, [pixelMaskData, image.width, image.height])

  const drawBrushStroke = useCallback(
    (from: { x: number; y: number }, to: { x: number; y: number }) => {
      if (!enableBrush) return
      const dataCanvas = maskDataCanvasRef.current
      const previewCanvas = maskPreviewCanvasRef.current
      if (!dataCanvas || !previewCanvas) return
      const ctxData = dataCanvas.getContext('2d')
      const ctxPreview = previewCanvas.getContext('2d')
      if (!ctxData || !ctxPreview) return

      ctxData.save()
      ctxData.lineCap = 'round'
      ctxData.lineJoin = 'round'
      ctxData.lineWidth = pixelBrushSize
      ctxData.strokeStyle = '#ffffff'
      ctxData.globalCompositeOperation = pixelBrushMode === 'erase' ? 'destination-out' : 'source-over'
      ctxData.beginPath()
      ctxData.moveTo(from.x, from.y)
      ctxData.lineTo(to.x, to.y)
      ctxData.stroke()
      ctxData.restore()

      ctxPreview.save()
      ctxPreview.lineCap = 'round'
      ctxPreview.lineJoin = 'round'
      ctxPreview.lineWidth = pixelBrushSize
      if (pixelBrushMode === 'erase') {
        ctxPreview.globalCompositeOperation = 'destination-out'
        ctxPreview.strokeStyle = 'rgba(0,0,0,1)'
      } else {
        ctxPreview.globalCompositeOperation = 'source-over'
        ctxPreview.strokeStyle = 'rgba(74,222,128,0.6)'
      }
      ctxPreview.beginPath()
      ctxPreview.moveTo(from.x, from.y)
      ctxPreview.lineTo(to.x, to.y)
      ctxPreview.stroke()
      ctxPreview.restore()
    },
    [enableBrush, pixelBrushMode, pixelBrushSize]
  )

  const exportPixelMask = useCallback(() => {
    if (!enableBrush) return
    const dataCanvas = maskDataCanvasRef.current
    if (!dataCanvas) return
    const ctx = dataCanvas.getContext('2d')
    if (!ctx) return
    const pixels = ctx.getImageData(0, 0, dataCanvas.width, dataCanvas.height).data
    const hasContent = pixels.some((value) => value !== 0)
    if (!hasContent) {
      onPixelMaskChange(null, { pushHistory: true })
      return
    }
    const dataUrl = dataCanvas.toDataURL('image/png')
    onPixelMaskChange(dataUrl, { pushHistory: true })
  }, [enableBrush, onPixelMaskChange])

  const handleBrushPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!enableBrush) return
    const coords = toImageCoords(event.clientX, event.clientY)
    if (!coords) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    isPaintingRef.current = true
    lastPaintPointRef.current = coords
    drawBrushStroke(coords, coords)
  }

  const handleBrushPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPaintingRef.current || !enableBrush) return
    const coords = toImageCoords(event.clientX, event.clientY)
    const lastPoint = lastPaintPointRef.current
    if (!coords || !lastPoint) return
    drawBrushStroke(lastPoint, coords)
    lastPaintPointRef.current = coords
  }

  const handleBrushPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPaintingRef.current || !enableBrush) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    isPaintingRef.current = false
    lastPaintPointRef.current = null
    exportPixelMask()
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isDrawingMode) {
      // Drawing mode
      if (!containerRef.current) return
      const coords = toImageCoords(event.clientX, event.clientY)
      if (!coords) return
      event.preventDefault()
      event.stopPropagation()
      containerRef.current.setPointerCapture(event.pointerId)
      setDraft({
        startX: coords.x,
        startY: coords.y,
        currentX: coords.x,
        currentY: coords.y,
        rectWidth: image.width,
        rectHeight: image.height,
      })
      return
    }
    if (activeDetection) return
    if (!allowDrawing || event.button !== 0 || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = clamp(event.clientX - rect.left, 0, rect.width)
    const y = clamp(event.clientY - rect.top, 0, rect.height)
    event.currentTarget.setPointerCapture(event.pointerId)
    setDraft({
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
      rectWidth: rect.width,
      rectHeight: rect.height,
    })
  }

  const beginDetectionInteraction = (
    event: React.PointerEvent<HTMLDivElement>,
    box: OverlayBox,
    action: DetectionAction,
  ) => {
    if (!canEditDetections || !onEditDetection || !containerRef.current) return
    event.preventDefault()
    event.stopPropagation()
    const coords = toImageCoords(event.clientX, event.clientY)
    if (!coords) return
    containerRef.current.setPointerCapture(event.pointerId)
    setActiveDetection({
      index: box.instanceIndex,
      action,
      pointerId: event.pointerId,
      start: coords,
      original: { x1: box.x1, y1: box.y1, x2: box.x2, y2: box.y2 },
    })
  }

  const updateDetectionInteraction = useCallback(
    (coords: { x: number; y: number }) => {
      if (!activeDetection || !onEditDetection) return
      const { action, index, original, start } = activeDetection
      const minSize = 8
      let { x1, y1, x2, y2 } = original

      if (action === 'move') {
        const width = Math.max(original.x2 - original.x1, minSize)
        const height = Math.max(original.y2 - original.y1, minSize)
        let newX1 = original.x1 + (coords.x - start.x)
        let newY1 = original.y1 + (coords.y - start.y)
        newX1 = clamp(newX1, 0, image.width - width)
        newY1 = clamp(newY1, 0, image.height - height)
        x1 = newX1
        y1 = newY1
        x2 = newX1 + width
        y2 = newY1 + height
      } else {
        let newX1 = original.x1
        let newY1 = original.y1
        let newX2 = original.x2
        let newY2 = original.y2
        switch (action) {
          case 'resize-nw':
            newX1 = clamp(coords.x, 0, original.x2 - minSize)
            newY1 = clamp(coords.y, 0, original.y2 - minSize)
            break
          case 'resize-ne':
            newX2 = clamp(coords.x, original.x1 + minSize, image.width)
            newY1 = clamp(coords.y, 0, original.y2 - minSize)
            break
          case 'resize-sw':
            newX1 = clamp(coords.x, 0, original.x2 - minSize)
            newY2 = clamp(coords.y, original.y1 + minSize, image.height)
            break
          case 'resize-se':
            newX2 = clamp(coords.x, original.x1 + minSize, image.width)
            newY2 = clamp(coords.y, original.y1 + minSize, image.height)
            break
        }
        x1 = Math.min(newX1, newX2 - minSize)
        y1 = Math.min(newY1, newY2 - minSize)
        x2 = Math.max(newX2, newX1 + minSize)
        y2 = Math.max(newY2, newY1 + minSize)
      }

      onEditDetection(index, [Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2)])
    },
    [activeDetection, image.height, image.width, onEditDetection]
  )

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isDrawingMode) {
      // Drawing mode move
      if (!draft) return
      const coords = toImageCoords(event.clientX, event.clientY)
      if (!coords) return
      setDraft((prev) => (prev ? { ...prev, currentX: coords.x, currentY: coords.y } : prev))
      event.preventDefault()
      return
    }
    if (activeDetection) {
      const coords = toImageCoords(event.clientX, event.clientY)
      if (coords) {
        event.preventDefault()
        updateDetectionInteraction(coords)
      }
      return
    }
    if (!draft || !allowDrawing || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = clamp(event.clientX - rect.left, 0, rect.width)
    const y = clamp(event.clientY - rect.top, 0, rect.height)
    setDraft((prev) => (prev ? { ...prev, currentX: x, currentY: y } : prev))
    event.preventDefault()
  }

  const commitDraft = (draftBox: DraftBox) => {
    const minSize = 4
    if (Math.abs(draftBox.currentX - draftBox.startX) < minSize || Math.abs(draftBox.currentY - draftBox.startY) < minSize) {
      return
    }
    const scaleX = image.width / draftBox.rectWidth
    const scaleY = image.height / draftBox.rectHeight
    const x1 = Math.round(Math.min(draftBox.startX, draftBox.currentX) * scaleX)
    const y1 = Math.round(Math.min(draftBox.startY, draftBox.currentY) * scaleY)
    const x2 = Math.round(Math.max(draftBox.startX, draftBox.currentX) * scaleX)
    const y2 = Math.round(Math.max(draftBox.startY, draftBox.currentY) * scaleY)
    const newBoxId = makeBoxId()
    setManualBoxes((current) => [
      ...current,
      { id: newBoxId, x1, y1, x2, y2, label: `Prompt ${current.length + 1}`, embedding: null },
    ])
    if (onCreateBox) {
      onCreateBox(newBoxId)
    }
  }

  const finishDraft = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isDrawingMode) {
      // Drawing mode finish - show label selector
      if (!draft) return
      const minSize = 8
      if (Math.abs(draft.currentX - draft.startX) < minSize || Math.abs(draft.currentY - draft.startY) < minSize) {
        setDraft(null)
        return
      }
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      setPendingDrawBox({
        x1: Math.min(draft.startX, draft.currentX),
        y1: Math.min(draft.startY, draft.currentY),
        x2: Math.max(draft.startX, draft.currentX),
        y2: Math.max(draft.startY, draft.currentY),
      })
      setLabelSelectorActive(true)
      setCurrentLabel('')
      setDraft(null)
      return
    }
    if (activeDetection) {
      if (activeDetection.pointerId === event.pointerId && containerRef.current?.hasPointerCapture(event.pointerId)) {
        containerRef.current?.releasePointerCapture(event.pointerId)
      }
      setActiveDetection(null)
      return
    }
    if (!draft || !allowDrawing) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    commitDraft(draft)
    setDraft(null)
  }

  const cancelDraft = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activeDetection) {
      if (activeDetection.pointerId === event.pointerId && containerRef.current.hasPointerCapture(event.pointerId)) {
        containerRef.current.releasePointerCapture(event.pointerId)
      }
      setActiveDetection(null)
      return
    }
    if (!draft || !allowDrawing) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setDraft(null)
  }

  return (
    <div className="rounded-3xl border border-white/15 bg-white/95 p-4 shadow-[0_30px_60px_-40px_rgba(15,23,42,0.55)]">
      {isDrawingMode && (
        <div className="mb-3 flex items-center justify-between rounded-lg bg-blue-50 px-4 py-3 border border-blue-200">
          <div>
            <p className="text-sm font-semibold text-blue-900">🎨 Drawing Mode Active</p>
            <p className="text-xs text-blue-700">Click and drag to draw boxes • {drawingBoxes.length} drawn</p>
            {drawingBoxes.length > 0 && (
              <div className="text-xs text-blue-600 mt-1">
                {drawingBoxes.map((b, i) => (
                  <div key={i}>Box {i+1}: label="{b.label}"</div>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            {drawingBoxes.length > 0 && (
              <button
                onClick={() => {
                  onDrawingComplete?.(drawingBoxes.map(b => ({
                    x1: b.x1,
                    y1: b.y1,
                    x2: b.x2,
                    y2: b.y2,
                    class_name: b.label,
                  })))
                  setDrawingBoxes([])
                  setIsImageDrawingMode(false)
                }}
                className="text-xs font-medium bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
              >
                Save ({drawingBoxes.length})
              </button>
            )}
            <button
              onClick={() => {
                onDrawingComplete?.([])
                setDrawingBoxes([])
                setIsImageDrawingMode(false)
              }}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <div
        ref={containerRef}
        className={classNames(
          'relative w-full overflow-hidden rounded-2xl bg-neutral-100',
          isDrawingMode ? 'cursor-crosshair touch-none' : allowDrawing ? 'cursor-crosshair touch-none' : '',
        )}
        style={{ aspectRatio: `${image.width} / ${image.height}` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDraft}
        onPointerCancel={cancelDraft}
        onPointerLeave={cancelDraft}
      >
        <img
          src={image.url}
          alt={image.filename || `Image ${image.id}`}
          className="h-full w-full object-contain"
          style={{ pointerEvents: 'none' }}
        />

        <div className="absolute inset-0">
          <canvas
            ref={maskPreviewCanvasRef}
            className="absolute inset-0"
              style={{
                width: '100%',
                height: '100%',
                pointerEvents: enableBrush ? 'auto' : 'none',
                cursor: enableBrush ? 'crosshair' : 'default',
              }}
            onPointerDown={enableBrush ? handleBrushPointerDown : undefined}
            onPointerMove={enableBrush ? handleBrushPointerMove : undefined}
            onPointerUp={enableBrush ? handleBrushPointerUp : undefined}
            onPointerCancel={enableBrush ? handleBrushPointerUp : undefined}
          />
          {mode === 'visualBox' &&
            manualBoxes.map((box) => (
              <div
                key={box.id}
                className="pointer-events-none absolute rounded-xl border-2 border-sky-500 bg-sky-400/10"
                style={computeBoxStyle(box, image)}
              >
                {box.label && (
                  <div className="pointer-events-none absolute left-2 top-2 rounded-full bg-sky-500 px-2 py-1 text-xs font-semibold text-white shadow">
                    {box.label}
                  </div>
                )}
              </div>
            ))}

          {!isDrawingMode && detectionBoxes.map((box) => {
            const isActive = activeDetection?.index === box.instanceIndex
            return (
              <div
                key={box.id}
                role="presentation"
                className={classNames(
                  'absolute rounded-xl border-2 bg-emerald-500/10 backdrop-blur-sm',
                  box.muted ? 'border-emerald-200 opacity-40' : 'border-emerald-500',
                  canEditDetections ? 'cursor-move' : 'pointer-events-none',
                  isActive ? 'ring-2 ring-emerald-500/60' : '',
                )}
                style={computeBoxStyle(box, image)}
                onPointerDown={(event) => beginDetectionInteraction(event, box, 'move')}
              >
                {box.label && (
                  <div className="pointer-events-none absolute left-2 top-2 rounded-full bg-emerald-500 px-2 py-1 text-xs font-semibold text-white shadow">
                    {box.label}
                  </div>
                )}
                {canEditDetections && (
                  <>
                    <div
                      role="presentation"
                      className="absolute inset-0 cursor-move"
                      onPointerDown={(event) => beginDetectionInteraction(event, box, 'move')}
                    />
                    <div
                      className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-600 bg-white shadow-sm"
                      style={{ left: '0%', top: '0%', cursor: 'nwse-resize' }}
                      onPointerDown={(event) => beginDetectionInteraction(event, box, 'resize-nw')}
                    />
                    <div
                      className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-600 bg-white shadow-sm"
                      style={{ left: '100%', top: '0%', cursor: 'nesw-resize' }}
                      onPointerDown={(event) => beginDetectionInteraction(event, box, 'resize-ne')}
                    />
                    <div
                      className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-600 bg-white shadow-sm"
                      style={{ left: '0%', top: '100%', cursor: 'nesw-resize' }}
                      onPointerDown={(event) => beginDetectionInteraction(event, box, 'resize-sw')}
                    />
                    <div
                      className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-600 bg-white shadow-sm"
                      style={{ left: '100%', top: '100%', cursor: 'nwse-resize' }}
                      onPointerDown={(event) => beginDetectionInteraction(event, box, 'resize-se')}
                    />
                  </>
                )}
              </div>
            )
          })}

          {allowDrawing && draft && !isDrawingMode && (
            <div
              className="pointer-events-none absolute rounded-xl border-2 border-sky-500/80 bg-sky-400/20"
              style={{
                left: `${Math.min(draft.startX, draft.currentX)}px`,
                top: `${Math.min(draft.startY, draft.currentY)}px`,
                width: `${Math.abs(draft.currentX - draft.startX)}px`,
                height: `${Math.abs(draft.currentY - draft.startY)}px`,
              }}
            />
          )}

          {isDrawingMode && drawingBoxes.map((box) => {
            const x1Pct = (box.x1 / image.width) * 100
            const y1Pct = (box.y1 / image.height) * 100
            const x2Pct = (box.x2 / image.width) * 100
            const y2Pct = (box.y2 / image.height) * 100
            return (
              <div
                key={`${box.x1}-${box.y1}-${box.label}`}
                className="absolute rounded-lg border-2 border-blue-500 bg-blue-400/10"
                style={{
                  left: `${x1Pct}%`,
                  top: `${y1Pct}%`,
                  width: `${x2Pct - x1Pct}%`,
                  height: `${y2Pct - y1Pct}%`,
                  pointerEvents: 'none',
                }}
              >
                {box.label && (
                  <div className="absolute left-2 top-2 rounded-full bg-blue-500 px-2 py-1 text-xs font-semibold text-white shadow">
                    {box.label}
                  </div>
                )}
              </div>
            )
          })}

          {isDrawingMode && draft && (
            <div
              className="pointer-events-none absolute rounded-lg border-2 border-orange-500 bg-orange-400/20"
              style={{
                left: `${(Math.min(draft.startX, draft.currentX) / image.width) * 100}%`,
                top: `${(Math.min(draft.startY, draft.currentY) / image.height) * 100}%`,
                width: `${((Math.abs(draft.currentX - draft.startX)) / image.width) * 100}%`,
                height: `${((Math.abs(draft.currentY - draft.startY)) / image.height) * 100}%`,
              }}
            >
              <button
                onClick={() => {
                  const coords = {
                    x1: Math.min(draft.startX, draft.currentX),
                    y1: Math.min(draft.startY, draft.currentY),
                    x2: Math.max(draft.startX, draft.currentX),
                    y2: Math.max(draft.startY, draft.currentY),
                  }
                  setPendingDrawBox(coords)
                  setLabelSelectorActive(true)
                  setDraft(null)
                }}
                className="absolute -right-6 -top-6 h-6 w-6 rounded-full bg-orange-500 text-white text-lg font-bold hover:bg-orange-600 shadow-lg flex items-center justify-center"
                title="Add label for this box"
              >
                +
              </button>
            </div>
          )}

          {labelSelectorActive && pendingDrawBox && (
            <div 
              className="fixed inset-0 flex items-center justify-center bg-black/50 z-[9999]" 
              style={{ pointerEvents: 'auto' }}
              onPointerDown={(e) => {
                // Click vào backdrop để đóng modal
                if (e.target === e.currentTarget) {
                  setLabelSelectorActive(false)
                  setPendingDrawBox(null)
                  setCurrentLabel('')
                }
                e.stopPropagation()
              }}
              onPointerMove={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
            >
              <div 
                className="bg-white rounded-lg shadow-xl p-4 max-w-md w-full mx-4" 
                style={{ pointerEvents: 'auto' }}
                onPointerDown={(e) => e.stopPropagation()}
                onPointerMove={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
              >
                <h4 className="text-lg font-semibold text-neutral-900 mb-4">Label for drawn box</h4>
                <input
                  autoFocus
                  type="text"
                  value={currentLabel}
                  onChange={(e) => setCurrentLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && currentLabel.trim()) {
                      setDrawingBoxes([...drawingBoxes, { ...pendingDrawBox, label: currentLabel.trim() }])
                      setLabelSelectorActive(false)
                      setPendingDrawBox(null)
                      setCurrentLabel('')
                    }
                  }}
                  placeholder="Type label..."
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white text-neutral-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {labelSuggestions && labelSuggestions.length > 0 && (
                  <div className="mt-2 max-h-32 overflow-y-auto space-y-1">
                    {labelSuggestions
                      .filter((s) => !currentLabel || s.toLowerCase().includes(currentLabel.toLowerCase()))
                      .slice(0, 6)
                      .map((s) => (
                        <button
                          key={s}
                          onClick={(e) => {
                            e.stopPropagation()
                            setDrawingBoxes([...drawingBoxes, { ...pendingDrawBox, label: s }])
                            setLabelSelectorActive(false)
                            setPendingDrawBox(null)
                            setCurrentLabel('')
                          }}
                          className="w-full text-left rounded px-2 py-1.5 text-sm hover:bg-blue-50 border border-blue-200 text-neutral-900"
                        >
                          {s}
                        </button>
                      ))}
                  </div>
                )}
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setDrawingBoxes([...drawingBoxes, { ...pendingDrawBox, label: currentLabel.trim() || 'object' }])
                      setLabelSelectorActive(false)
                      setPendingDrawBox(null)
                      setCurrentLabel('')
                    }}
                    disabled={!currentLabel.trim()}
                    className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    Add Box
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setLabelSelectorActive(false)
                      setPendingDrawBox(null)
                      setCurrentLabel('')
                    }}
                    className="flex-1 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-neutral-500">
        <span>
          {image.filename || `Image ${image.id}`} - {image.width}x{image.height}px
        </span>
        {mode === 'visualBox' && (
          <span>{manualBoxes.length ? `${manualBoxes.length} prompt box(es)` : 'No prompt boxes yet'}</span>
        )}
      </div>
    </div>
  )
}

function BoxPromptList({
  boxes,
  setBoxes,
  image,
  suggestions,
  focusBoxId,
  onFocusHandled,
  onLabelChange,
}: {
  boxes: Box[]
  setBoxes: Dispatch<SetStateAction<Box[]>>
  image: ProjectImage
  suggestions: string[]
  focusBoxId: string | null
  onFocusHandled: () => void
  onLabelChange: (label: string) => void
}) {
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    if (!focusBoxId) return
    const input = inputRefs.current[focusBoxId]
    if (input) {
      input.focus()
      input.select()
        onFocusHandled?.()
      }
    }, [focusBoxId, onFocusHandled])

  if (!boxes.length) {
    return (
      <div className="rounded-3xl border bg-white px-5 py-4 text-sm text-neutral-500 shadow-sm">
        Click and drag on the image to add prompt boxes that guide the detection.
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-3xl border border-white/15 bg-white/95 p-5 shadow-[0_30px_60px_-40px_rgba(15,23,42,0.55)]">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Prompt boxes</h3>
        <button
          type="button"
          onClick={() => setBoxes([])}
          className="text-xs font-medium text-neutral-500 transition hover:text-neutral-700"
        >
          Clear all
        </button>
      </div>
      <ul className="space-y-3 text-sm text-neutral-700">
        {boxes.map((box, index) => (
          <li
            key={box.id}
            className="space-y-2 rounded-xl border border-sky-200 bg-sky-50/60 px-3 py-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase text-sky-700">Box {index + 1}</span>
              <button
                type="button"
                onClick={() =>
                  setBoxes((current) => current.filter((item) => item.id !== box.id))
                }
                className="text-xs font-medium text-rose-600 transition hover:text-rose-500"
              >
                Remove
              </button>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="flex-1 text-xs font-medium text-neutral-600">
                Label
                <input
                  ref={(node) => {
                    inputRefs.current[box.id] = node
                  }}
                  list={`prompt-suggestions-${box.id}`}
                  value={box.label ?? ''}
                  onChange={(event) => {
                    const value = event.target.value
                    setBoxes((current) =>
                      current.map((item) => (item.id === box.id ? { ...item, label: value } : item)),
                    )
                    if (value && value.trim()) {
                      onLabelChange?.(value.trim())
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.currentTarget.blur()
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      event.currentTarget.value = box.label ?? ''
                      event.currentTarget.blur()
                    }
                  }}
                  placeholder="Enter a label"
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                />
                <datalist id={`prompt-suggestions-${box.id}`}>
                  {suggestions.map((suggestion) => (
                    <option key={`${box.id}-${suggestion}`} value={suggestion} />
                  ))}
                </datalist>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-neutral-600 sm:grid-cols-4">
              {(['x1', 'y1', 'x2', 'y2'] as const).map((key) => (
                <label key={key} className="flex flex-col gap-1">
                  <span className="font-medium uppercase tracking-wide">{key}</span>
                  <input
                    type="number"
                    value={box[key]}
                    onChange={(event) => {
                      const raw = Number(event.target.value)
                      if (!Number.isFinite(raw)) return
                      const maxX = image.width
                      const maxY = image.height
                      setBoxes((current) =>
                        current.map((item) => {
                          if (item.id !== box.id) return item
                          let next = { ...item }
                          if (key === 'x1') {
                            next.x1 = clamp(Math.round(raw), 0, maxX)
                            if (next.x2 <= next.x1) next.x2 = clamp(next.x1 + 1, 0, maxX)
                          } else if (key === 'y1') {
                            next.y1 = clamp(Math.round(raw), 0, maxY)
                            if (next.y2 <= next.y1) next.y2 = clamp(next.y1 + 1, 0, maxY)
                          } else if (key === 'x2') {
                            next.x2 = clamp(Math.round(raw), 0, maxX)
                            if (next.x2 <= next.x1) next.x1 = clamp(next.x2 - 1, 0, maxX)
                          } else if (key === 'y2') {
                            next.y2 = clamp(Math.round(raw), 0, maxY)
                            if (next.y2 <= next.y1) next.y1 = clamp(next.y2 - 1, 0, maxY)
                          }
                          return next
                        }),
                      )
                    }}
                    className="rounded-lg border border-neutral-300 px-2 py-1 text-sm shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  />
                </label>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function UploadSection({
  projectId,
  onUploaded,
  onError,
}: {
  projectId: number
  onUploaded: () => void
  onError: (message: string) => void
}) {
  type PendingFile = {
    id: string
    file: File
    url: string
  }

  const inputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<PendingFile[]>([])

  useEffect(() => {
    return () => {
      selectedFiles.forEach((item) => URL.revokeObjectURL(item.url))
    }
  }, [selectedFiles])

  const applyFilesToInput = (files: PendingFile[]) => {
    if (!inputRef.current) return
    const dataTransfer = new DataTransfer()
    files.forEach((item) => dataTransfer.items.add(item.file))
    inputRef.current.files = dataTransfer.files
    if (files.length === 0) {
      inputRef.current.value = ''
    }
  }

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? [])
    setSelectedFiles((prev) => {
      prev.forEach((item) => URL.revokeObjectURL(item.url))
      return files.map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
        file,
        url: URL.createObjectURL(file),
      }))
    })
  }

  const handleRemove = (id: string) => {
    setSelectedFiles((prev) => {
      const target = prev.find((item) => item.id === id)
      if (target) {
        URL.revokeObjectURL(target.url)
      }
      const next = prev.filter((item) => item.id !== id)
      applyFilesToInput(next)
      return next
    })
  }

  const handleClear = () => {
    selectedFiles.forEach((item) => URL.revokeObjectURL(item.url))
    setSelectedFiles([])
    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  const handleUpload = async () => {
    if (!selectedFiles.length) {
      onError('Select at least one image to upload.')
      return
    }

    const form = new FormData()
    form.append('project_id', String(projectId))
    selectedFiles.forEach((item) => form.append('files', item.file))

    setIsUploading(true)
    try {
      const response = await fetch(addAuthToUrl(`${API}/images/upload`), {
        method: 'POST',
        body: form,
        credentials: 'include',
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || 'Upload failed')
      }
      handleClear()
      onUploaded()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed'
      onError(message)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="space-y-4 rounded-3xl border bg-white p-5 shadow-sm">
      <div>
        <h3 className="text-lg font-semibold">Upload images</h3>
        <p className="text-sm text-neutral-500">Select multiple files to add them to this project.</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleChange}
        className="block w-full text-sm text-neutral-700 file:mr-4 file:rounded-lg file:border-0 file:bg-neutral-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-neutral-800"
      />
      {selectedFiles.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {selectedFiles.map((item) => (
            <div
              key={item.id}
              className="relative overflow-hidden rounded-2xl border border-neutral-400 bg-neutral-50 shadow-sm"
            >
              <img
                src={item.url}
                alt={item.file.name}
                className="h-24 w-full object-cover"
                draggable={false}
              />
              <button
                type="button"
                onClick={() => handleRemove(item.id)}
                className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white text-neutral-500 shadow hover:bg-rose-500 hover:text-white"
                aria-label={`Remove ${item.file.name}`}
              >
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 6h18M9 6V4h6v2m1 0v14a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V6m2 4v8m4-8v8" />
                </svg>
              </button>
              <div className="truncate px-3 py-2 text-xs font-medium text-neutral-600">{item.file.name}</div>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>
          {selectedFiles.length ? `${selectedFiles.length} file(s) selected` : 'No files selected'}
        </span>
        {selectedFiles.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="font-medium text-neutral-600 transition hover:text-neutral-800"
          >
            Clear
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={handleUpload}
        disabled={isUploading}
        className="w-full rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isUploading ? 'Uploading...' : 'Upload selected images'}
      </button>
    </div>
  )
}









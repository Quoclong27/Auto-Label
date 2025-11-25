import React from 'react'

export interface PickerDetection {
  bbox: [number, number, number, number]
  confidence: number
  class_name: string
  embedding?: number[] | null
  instance_name?: string | null
}

export interface PickerImage {
  id: number
  url: string
  width: number
  height: number
  filename?: string | null
  created_at?: string | null
  annotation_id?: number | null
  annotation_updated_at?: string | null
  annotation_preview?: PickerDetection[]
}

interface ImagePickerProps {
  items: PickerImage[]
  activeId: number | null
  onSelect: (id: number) => void
  loading?: boolean
  emptyMessage?: string
  onDelete?: (item: PickerImage) => void
}

const formatMeta = (item: PickerImage): string => {
  const dims = `${item.width}x${item.height}`
  if (!item.created_at) return dims
  const date = new Date(item.created_at)
  const stamp = Number.isNaN(date.getTime()) ? item.created_at : date.toLocaleString()
  return `${dims} - ${stamp}`
}

export default function ImagePicker({
  items,
  activeId,
  onSelect,
  loading,
  onDelete,
  emptyMessage = 'No images yet. Upload files to start labeling.',
}: ImagePickerProps) {
  if (loading) {
    return (
      <div className="rounded-2xl border bg-white p-4 text-sm text-neutral-500 shadow-sm">
        Loading images...
      </div>
    )
  }

  if (!items.length) {
    return (
      <div className="rounded-2xl border border-dashed bg-white p-6 text-center text-sm text-neutral-500 shadow-sm">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((item) => {
        const isActive = item.id === activeId
        const isApproved = Boolean(item.annotation_id)
        const approvedOverlay = item.annotation_preview ?? []
        return (
          <div
            key={item.id}
            onClick={() => onSelect(item.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelect(item.id)
              }
            }}
            role="button"
            tabIndex={0}
            className={`group relative rounded-2xl border p-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
              isApproved
                ? isActive
                  ? 'border-[#27F59F] bg-[#27F59F] text-neutral-900 shadow-[0_12px_24px_-12px_rgba(39,245,159,0.6)]'
                  : 'border-[#27F59F] bg-[#27F59F] text-neutral-900 shadow-sm hover:shadow-[0_12px_24px_-12px_rgba(39,245,159,0.6)]'
                : isActive
                  ? 'border-neutral-900 bg-white text-neutral-900 shadow-[0_0_0_2px_rgba(17,17,17,0.35)]'
                  : 'border-transparent bg-white text-neutral-900 shadow-sm hover:border-neutral-300'
            }`}
          >
            {onDelete && (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  onDelete(item)
                }}
                className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 bg-white/95 text-neutral-600 shadow-md transition hover:border-rose-500 hover:bg-rose-500 hover:text-white"
                aria-label={`Delete ${item.filename || `image ${item.id}`}`}
              >
                <svg
                  className="h-4 w-4"
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
            )}
            <div className="relative mb-2 overflow-hidden rounded-xl bg-neutral-100">
              <div className="block w-full" style={{ aspectRatio: '4 / 3' }} />
              <img
                src={item.url}
                alt={item.filename ?? `Image ${item.id}`}
                className="absolute inset-0 h-full w-full object-cover transition group-hover:scale-[1.02]"
                loading="lazy"
              />
              {isApproved && approvedOverlay.length > 0 && (
                <div className="absolute inset-0">
                  {approvedOverlay.slice(0, 12).map((det, index) => {
                    const [x1, y1, x2, y2] = det.bbox
                    const left = Math.max(0, Math.min(1, x1 / Math.max(item.width, 1)))
                    const top = Math.max(0, Math.min(1, y1 / Math.max(item.height, 1)))
                    const width = Math.max(0, Math.min(1, (x2 - x1) / Math.max(item.width, 1)))
                    const height = Math.max(0, Math.min(1, (y2 - y1) / Math.max(item.height, 1)))
                    return (
                      <div
                        key={`${det.class_name}-${index}`}
                        className="absolute overflow-hidden rounded-lg border border-[#27F59F] bg-[#27F59F33] backdrop-blur-[2px]"
                        style={{
                          left: `${left * 100}%`,
                          top: `${top * 100}%`,
                          width: `${Math.max(width * 100, 8)}%`,
                          height: `${Math.max(height * 100, 6)}%`,
                        }}
                      >
                        <div className="rounded-b-lg bg-[#1f9f6f]/90 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm">
                          {det.class_name}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="space-y-1">
              <div className="truncate text-sm font-medium">
                {item.filename || `Image ${item.id}`}
              </div>
              <div className="text-xs text-neutral-700">{formatMeta(item)}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

import React, { useState } from 'react'

export interface DetectionInstance {
  bbox: [number, number, number, number]
  confidence: number
  class_name: string
  embedding?: number[] | null
  instance_name?: string
  match_score?: number
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
}

interface LabelReviewProps {
  instances: DetectionInstance[]
  keepSelection: boolean[]
  onToggle: (index: number) => void
  onApprove: () => void
  onReject: () => void
  disabled?: boolean
  editableNames?: boolean
  onNameChange?: (index: number, value: string) => void
  image?: PickerImage | null
  suggestions?: string[]
  onAddManualBoxes?: (boxes: Array<{ x1: number; y1: number; x2: number; y2: number; class_name: string }>) => void
  onEnableImageDrawing?: () => void
}

export default function LabelReview({
  instances,
  keepSelection,
  onToggle,
  onApprove,
  onReject,
  disabled,
  editableNames = false,
  onNameChange,
  image,
  suggestions = [],
  onAddManualBoxes,
  onEnableImageDrawing,
}: LabelReviewProps) {
  const [showManualDraw, setShowManualDraw] = useState(false)
  const hasDetections = instances.length > 0

  return (
    <div className="space-y-4 rounded-3xl border bg-white p-4 shadow-sm">
      <div>
        <h3 className="text-lg font-semibold text-neutral-900">Review detections</h3>
        <p className="text-sm text-neutral-500">
          Toggle the boxes you want to keep before confirming the result. You can drag boxes directly on the
          image to fine-tune their position.
        </p>
      </div>

      {!hasDetections ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-dashed bg-amber-50 px-4 py-6 text-center">
            <p className="text-sm font-medium text-amber-900">No objects detected</p>
            <p className="text-sm text-amber-700 mt-1">The inference didn't find any objects. Use the drawing tool below to manually label objects.</p>
          </div>
        </div>
      ) : (
        <ul className="max-h-64 space-y-3 overflow-y-auto pr-1">
          {instances.map((inst, index) => {
            const keep = keepSelection[index] ?? true
            const [x1, y1, x2, y2] = inst.bbox
            const width = Math.max(x2 - x1, 0)
            const height = Math.max(y2 - y1, 0)
            return (
              <li
                key={`instance-${index}`}
                className={`flex items-start gap-3 rounded-2xl border px-3 py-2 text-sm ${
                  keep ? 'border-emerald-200 bg-emerald-50/60' : 'border-neutral-200 bg-neutral-50'
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-neutral-400 text-emerald-600 focus:ring-emerald-500 disabled:opacity-60"
                  checked={keep}
                  onChange={() => onToggle(index)}
                  disabled={disabled}
                />
                <div className="space-y-1">
                  {editableNames ? (
                    <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      {inst.instance_name ?? `Label ${index + 1}`}
                      <input
                        className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:bg-neutral-100 disabled:text-neutral-400"
                        value={inst.class_name}
                        onChange={(event) => onNameChange?.(index, event.target.value)}
                        placeholder="Enter label"
                        disabled={disabled}
                      />
                    </label>
                  ) : (
                    <div className="font-medium text-neutral-900">
                      {inst.instance_name ?? inst.class_name}
                      <span className="ml-1 text-xs text-neutral-500">({inst.class_name})</span>
                    </div>
                  )}
                  <div className="text-xs text-neutral-500">
                    Confidence: {(inst.confidence * 100).toFixed(1)}%
                  </div>
                  {typeof inst.match_score === 'number' && (
                    <div className="text-xs text-neutral-500">
                      Similarity: {(inst.match_score * 100).toFixed(1)}%
                    </div>
                  )}
                  <div className="text-xs text-neutral-500">
                    Box: ({x1}, {y1}) &rarr; ({x2}, {y2}); size {width}px × {height}px
                  </div>
                  <div className="text-xs text-neutral-400">Drag boxes on the image to fine-tune their position.</div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onApprove}
          disabled={!hasDetections || disabled}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Approve selection
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={!hasDetections || disabled}
          className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Reject all
        </button>
        {image && (
          <button
            type="button"
            onClick={() => onEnableImageDrawing?.()}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            ✏️ Draw on Image
          </button>
        )}
      </div>

      {showManualDraw && image && (
        <ManualDrawSection
          image={image}
          suggestions={suggestions}
          onBoxesAdded={(boxes: any[]) => {
            onAddManualBoxes?.(boxes)
            setShowManualDraw(false)
          }}
          onCancel={() => setShowManualDraw(false)}
        />
      )}
    </div>
  )
}

interface ManualDrawSectionProps {
  image: PickerImage
  suggestions: string[]
  onBoxesAdded: (boxes: Array<{ x1: number; y1: number; x2: number; y2: number; class_name: string }>) => void
  onCancel: () => void
}

function ManualDrawSection({ image, suggestions, onBoxesAdded, onCancel }: ManualDrawSectionProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [boxes, setBoxes] = React.useState<
    Array<{ id: string; x1: number; y1: number; x2: number; y2: number; label: string }>
  >([])
  const [isDrawing, setIsDrawing] = React.useState(false)
  const [startX, setStartX] = React.useState(0)
  const [startY, setStartY] = React.useState(0)
  const [pendingBox, setPendingBox] = React.useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [editingBoxId, setEditingBoxId] = React.useState<string | null>(null)
  const [labelInput, setLabelInput] = React.useState('')
  const [labelSelectorPos, setLabelSelectorPos] = React.useState<{ x: number; y: number } | null>(null)

  const imageUrl = image.url

  const pixelToImageCoords = React.useCallback(
    (canvasX: number, canvasY: number) => {
      if (!canvasRef.current) return null
      const canvas = canvasRef.current
      const scaleX = image.width / canvas.width
      const scaleY = image.height / canvas.height
      return {
        x: Math.round(canvasX * scaleX),
        y: Math.round(canvasY * scaleY),
      }
    },
    [image.width, image.height]
  )

  const imageToPixelCoords = React.useCallback(
    (imgX: number, imgY: number) => {
      if (!canvasRef.current) return null
      const canvas = canvasRef.current
      const scaleX = canvas.width / image.width
      const scaleY = canvas.height / image.height
      return {
        x: Math.round(imgX * scaleX),
        y: Math.round(imgY * scaleY),
      }
    },
    [image.width, image.height]
  )

  const drawCanvas = React.useCallback(() => {
    if (!canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const img = new Image()
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      // Draw existing boxes
      boxes.forEach((box) => {
        const px1 = imageToPixelCoords(box.x1, box.y1)
        const px2 = imageToPixelCoords(box.x2, box.y2)
        if (px1 && px2) {
          ctx.strokeStyle = '#3b82f6'
          ctx.lineWidth = 2
          ctx.strokeRect(px1.x, px1.y, px2.x - px1.x, px2.y - px1.y)
          ctx.fillStyle = 'rgba(59, 130, 246, 0.1)'
          ctx.fillRect(px1.x, px1.y, px2.x - px1.x, px2.y - px1.y)
          
          // Draw label background
          ctx.fillStyle = '#3b82f6'
          ctx.font = 'bold 13px sans-serif'
          const textWidth = ctx.measureText(box.label).width
          ctx.fillRect(px1.x, px1.y - 20, textWidth + 8, 18)
          
          // Draw label text
          ctx.fillStyle = '#ffffff'
          ctx.fillText(box.label, px1.x + 4, px1.y - 5)
        }
      })

      // Draw pending box
      if (pendingBox) {
        const px1 = imageToPixelCoords(pendingBox.x1, pendingBox.y1)
        const px2 = imageToPixelCoords(pendingBox.x2, pendingBox.y2)
        if (px1 && px2) {
          ctx.strokeStyle = '#f97316'
          ctx.lineWidth = 2
          ctx.setLineDash([5, 5])
          ctx.strokeRect(px1.x, px1.y, px2.x - px1.x, px2.y - px1.y)
          ctx.setLineDash([])
          
          // Draw add label icon
          const iconX = px2.x - 20
          const iconY = px1.y - 20
          ctx.fillStyle = 'rgba(249, 115, 22, 0.9)'
          ctx.fillRect(iconX, iconY, 30, 30)
          ctx.fillStyle = '#ffffff'
          ctx.font = 'bold 20px sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('+', iconX + 15, iconY + 15)
          ctx.textAlign = 'start'
        }
      }
    }
    img.src = imageUrl
  }, [boxes, pendingBox, imageToPixelCoords, imageUrl])

  React.useEffect(() => {
    drawCanvas()
  }, [drawCanvas])

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const coords = pixelToImageCoords(x, y)
    if (!coords) return

    // Check if clicking on add label icon
    if (pendingBox) {
      const px2 = imageToPixelCoords(pendingBox.x2, pendingBox.y2)
      const px1 = imageToPixelCoords(pendingBox.x1, pendingBox.y1)
      if (px1 && px2) {
        const iconX = px2.x - 20
        const iconY = px1.y - 20
        if (x >= iconX && x <= iconX + 30 && y >= iconY && y <= iconY + 30) {
          setEditingBoxId(`temp-${Date.now()}`)
          setLabelSelectorPos({ x: x, y: y })
          setLabelInput('')
          return
        }
      }
    }

    setIsDrawing(true)
    setStartX(coords.x)
    setStartY(coords.y)
  }

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const coords = pixelToImageCoords(x, y)
    if (!coords) return

    setPendingBox({
      x1: Math.min(startX, coords.x),
      y1: Math.min(startY, coords.y),
      x2: Math.max(startX, coords.x),
      y2: Math.max(startY, coords.y),
    })
  }

  const handleCanvasMouseUp = () => {
    if (!pendingBox || !isDrawing) {
      setIsDrawing(false)
      setPendingBox(null)
      return
    }

    setIsDrawing(false)
    // Show label selector
    setEditingBoxId(`temp-${Date.now()}`)
    const px1 = imageToPixelCoords(pendingBox.x1, pendingBox.y1)
    if (px1 && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect()
      setLabelSelectorPos({ x: rect.left + (px1.x * rect.width) / canvasRef.current.width, y: rect.top + (px1.y * rect.height) / canvasRef.current.height })
    }
    setLabelInput('')
  }

  const handleAddLabel = (label: string) => {
    if (!pendingBox || !label.trim()) return

    setBoxes([
      ...boxes,
      {
        id: `manual-${Date.now()}`,
        ...pendingBox,
        label: label.trim(),
      },
    ])

    setPendingBox(null)
    setEditingBoxId(null)
    setLabelSelectorPos(null)
    setLabelInput('')
  }

  const handleRemoveBox = (id: string) => {
    setBoxes(boxes.filter((b) => b.id !== id))
  }

  const handleSave = () => {
    const result = boxes.map((b) => ({
      x1: b.x1,
      y1: b.y1,
      x2: b.x2,
      y2: b.y2,
      class_name: b.label,
    }))
    onBoxesAdded(result)
  }

  return (
    <div className="space-y-4 rounded-3xl border bg-white p-4 shadow-sm">
      <div>
        <h3 className="text-lg font-semibold text-neutral-900">Draw Manual Boxes</h3>
        <p className="text-sm text-neutral-500">Click and drag on the original image to draw. Click the + icon to add label.</p>
      </div>

      <div ref={containerRef} className="relative rounded-2xl border border-neutral-200 bg-neutral-50 overflow-auto" style={{ maxHeight: '600px' }}>
        <canvas
          ref={canvasRef}
          width={image.width}
          height={image.height}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          className="cursor-crosshair"
          style={{ display: 'block', maxWidth: '100%', height: 'auto' }}
        />

        {editingBoxId && labelSelectorPos && (
          <div
            className="fixed bg-white rounded-lg shadow-xl border border-neutral-200 p-3 z-50 min-w-64"
            style={{
              left: `${labelSelectorPos.x}px`,
              top: `${labelSelectorPos.y}px`,
            }}
          >
            <input
              autoFocus
              type="text"
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && labelInput.trim()) {
                  handleAddLabel(labelInput)
                }
              }}
              placeholder="Type label or choose..."
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            
            {suggestions.length > 0 && (
              <div className="mt-2 max-h-32 overflow-y-auto space-y-1">
                {suggestions
                  .filter((s) => !labelInput || s.toLowerCase().includes(labelInput.toLowerCase()))
                  .slice(0, 8)
                  .map((s) => (
                    <button
                      key={s}
                      onClick={() => handleAddLabel(s)}
                      className="w-full text-left rounded px-2 py-1.5 text-sm hover:bg-blue-50 border border-blue-200 text-neutral-900"
                    >
                      {s}
                    </button>
                  ))}
              </div>
            )}

            <button
              onClick={() => {
                if (labelInput.trim()) {
                  handleAddLabel(labelInput)
                } else {
                  setEditingBoxId(null)
                  setLabelSelectorPos(null)
                  setPendingBox(null)
                }
              }}
              className="w-full mt-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500"
            >
              Add Label
            </button>
          </div>
        )}
      </div>

      {boxes.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-neutral-700">Drawn boxes:</p>
          <ul className="max-h-40 space-y-1 overflow-y-auto">
            {boxes.map((box) => (
              <li
                key={box.id}
                className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm"
              >
                <span>
                  <strong>{box.label}</strong> - ({box.x1}, {box.y1}) to ({box.x2}, {box.y2})
                </span>
                <button
                  onClick={() => handleRemoveBox(box.id)}
                  className="text-red-600 hover:text-red-700 text-xs font-medium"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleSave}
          disabled={boxes.length === 0}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          Add {boxes.length} Box{boxes.length !== 1 ? 'es' : ''} to Annotation
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}


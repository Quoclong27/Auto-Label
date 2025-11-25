import React, { useRef, useState, useCallback } from 'react'

export interface ManualBox {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
  label: string
}

interface ManualDrawProps {
  image: {
    id: number
    url: string
    width: number
    height: number
    filename?: string
  }
  boxes: ManualBox[]
  onBoxesChange: (boxes: ManualBox[]) => void
  suggestions: string[]
  disabled?: boolean
  onSaveClick?: (boxes: ManualBox[]) => void
  isSaving?: boolean
}

function makeBoxId(): string {
  return `manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export default function ManualDraw({
  image,
  boxes,
  onBoxesChange,
  suggestions,
  disabled = false,
  onSaveClick,
  isSaving = false,
}: ManualDrawProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [startX, setStartX] = useState(0)
  const [startY, setStartY] = useState(0)
  const [pendingBox, setPendingBox] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null)
  const [showLabelInput, setShowLabelInput] = useState(false)
  const [labelInput, setLabelInput] = useState('')
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(null)

  const getCanvasCoords = useCallback(
    (clientX: number, clientY: number) => {
      if (!canvasRef.current) return null
      const rect = canvasRef.current.getBoundingClientRect()
      const x = clientX - rect.left
      const y = clientY - rect.top
      return { x, y }
    },
    []
  )

  const pixelToImageCoords = useCallback(
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

  const imageToPixelCoords = useCallback(
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

  const drawCanvas = useCallback(() => {
    if (!canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw image
    const img = new Image()
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      // Draw boxes
      boxes.forEach((box) => {
        const p1 = imageToPixelCoords(box.x1, box.y1)
        const p2 = imageToPixelCoords(box.x2, box.y2)
        if (!p1 || !p2) return

        const isSelected = box.id === selectedBoxId
        ctx.strokeStyle = isSelected ? '#10b981' : '#ef4444'
        ctx.lineWidth = isSelected ? 3 : 2
        ctx.fillStyle = isSelected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'

        ctx.fillRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y)
        ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y)

        // Draw label
        ctx.fillStyle = isSelected ? '#10b981' : '#ef4444'
        ctx.font = 'bold 12px sans-serif'
        ctx.fillText(box.label || 'Unlabeled', p1.x + 4, p1.y - 4)
      })

      // Draw pending box
      if (pendingBox) {
        const p1 = imageToPixelCoords(pendingBox.x1, pendingBox.y1)
        const p2 = imageToPixelCoords(pendingBox.x2, pendingBox.y2)
        if (p1 && p2) {
          ctx.strokeStyle = '#f59e0b'
          ctx.lineWidth = 2
          ctx.setLineDash([5, 5])
          ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y)
          ctx.setLineDash([])
        }
      }
    }
    img.src = image.url
  }, [boxes, pendingBox, selectedBoxId, imageToPixelCoords])

  // Redraw when dependencies change
  React.useEffect(() => {
    drawCanvas()
  }, [drawCanvas])

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (disabled) return
    const coords = getCanvasCoords(e.clientX, e.clientY)
    if (!coords) return

    const imgCoords = pixelToImageCoords(coords.x, coords.y)
    if (!imgCoords) return

    setIsDrawing(true)
    setStartX(imgCoords.x)
    setStartY(imgCoords.y)
    setPendingBox({
      x1: imgCoords.x,
      y1: imgCoords.y,
      x2: imgCoords.x,
      y2: imgCoords.y,
    })
  }

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing) return
    const coords = getCanvasCoords(e.clientX, e.clientY)
    if (!coords) return

    const imgCoords = pixelToImageCoords(coords.x, coords.y)
    if (!imgCoords) return

    setPendingBox({
      x1: Math.min(startX, imgCoords.x),
      y1: Math.min(startY, imgCoords.y),
      x2: Math.max(startX, imgCoords.x),
      y2: Math.max(startY, imgCoords.y),
    })
  }

  const handleCanvasMouseUp = () => {
    setIsDrawing(false)

    if (pendingBox) {
      const width = pendingBox.x2 - pendingBox.x1
      const height = pendingBox.y2 - pendingBox.y1
      const minSize = 10

      if (width > minSize && height > minSize) {
        // Show label input dialog
        setShowLabelInput(true)
        setLabelInput('')
        setSelectedSuggestion(null)
      }
      setPendingBox(null)
    }
  }

  const addBox = (box: { x1: number; y1: number; x2: number; y2: number }, label: string) => {
    const newBox: ManualBox = {
      id: makeBoxId(),
      ...box,
      label: label.trim() || 'unlabeled',
    }
    onBoxesChange([...boxes, newBox])
    setShowLabelInput(false)
    setLabelInput('')
    setSelectedSuggestion(null)
  }

  const handleConfirmLabel = () => {
    if (!pendingBox) return
    const label = selectedSuggestion || labelInput
    if (!label.trim()) return
    addBox(pendingBox, label)
  }

  const removeBox = (id: string) => {
    onBoxesChange(boxes.filter((b) => b.id !== id))
    setSelectedBoxId(null)
  }

  const updateBoxLabel = (id: string, label: string) => {
    onBoxesChange(
      boxes.map((b) => (b.id === id ? { ...b, label: label.trim() || 'unlabeled' } : b))
    )
  }

  const clearAll = () => {
    if (window.confirm('Clear all manually drawn boxes?')) {
      onBoxesChange([])
      setSelectedBoxId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-neutral-900">Manual annotation drawing</h3>
        <p className="text-sm text-neutral-500">
          Click and drag on the image to draw bounding boxes. Then assign a class label to each box.
        </p>
      </div>

      <div
        ref={containerRef}
        className="relative inline-block rounded-lg border border-neutral-300 bg-neutral-50 overflow-hidden shadow-sm"
      >
        <canvas
          ref={canvasRef}
          width={image.width > 1024 ? 1024 : image.width}
          height={image.height > 768 ? Math.round((768 / image.width) * image.height) : image.height}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
          className={`block ${!disabled ? 'cursor-crosshair' : 'cursor-not-allowed'}`}
          style={{ display: 'block' }}
        />
      </div>

      {showLabelInput && (
        <div className="rounded-xl border border-neutral-300 bg-white p-4 shadow-md">
          <p className="mb-3 text-sm font-medium text-neutral-700">Assign a class label to this box:</p>
          
          {suggestions.length > 0 && (
            <div className="mb-3">
              <p className="mb-2 text-xs font-semibold uppercase text-neutral-600">Suggestions:</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.slice(0, 8).map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => {
                      setSelectedSuggestion(suggestion)
                      addBox(pendingBox!, suggestion)
                    }}
                    className="rounded-full border border-neutral-300 bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-700 hover:border-neutral-400 hover:bg-neutral-100"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mb-3">
            <input
              type="text"
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirmLabel()
                if (e.key === 'Escape') setShowLabelInput(false)
              }}
              placeholder="Type or select from suggestions"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              autoFocus
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleConfirmLabel}
              disabled={!labelInput.trim() && !selectedSuggestion}
              className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Add box
            </button>
            <button
              type="button"
              onClick={() => setShowLabelInput(false)}
              className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 shadow transition hover:bg-neutral-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {boxes.length > 0 && (
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="font-medium text-neutral-900">
              {boxes.length} box{boxes.length !== 1 ? 'es' : ''}
            </h4>
            <button
              type="button"
              onClick={clearAll}
              className="text-xs font-medium text-rose-600 hover:text-rose-700"
            >
              Clear all
            </button>
          </div>

          <ul className="max-h-40 space-y-2 overflow-y-auto">
            {boxes.map((box) => (
              <li
                key={box.id}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  selectedBoxId === box.id
                    ? 'border-emerald-300 bg-emerald-50'
                    : 'border-neutral-200 bg-white'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedBoxId(box.id)}
                  className="flex-1 text-left font-medium text-neutral-700 hover:text-neutral-900"
                >
                  <input
                    type="text"
                    value={box.label}
                    onChange={(e) => updateBoxLabel(box.id, e.target.value)}
                    className="w-full rounded px-2 py-1 text-xs bg-white border border-neutral-200 focus:border-emerald-400 focus:outline-none"
                  />
                </button>
                <span className="text-xs text-neutral-500">
                  ({box.x2 - box.x1}×{box.y2 - box.y1})
                </span>
                <button
                  type="button"
                  onClick={() => removeBox(box.id)}
                  className="rounded px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {boxes.length > 0 && (
        <button
          type="button"
          onClick={() => onSaveClick?.(boxes)}
          disabled={disabled || isSaving || boxes.some((b) => !b.label.trim())}
          className="w-full rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white shadow transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? 'Saving...' : 'Save manual annotation'}
        </button>
      )}
    </div>
  )
}

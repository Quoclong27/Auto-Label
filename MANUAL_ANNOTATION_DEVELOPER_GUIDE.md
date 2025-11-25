# Manual Annotation Feature - Developer Guide

## Architecture Overview

### Frontend Flow
```
ProjectDetail (state management)
├── Mode: 'manual'
├── State: manualBoxes[], isManualSaving
├── Handler: handleSaveManualAnnotation()
└── Component: ManualDraw
    ├── Canvas drawing
    ├── Label assignment
    └── Box list management
        └── API call to /annotations/manual
            └── Response: annotation_id, proposals
                └── Update ProjectDetail state
                    └── Display in LabelReview
```

### Backend Flow
```
POST /annotations/manual
├── Validate image exists
├── Validate instances
├── Normalize bboxes
├── Create/update Annotation record
├── Return proposals
└── Frontend receives and displays
```

## Component Breakdown

### ManualDraw.tsx

**Key Props:**
```typescript
interface ManualDrawProps {
  image: { id, url, width, height, filename? }
  boxes: ManualBox[]
  onBoxesChange: (boxes) => void
  suggestions: string[]          // Label suggestions
  disabled?: boolean              // Disable during saving
  onSaveClick?: (boxes) => void  // Save handler
  isSaving?: boolean             // Show loading state
}
```

**Key Functions:**
- `getCanvasCoords()`: Client coords → canvas coords
- `pixelToImageCoords()`: Canvas coords → image pixel coords
- `imageToPixelCoords()`: Image pixel coords → canvas coords
- `drawCanvas()`: Render image + boxes to canvas
- `handleCanvasMouseDown/Move/Up()`: Drawing interaction
- `addBox()`: Create new box from drawing
- `handleConfirmLabel()`: Save label and add box
- `removeBox()`: Delete single box
- `updateBoxLabel()`: Edit box label
- `clearAll()`: Delete all boxes

**State Management:**
- `isDrawing`: Track drag state
- `startX/Y`: Drawing start point
- `pendingBox`: Current box being drawn
- `selectedBoxId`: Highlight selected box
- `showLabelInput`: Show/hide label dialog
- `labelInput`: User input for custom label
- `selectedSuggestion`: Currently highlighted suggestion

### ProjectDetail.tsx Integration

**New State:**
```typescript
const [manualBoxes, setManualBoxes] = useState<ManualBox[]>([])
const [isManualSaving, setIsManualSaving] = useState(false)
```

**New Handler:**
```typescript
const handleSaveManualAnnotation = async (boxes: ManualBox[]) => {
  // 1. Validate
  // 2. Format instances
  // 3. Call API
  // 4. Update state with response
  // 5. Show in LabelReview
}
```

**Mode Integration:**
- Added 'manual' to Mode type
- Added conditional rendering: `{mode === 'manual' && <ManualDraw />}`
- Reset manual boxes on image/mode change

## Backend Implementation

### Endpoint: POST /annotations/manual

**Request:**
```json
{
  "project_id": 1,
  "image_id": 42,
  "instances": [
    {
      "bbox": [100, 50, 200, 150],
      "class_name": "person",
      "confidence": 1.0
    }
  ],
  "annotation_id": null
}
```

**Response:**
```json
{
  "annotation_id": 123,
  "proposals": {
    "instances": [...],
    "manual_annotation": true
  },
  "message": "Manual annotation saved successfully"
}
```

**Database:**
- Creates new `Annotation` record or updates existing one
- Sets `proposals` JSON field with instances
- Sets `approved = False` for review phase
- Timestamp auto-updated

### Data Validation

```python
# Bbox normalization
x1, x2 = min(x1, x2), max(x1, x2)
y1, y2 = min(y1, y2), max(y1, y2)

# Ensure coordinates are integers
bbox = [int(v) for v in [x1, y1, x2, y2]]

# Check required fields
if not class_name or not class_name.strip():
    raise ValueError("class_name required")
```

## Extending the Feature

### Adding Undo/Redo

**Modify ManualDraw.tsx:**

```typescript
// Add state
const [undoStack, setUndoStack] = useState<ManualBox[][]>([])
const [redoStack, setRedoStack] = useState<ManualBox[][]>([])

// Modify onBoxesChange
const handleBoxesChange = (newBoxes) => {
  setUndoStack([...undoStack, boxes])
  setRedoStack([])
  onBoxesChange(newBoxes)
}

// Add undo handler
const handleUndo = () => {
  if (undoStack.length === 0) return
  const prev = undoStack[undoStack.length - 1]
  setRedoStack([...redoStack, boxes])
  setUndoStack(undoStack.slice(0, -1))
  onBoxesChange(prev)
}

// Add UI buttons
<button onClick={handleUndo} disabled={undoStack.length === 0}>
  Undo
</button>
```

### Adding Polygon Drawing

**Modify ManualDraw.tsx:**

```typescript
// Add polygon mode
const [polygonMode, setPolygonMode] = useState(false)
const [polygonPoints, setPolygonPoints] = useState<[number, number][]>([])

// Handle polygon clicks
const handleCanvasClick = (e) => {
  if (!polygonMode) return
  
  const coords = getCanvasCoords(e.clientX, e.clientY)
  const imgCoords = pixelToImageCoords(coords.x, coords.y)
  
  const newPoints = [...polygonPoints, [imgCoords.x, imgCoords.y]]
  setPolygonPoints(newPoints)
  
  // Double-click to close polygon
  if (e.detail === 2) {
    createPolygonBox(newPoints)
    setPolygonPoints([])
  }
}

// Convert polygon to bbox
const createPolygonBox = (points) => {
  const xs = points.map(p => p[0])
  const ys = points.map(p => p[1])
  const bbox = {
    x1: Math.min(...xs),
    y1: Math.min(...ys),
    x2: Math.max(...xs),
    y2: Math.max(...ys),
  }
  // Show label dialog...
}
```

### Adding Batch Operations

**Modify ManualDraw.tsx:**

```typescript
// Multi-select state
const [selectedBoxIds, setSelectedBoxIds] = useState<string[]>([])

// Batch label update
const handleBatchRename = (newLabel: string) => {
  onBoxesChange(
    boxes.map(b => 
      selectedBoxIds.includes(b.id)
        ? { ...b, label: newLabel }
        : b
    )
  )
  setSelectedBoxIds([])
}

// Batch delete
const handleBatchDelete = () => {
  onBoxesChange(boxes.filter(b => !selectedBoxIds.includes(b.id)))
  setSelectedBoxIds([])
}

// Add batch action buttons
<div>
  <button onClick={() => handleBatchRename('person')}>
    Set all to "person"
  </button>
  <button onClick={handleBatchDelete}>
    Delete selected ({selectedBoxIds.length})
  </button>
</div>
```

### Adding Box Constraints

**Modify ManualDraw.tsx:**

```typescript
// Minimum/maximum box size
const MIN_BOX_SIZE = 10
const MAX_BOX_SIZE = image.width // or some limit

const handleCanvasMouseUp = () => {
  if (!pendingBox) return
  
  const width = pendingBox.x2 - pendingBox.x1
  const height = pendingBox.y2 - pendingBox.y1
  
  if (width < MIN_BOX_SIZE || height < MIN_BOX_SIZE) {
    alert('Box too small. Minimum size: 10px')
    return
  }
  
  if (width > MAX_BOX_SIZE || height > MAX_BOX_SIZE) {
    alert('Box too large. Maximum size: ' + MAX_BOX_SIZE + 'px')
    return
  }
  
  showLabelDialog()
}
```

### Adding Keyboard Shortcuts

**Modify ManualDraw.tsx:**

```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowLabelInput(false)
    }
    if (e.key === 'z' && e.ctrlKey) {
      // Implement undo
    }
    if (e.key === 'y' && e.ctrlKey) {
      // Implement redo
    }
    if (e.key === 'd' && e.ctrlKey) {
      e.preventDefault()
      clearAll() // Delete all
    }
  }
  
  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [])
```

### Adding Grid Snapping

**Modify ManualDraw.tsx:**

```typescript
const GRID_SIZE = 10 // pixels
const [gridEnabled, setGridEnabled] = useState(false)

const snapToGrid = (value: number): number => {
  if (!gridEnabled) return value
  return Math.round(value / GRID_SIZE) * GRID_SIZE
}

// In getCanvasCoords or similar
const imgCoords = pixelToImageCoords(coords.x, coords.y)
if (gridCoords) {
  imgCoords.x = snapToGrid(imgCoords.x)
  imgCoords.y = snapToGrid(imgCoords.y)
}

// Add toggle UI
<input
  type="checkbox"
  checked={gridEnabled}
  onChange={(e) => setGridEnabled(e.target.checked)}
/>
<label>Snap to 10px grid</label>
```

### Adding Import/Export

**Frontend:**

```typescript
// Export boxes as JSON
const handleExport = () => {
  const json = JSON.stringify(manualBoxes, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `boxes-image-${selectedImage.id}.json`
  a.click()
}

// Import boxes from JSON
const handleImport = (file: File) => {
  const reader = new FileReader()
  reader.onload = (e) => {
    const json = JSON.parse(e.target?.result as string)
    onBoxesChange(json)
  }
  reader.readAsText(file)
}
```

## Testing

### Unit Tests (Recommended)

```typescript
// ManualDraw.test.tsx
describe('ManualDraw', () => {
  it('should create box on canvas drag', () => {
    // Simulate mouse events
    // Check box in state
  })
  
  it('should show label dialog after drawing', () => {
    // Draw box
    // Check dialog visible
  })
  
  it('should add label and create box', () => {
    // Draw and label
    // Check box in list
  })
  
  it('should delete box', () => {
    // Add box
    // Click remove
    // Check box removed
  })
})
```

### Integration Tests

```python
# test_manual_annotation.py
async def test_save_manual_annotation():
    # Create image
    # Call /annotations/manual
    # Check annotation created
    # Check proposals valid
    
async def test_merge_with_existing():
    # Run inference
    # Save manual boxes
    # Check both in response
```

## Performance Considerations

1. **Canvas rendering**: Optimize `drawCanvas()` for large box count
   - Consider virtualizing box list if > 100 boxes
   - Use requestAnimationFrame for smooth drawing

2. **Label suggestions**: Debounce autocomplete search
   ```typescript
   const debouncedSearch = useCallback(
     debounce((query) => {
       const filtered = suggestions.filter(s =>
         s.toLowerCase().includes(query.toLowerCase())
       )
       setFilteredSuggestions(filtered)
     }, 300),
     [suggestions]
   )
   ```

3. **API calls**: Batch save if multiple images marked for manual
   - Current: 1 image at a time
   - Future: Queue multiple saves, flush on interval

## Security

- **Input validation**: Backend validates all bboxes
- **SQL injection**: Using SQLAlchemy ORM (protected)
- **XSS**: React escapes all user input
- **CSRF**: Session middleware in place
- **Auth**: Image access checked against project ownership

## Debugging

### Enable verbose logging

**Frontend:**
```typescript
const DEBUG = true
if (DEBUG) console.log('ManualDraw state:', { manualBoxes, isDrawing, pendingBox })
```

**Backend:**
```python
import logging
logger = logging.getLogger(__name__)
logger.debug(f"Manual annotation: {payload}")
```

### Check canvas rendering

```typescript
const drawCanvas = useCallback(() => {
  console.time('drawCanvas')
  // ... drawing code ...
  console.timeEnd('drawCanvas')
}, [boxes, pendingBox, selectedBoxId, imageToPixelCoords])
```

### Inspect API calls

```typescript
const response = await api('/annotations/manual', {
  method: 'POST',
  body: JSON.stringify(payload),
})
console.log('API Response:', response)
```

---

For user guide, see **MANUAL_ANNOTATION_USER_GUIDE.md**
For feature overview, see **MANUAL_ANNOTATION_FEATURE.md**

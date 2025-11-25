# Manual Annotation Feature - Implementation Summary

## Overview
Added a "Manual Draw" mode for object detection that allows users to:
1. Draw bounding boxes manually on images using click-and-drag
2. Assign class labels to each box (with suggestions from previous labels)
3. Save annotations directly without running inference
4. Review and approve/reject manual annotations just like inference results
5. Export manual annotations along with auto-detected objects

## Changes Made

### Backend Changes

#### 1. **server/schemas.py** - Added new schemas
- `ManualAnnotationInstance`: Schema for individual manual boxes with bbox and class_name
- `ManualAnnotationSubmit`: Schema for submitting manual annotations with instance list

#### 2. **server/main.py** - Added new endpoint
- `POST /annotations/manual`: Endpoint to save manual annotations
  - Accepts project_id, image_id, instances (list of manual boxes)
  - Validates and normalizes bounding boxes
  - Creates or updates annotations in database
  - Returns annotation_id and proposals for immediate review

### Frontend Changes

#### 1. **client/src/components/ManualDraw.tsx** - New component
Features:
- Canvas-based drawing interface
- Click-and-drag to draw bounding boxes
- Real-time preview while drawing
- Label input dialog with autocomplete suggestions
- Box list with edit/delete capabilities
- Clear all button
- Save button to submit to backend

#### 2. **client/src/pages/ProjectDetail.tsx** - Modified main page
Changes:
- Added 'manual' to Mode type
- Added 'Manual Draw' to MODE_LABELS_BASE
- Added 'manual' to DETECTION_MODES (only for object detection, not segmentation)
- Added state: `manualBoxes`, `isManualSaving`
- Added `handleSaveManualAnnotation` function
- Added ManualDraw component to UI when mode === 'manual'
- Reset manual boxes on image/mode change

#### 3. **client/src/lib/api.ts** - No changes needed
(Already configured to handle POST requests with JSON body)

## Workflow

### For Users

1. **Select Image & Mode**
   - Choose "Manual Draw" from mode buttons

2. **Draw Boxes**
   - Click and drag on the image to draw bounding boxes
   - Each box appears with a dashed outline while drawing
   - Multiple boxes can be drawn one after another

3. **Label Boxes**
   - After drawing each box, a dialog appears to assign a label
   - Can select from suggested labels (from text prompts or history)
   - Or type a new custom label
   - Each label suggestion appears as a quick-select button

4. **Review Boxes**
   - All drawn boxes appear in a list below canvas
   - Can edit labels in-place
   - Can delete individual boxes
   - Can clear all boxes at once

5. **Save Annotation**
   - "Save manual annotation" button submits to backend
   - Backend creates/updates annotation in database
   - Results appear in the standard review interface
   - Can approve/reject just like auto-detected boxes

6. **Export**
   - Manual annotations are included in dataset export
   - Mixed with auto-detected boxes in final COCO/YOLO format

## Key Features

### Drawing Interface
- **Canvas-based**: Responsive to image dimensions
- **Visual feedback**: Color-coded boxes (red=new, green=selected)
- **Label overlay**: Shows class name on each box
- **Undo/Redo**: Not yet implemented (future enhancement)

### Label Management
- **Autocomplete**: Suggestions from:
  - Current text prompts
  - Previous manual labels
  - Prompt-based embeddings
- **Custom labels**: Can create new classes on-the-fly
- **Instance naming**: Auto-formatted as "classname_1", "classname_2", etc.

### Validation
- **Minimum box size**: Prevents accidental micro-boxes (< 10px)
- **Bbox normalization**: Ensures x1 < x2, y1 < y2
- **Required labels**: Each box must have a non-empty label

### Integration
- **Same review flow**: Uses existing LabelReview component
- **Editable names**: Can rename boxes during review
- **Full export support**: Compatible with COCO and YOLO formats
- **No model dependency**: Works independently from inference modes

## Technical Details

### Data Model
```javascript
ManualBox {
  id: string,           // Unique ID for UI tracking
  x1: number,           // Pixel coordinates
  y1: number,
  x2: number,
  y2: number,
  label: string         // Class name
}
```

### Proposal Structure
Manual annotations create proposals with:
- `instances`: Array of detected objects
- `manual_annotation: true`: Flag indicating source
- `prompt_labels`: Empty array
- `prompt_embeddings`: Empty array

### Canvas Scaling
- Maintains aspect ratio
- Scales to max 1024x768 for display
- Automatically converts pixel coords to image coords
- No image manipulation (non-destructive)

## Future Enhancements

1. **Polygon/Freehand Drawing**: Instead of just boxes
2. **Undo/Redo**: Within drawing session
3. **Keyboard Shortcuts**: For faster annotation
4. **Multi-select**: Select multiple boxes for batch operations
5. **Snap to Grid**: Optional grid snapping for alignment
6. **Batch Operations**: Copy label across multiple boxes
7. **Auto-grouping**: Group similar-looking boxes by color
8. **Annotation Templates**: Pre-defined box sets for similar images

## File Locations
- **Backend**: `/server/main.py`, `/server/schemas.py`
- **Frontend**: `/client/src/pages/ProjectDetail.tsx`, `/client/src/components/ManualDraw.tsx`

## Testing Checklist
- [ ] Can draw boxes on image
- [ ] Can assign labels to boxes
- [ ] Suggestions appear correctly
- [ ] Can edit box labels
- [ ] Can delete individual boxes
- [ ] Can clear all boxes
- [ ] Save button is disabled when no boxes
- [ ] Save button is disabled with unlabeled boxes
- [ ] Manual annotation appears in review
- [ ] Can approve/reject manual annotations
- [ ] Manual annotations export correctly
- [ ] Mode resets on image change
- [ ] Manual boxes clear on mode change

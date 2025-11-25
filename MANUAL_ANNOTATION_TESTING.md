# Manual Annotation Feature - Testing Checklist

## Pre-Deployment Testing

### Frontend Component Tests

#### ManualDraw Component
- [ ] **Rendering**
  - [ ] Component renders when `mode === 'manual'`
  - [ ] Canvas element visible and clickable
  - [ ] Image loads in canvas
  - [ ] All UI elements present (mode buttons, save button, etc.)

- [ ] **Drawing**
  - [ ] Can click and drag to draw box
  - [ ] Dashed yellow outline appears while dragging
  - [ ] Multiple boxes can be drawn sequentially
  - [ ] Minimum size validation (< 10px blocked)
  - [ ] Box coordinates are correct (in image pixels)

- [ ] **Labeling**
  - [ ] Label dialog appears after drawing box
  - [ ] Can type custom label
  - [ ] Suggestions appear from:
    - [ ] Text prompts
    - [ ] Previous labels
    - [ ] Prompt embeddings
  - [ ] Can click suggestion to auto-select
  - [ ] Enter key confirms label
  - [ ] Escape key cancels box

- [ ] **Box List Management**
  - [ ] All boxes appear in list below canvas
  - [ ] Box coordinates shown correctly
  - [ ] Can edit labels in list
  - [ ] Can delete individual boxes
  - [ ] Can delete all boxes with confirmation
  - [ ] Save button disabled when no boxes
  - [ ] Save button disabled when boxes unlabeled
  - [ ] Save button enabled only when valid

- [ ] **State Management**
  - [ ] Boxes clear on mode change to non-manual
  - [ ] Boxes clear on image selection change
  - [ ] Boxes persist while editing labels
  - [ ] Can draw after editing labels

#### ProjectDetail Integration
- [ ] **Mode Selection**
  - [ ] "Manual Draw" appears in mode buttons
  - [ ] Only appears for object_detection projects (not segmentation)
  - [ ] Clicking mode switches to manual mode
  - [ ] Other modes still work (text, visualBox, visualMask, promptFree)

- [ ] **State Reset**
  - [ ] Manual boxes clear on image change
  - [ ] Manual boxes clear on mode change away from manual
  - [ ] Manual boxes preserve when editing existing annotations

- [ ] **Save Handler**
  - [ ] `handleSaveManualAnnotation` called on save button
  - [ ] Shows loading state ("Saving...")
  - [ ] Success message displayed
  - [ ] Boxes appear in review interface
  - [ ] Can approve/reject after save

#### UI Integration
- [ ] **Responsive**
  - [ ] Works on different screen sizes
  - [ ] Canvas scales appropriately
  - [ ] Touch events work on mobile (if supported)
  - [ ] No layout shifts or overflow

- [ ] **Accessibility**
  - [ ] Labels are descriptive
  - [ ] Buttons are keyboard accessible
  - [ ] Focus states visible
  - [ ] No console errors

### Backend API Tests

#### Endpoint: POST /annotations/manual

- [ ] **Request Validation**
  - [ ] Rejects if project_id missing
  - [ ] Rejects if image_id missing
  - [ ] Rejects if instances missing
  - [ ] Rejects if instances empty
  - [ ] Rejects if bbox not [x1, y1, x2, y2]
  - [ ] Rejects if class_name missing/empty
  - [ ] Accepts annotation_id for updates

- [ ] **Data Processing**
  - [ ] Validates image exists in project
  - [ ] Validates image ownership
  - [ ] Normalizes bbox (x1 < x2, y1 < y2)
  - [ ] Converts coordinates to integers
  - [ ] Strips whitespace from class_name
  - [ ] Creates instance_name format "classname_1"

- [ ] **Database Operations**
  - [ ] Creates new Annotation record on first save
  - [ ] Updates existing Annotation on subsequent save
  - [ ] Sets `approved = False`
  - [ ] Stores proposals as JSON
  - [ ] Timestamp updated correctly
  - [ ] Manual flag set in proposals

- [ ] **Response**
  - [ ] Returns annotation_id
  - [ ] Returns proposals dict with instances
  - [ ] Proposals include all manual boxes
  - [ ] Response structure matches frontend expectations

#### Error Handling
- [ ] **HTTP 404**
  - [ ] Returns when image not found
  - [ ] Returns when annotation not found (for update)

- [ ] **HTTP 400**
  - [ ] Invalid bbox format
  - [ ] Missing required fields
  - [ ] Empty class_name

- [ ] **HTTP 401/403**
  - [ ] Requires authentication
  - [ ] Checks project ownership

### Integration Tests

#### Manual + Auto-detected Workflow
- [ ] **Create auto-annotation first**
  - [ ] Run text prompt inference
  - [ ] Get proposals with instances
  - [ ] Annotation saved to database

- [ ] **Add manual boxes**
  - [ ] Switch to manual draw mode
  - [ ] Draw boxes for additional objects
  - [ ] Save manual boxes
  - [ ] Check that annotation_id changed

- [ ] **Merge in review**
  - [ ] All boxes (auto + manual) appear in review
  - [ ] Can toggle each box independently
  - [ ] Can rename mixed boxes
  - [ ] Approve button saves all

#### Export Integration
- [ ] **COCO Format**
  - [ ] Manual boxes included in COCO export
  - [ ] Correct format and coordinates
  - [ ] Class IDs assigned correctly

- [ ] **YOLO Format**
  - [ ] Manual boxes included in YOLO export
  - [ ] Normalized coordinates correct
  - [ ] Classes file includes manual labels

#### Dataset Split
- [ ] **Train/Val/Test**
  - [ ] Manual boxes distributed in splits
  - [ ] No data leakage between splits
  - [ ] Correct number of images per split

### Edge Cases

- [ ] **Boundary Conditions**
  - [ ] Box at image edge (0, 0, w, h)
  - [ ] Very small box (10x10 minimum)
  - [ ] Very large box (entire image)
  - [ ] Single pixel wide/tall box (should fail)

- [ ] **Label Edge Cases**
  - [ ] Very long class names (500+ chars)
  - [ ] Unicode characters in labels (测试, العربية, etc.)
  - [ ] Numbers only as label
  - [ ] Special characters in label

- [ ] **Concurrent Operations**
  - [ ] Save while another save in progress (should queue)
  - [ ] Mode switch during save (should cancel gracefully)
  - [ ] Image selection change during save (should handle)

- [ ] **Empty/Null Cases**
  - [ ] Empty boxes array (should fail)
  - [ ] Null image_id (should reject)
  - [ ] Undefined proposal fields (should fill defaults)

### Performance Tests

- [ ] **Large Annotations**
  - [ ] 100+ boxes draw smoothly
  - [ ] No significant lag on canvas
  - [ ] Save time < 2 seconds
  - [ ] Review load time < 1 second

- [ ] **Memory**
  - [ ] No memory leaks during drawing
  - [ ] Canvas cleanup on unmount
  - [ ] Event listeners removed properly

- [ ] **Network**
  - [ ] Save works on slow network (simulated)
  - [ ] Timeout handling if server slow
  - [ ] Error messages clear

### Browser Compatibility

- [ ] **Chrome/Edge (Chromium)**
  - [ ] Tested on latest version
  - [ ] Canvas rendering works
  - [ ] Input events fire correctly

- [ ] **Firefox**
  - [ ] Same functionality
  - [ ] CSS styling consistent

- [ ] **Safari**
  - [ ] No Safari-specific bugs
  - [ ] Canvas works same as Chrome

- [ ] **Mobile (if supported)**
  - [ ] Touch drawing works
  - [ ] Scaling correct on different DPI
  - [ ] Keyboard input works (physical keyboard)

### Documentation Tests

- [ ] **Code Comments**
  - [ ] Functions documented
  - [ ] Complex logic explained
  - [ ] Props documented

- [ ] **Type Definitions**
  - [ ] All interfaces defined
  - [ ] No `any` types (except where necessary)
  - [ ] Optional fields marked

- [ ] **README/Guide**
  - [ ] User guide is clear
  - [ ] Examples provided
  - [ ] Troubleshooting section helps

## Test Data

### Sample Test Images
```
- small.jpg: 200x200 - for edge cases
- normal.jpg: 800x600 - standard size  
- large.jpg: 4000x3000 - high resolution
- wide.jpg: 2000x400 - landscape
- tall.jpg: 400x2000 - portrait
```

### Sample Labels
```
- person
- car
- dog
- face
- hand
- custom_label_123
- 测试
```

### Sample Coordinates
```
- Top-left: (10, 10, 100, 100)
- Bottom-right: (900, 700, 950, 750)
- Full image: (0, 0, 800, 600)
- Tiny: (100, 100, 110, 110)
- Edge: (0, 0, 1, 1)
```

## Regression Tests

Make sure existing features still work:
- [ ] Text prompt inference still works
- [ ] Box prompt inference still works
- [ ] Mask prompt inference still works
- [ ] Prompt-free inference still works
- [ ] Review and approve still works
- [ ] Export COCO format still works
- [ ] Export YOLO format still works
- [ ] User authentication still works
- [ ] Project creation still works
- [ ] Image upload still works

## Performance Benchmarks

Record baseline metrics:
- [ ] Canvas rendering time: ___ms
- [ ] Save API response time: ___ms
- [ ] Label input lag: ___ms
- [ ] Box list scroll smoothness: ___fps
- [ ] Memory usage with 100 boxes: ___MB

## Sign-off

- [ ] All tests passed
- [ ] No known issues remaining
- [ ] Code reviewed
- [ ] Documentation complete
- [ ] Ready for production deployment

**Tested By:** ___________________
**Date:** ___________________
**Version:** ___________________

## Known Limitations (Document for future)

- [ ] Undo/Redo not implemented (future feature)
- [ ] Polygon drawing not supported (only boxes)
- [ ] No batch operations (planned)
- [ ] No keyboard shortcuts beyond Enter/Escape (planned)
- [ ] No snap-to-grid (planned)

## Future Enhancements

- [ ] Polygon drawing tool
- [ ] Undo/Redo with history
- [ ] Keyboard shortcuts (A=add, D=delete, etc.)
- [ ] Snap to grid option
- [ ] Import/export annotations as JSON
- [ ] Copy label across multiple boxes
- [ ] Color coding by class
- [ ] Zoom and pan on canvas
- [ ] Annotation templates

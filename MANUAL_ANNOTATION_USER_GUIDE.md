# Manual Annotation Guide

## Quick Start

### Step 1: Select "Manual Draw" Mode
Click the **"Manual Draw"** button in the mode selector at the top of the inference panel.

### Step 2: Draw Bounding Boxes
1. **Click and drag** on the image to draw a box
2. A **dashed yellow outline** appears while you're drawing
3. Release to finalize the box
4. When you release, a label dialog appears

### Step 3: Assign Labels
- **Select from suggestions**: Click any suggested label to add it quickly
- **Type custom label**: Type in the input field for a new class
- **Press Enter or click "Add box"** to confirm and add the box
- **Press Escape or click "Cancel"** to discard the box

### Step 4: Review Your Boxes
All boxes appear in the **"Boxes"** section below the canvas:
- **Edit label**: Click the label field to rename it
- **Delete box**: Click "Remove" to delete just that box  
- **Clear all**: Click "Clear all" to start over

### Step 5: Save Annotation
- Click **"Save manual annotation"** button
- The system creates an annotation record
- Your boxes appear in the **"Review detections"** section

### Step 6: Approve & Export
- Review the boxes (same as auto-detected boxes)
- **Toggle checkboxes** to keep/remove boxes
- Click **"Approve"** to confirm and save
- Export your labeled dataset in COCO or YOLO format

## Tips & Tricks

### Faster Labeling
- Use **text prompts** to populate suggestions (e.g., "person, car, dog")
- Labels from previous images appear in suggestions
- Click a suggestion instead of typing

### Organizing Labels
- Keep class names **consistent** across all boxes
- Use **snake_case** or **lowercase** for better export compatibility
- Avoid special characters in class names

### Correcting Mistakes
- **Edit a box**: Click the label field to rename it
- **Delete a box**: Click "Remove" next to the box
- **Redraw**: Click "Clear all" and start over
- **No permanent changes**: Can edit boxes until you approve

### Mixed Annotations
- **Combine methods**: Run inference, then use Manual Draw for missed objects
- **Add to existing**: Save manual boxes and they merge with auto-detected
- **Same review flow**: All boxes treated equally in the approval process

## Common Tasks

### Adding Missing Objects
1. Run auto-detection first (Text/Box/Prompt-free mode)
2. If objects are missed, switch to "Manual Draw" 
3. Draw boxes for missed objects
4. Save - boxes are added to the annotation
5. Approve the complete set

### Correcting Misclassified Objects
1. After auto-detection, note misclassifications
2. During review, edit the class_name of incorrect boxes
3. Approve with corrections
4. Misclassified boxes now have correct labels

### Starting From Scratch
1. Select "Manual Draw" mode
2. Draw all objects manually
3. Save and approve
4. Export for training

### Splitting Complex Scenes
1. Run auto-detection to see what was found
2. Use Manual Draw to add:
   - Occluded/hidden objects
   - Small objects the model missed  
   - Objects in challenging lighting
3. Merge and export everything

## Best Practices

✅ **DO**
- Be consistent with class naming
- Use lowercase or snake_case
- Label all visible objects
- Review before approving
- Save after drawing each image

❌ **DON'T**
- Use special characters in labels
- Create new classes accidentally (typos)
- Skip reviewing boxes
- Mix different naming conventions
- Leave boxes unlabeled

## Keyboard Shortcuts
- **Enter**: Confirm label and add box
- **Escape**: Cancel label dialog
- No other shortcuts implemented yet (planned for future)

## Troubleshooting

**Q: Save button is disabled**
- A: Check that all boxes have labels (no "Unlabeled" boxes)
- A: Make sure you have at least one box

**Q: Boxes don't appear**
- A: Refresh the page
- A: Try drawing again more carefully

**Q: Label suggestions not showing**
- A: Add text prompts first (they become suggestions)
- A: Check previous manual labels (also appear as suggestions)

**Q: Can't edit a box label**
- A: Box labels are editable in the list below canvas
- A: Or edit during review phase (class_name field)

**Q: How to undo a box**
- A: Click "Remove" next to the box in the list
- A: Or click "Clear all" to restart

## Integration with Export

Your manual annotations:
- ✅ Are included in COCO format export
- ✅ Are included in YOLO format export  
- ✅ Maintain class names and coordinates
- ✅ Can be mixed with auto-detected objects
- ✅ Are included in train/val/test splits

## Example Workflow

```
1. Upload images to project
2. Run "Text Prompt" inference with "person, car, dog"
3. Review auto-detected boxes
4. Spot 2 missed dogs in a crowd
5. Switch to "Manual Draw"
6. Draw 2 boxes for missed dogs, label them "dog"
7. Save manual boxes
8. Merge with previous annotation
9. Approve complete set
10. Export dataset with all boxes
```

---

For technical details, see the **MANUAL_ANNOTATION_FEATURE.md** documentation.

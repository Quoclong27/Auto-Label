from pydantic import BaseModel, Field, validator
from typing import Dict, List, Optional, Literal

class UserOut(BaseModel):
    id: int
    email: str
    name: Optional[str]
    picture: Optional[str]
    is_admin: bool
    class Config:
        from_attributes = True

class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1)
    description: Optional[str] = Field(None, max_length=1024)
    project_type: Literal[
        "object_detection",
        "classification",
        "instance_segmentation",
        "keypoint_detection",
        "multimodal",
    ] = "object_detection"
    publish_level: Literal["private", "public"] = "private"


class ProjectOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    project_type: Literal[
        "object_detection",
        "classification",
        "instance_segmentation",
        "keypoint_detection",
        "multimodal",
    ]
    publish_level: Literal["private", "public"]
    created_at: Optional[str]
    owner_email: Optional[str] = None
    image_count: Optional[int] = None
    annotation_count: Optional[int] = None
    thumbnail_url: Optional[str] = None

    class Config:
        from_attributes = True

class ProjectUpdate(BaseModel):
    """Schema for updating project fields (name, description, publish_level, etc)"""
    name: Optional[str] = Field(None, min_length=1)
    description: Optional[str] = Field(None, max_length=1024)
    project_type: Optional[Literal[
        "object_detection",
        "classification",
        "instance_segmentation",
        "keypoint_detection",
        "multimodal",
    ]] = None
    publish_level: Optional[Literal["private", "public"]] = None

class CollaboratorOut(BaseModel):
    user_id: int
    email: str
    name: Optional[str]
    picture: Optional[str]
    role: str
    created_at: Optional[str]

class ShareProjectRequest(BaseModel):
    email: str = Field(..., description="Email of user to share with")
    role: Literal["viewer", "editor", "admin"] = "viewer"

class BBox(BaseModel):
    x1: int
    y1: int
    x2: int
    y2: int

    @classmethod
    def __get_validators__(cls):
        yield cls._coerce_any
        yield from super().__get_validators__()

    @classmethod
    def _coerce_any(cls, value):
        if isinstance(value, cls):
            return value
        if isinstance(value, dict):
            return cls(**value)
        if isinstance(value, (list, tuple)) and len(value) == 4:
            x1, y1, x2, y2 = value
            return cls(x1=int(x1), y1=int(y1), x2=int(x2), y2=int(y2))
        raise TypeError("Bounding box must be a dict or a sequence of four values")

class InferenceParamsText(BaseModel):
    project_id: int
    image_id: int
    texts: List[str]
    model_id: str = "yoloe-v8l"
    image_size: int = 640
    conf: float = 0.25
    iou: float = 0.7

class InferenceParamsBoxes(BaseModel):
    project_id: int
    image_id: int
    boxes: List[BBox]
    cross_image_url: Optional[str] = None
    model_id: str = "yoloe-v8l"
    image_size: int = 640
    conf: float = 0.25
    iou: float = 0.7

    @validator("boxes", pre=True)
    def _coerce_boxes(cls, value):
        if value is None:
            return []
        converted: List[dict] = []
        for item in value:
            if isinstance(item, BBox):
                converted.append(item.dict())
            elif isinstance(item, dict):
                converted.append(item)
            elif isinstance(item, (list, tuple)) and len(item) == 4:
                x1, y1, x2, y2 = item
                converted.append({
                    "x1": int(x1),
                    "y1": int(y1),
                    "x2": int(x2),
                    "y2": int(y2),
                })
            else:
                raise ValueError("Each box must be a dict or a sequence of four values [x1, y1, x2, y2]")
        return converted

class InferenceParamsPromptFree(BaseModel):
    project_id: int
    image_id: int
    vocab: List[str]
    model_id: str = "yoloe-v8l"
    image_size: int = 640
    conf: float = 0.25
    iou: float = 0.7

class InferenceParamsVisual(BaseModel):
    project_id: int
    image_id: int
    prompt_type: Literal["bboxes", "masks"]
    boxes: Optional[List[BBox]] = None
    mask_base64: Optional[str] = None
    target_image_id: Optional[int] = None
    model_id: str = "yoloe-v8l"
    image_size: int = 640
    conf: float = 0.25
    iou: float = 0.7
    labels: Optional[List[str]] = None
    embeddings: Optional[List[List[Optional[float]]]] = None
    capture_embeddings: bool = True
    detect_self_image: bool = True

    @validator("boxes", pre=True, always=True, check_fields=False)
    def _coerce_visual_boxes(cls, value):
        if value is None:
            return value
        converted: List[dict] = []
        for item in value:
            if isinstance(item, BBox):
                converted.append(item.dict())
            elif isinstance(item, dict):
                converted.append(item)
            elif isinstance(item, (list, tuple)) and len(item) == 4:
                x1, y1, x2, y2 = item
                converted.append({
                    "x1": int(x1),
                    "y1": int(y1),
                    "x2": int(x2),
                    "y2": int(y2),
                })
            else:
                raise ValueError("Each visual prompt box must be a dict or a sequence of four values [x1, y1, x2, y2]")
        return converted


class Sam2PointPrompt(BaseModel):
    x: float
    y: float
    positive: bool = True


class Sam2BoxPrompt(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float


class Sam2InferenceParams(BaseModel):
    project_id: int
    image_id: int
    prompt_type: Literal["text", "box", "point", "mask"]
    text: Optional[str] = None
    boxes: Optional[List[Sam2BoxPrompt]] = None
    points: Optional[List[Sam2PointPrompt]] = None
    labels: Optional[List[str]] = None
    mask_base64: Optional[str] = None
    model_id: str = "sam2_t"
    threshold: float = 0.5
    multimask_output: bool = False
    save_masks: bool = False
    text_box_threshold: float = 0.35
    text_threshold: float = 0.25


class Sam2BatchParams(BaseModel):
    project_id: int
    image_ids: List[int]
    prompt_type: Literal["text", "box", "point", "mask"]
    text: Optional[str] = None
    boxes: Optional[List[Sam2BoxPrompt]] = None
    points: Optional[List[Sam2PointPrompt]] = None
    labels: Optional[List[str]] = None
    mask_base64: Optional[str] = None
    model_id: str = "sam2_t"
    threshold: float = 0.5
    save_masks: bool = False
    augmentations: Optional[List[Literal["flip_horizontal", "flip_vertical", "rotate90"]]] = None
    num_workers: int = 2


class Sam2VideoParams(BaseModel):
    prompt_type: Literal["text", "box", "point", "mask"]
    text: Optional[str] = None
    boxes: Optional[List[Sam2BoxPrompt]] = None
    points: Optional[List[Sam2PointPrompt]] = None
    labels: Optional[List[str]] = None
    mask_base64: Optional[str] = None
    model_id: str = "sam2_t"
    threshold: float = 0.5
    save_masks: bool = False
    video_path: str
    frame_stride: int = 1
    max_frames: Optional[int] = None


class Sam2EvalParams(BaseModel):
    predictions: Dict
    ground_truth: Dict


class DetectionInstanceUpdate(BaseModel):
    bbox: List[int]
    confidence: float
    class_name: str
    embedding: Optional[List[Optional[float]]] = None

    @validator("bbox")
    def bbox_length(cls, value: List[int]) -> List[int]:
        if len(value) != 4:
            raise ValueError("Bounding box must contain four values [x1, y1, x2, y2]")
        return [int(v) for v in value]

    @validator("embedding")
    def validate_embedding(cls, value: Optional[List[Optional[float]]]) -> Optional[List[float]]:
        if value is None:
            return value
        cleaned = []
        for item in value:
            if item is None:
                continue
            cleaned.append(float(item))
        return cleaned or None

class ReviewDecision(BaseModel):
    annotation_id: int
    approve: bool
    keep_indices: Optional[List[int]] = None
    instances: Optional[List[DetectionInstanceUpdate]] = None


class SplitRatios(BaseModel):
    train: float = 0.8
    val: float = 0.1
    test: float = 0.1

    @validator("train", "val", "test")
    def non_negative(cls, value: float) -> float:
        if value < 0:
            raise ValueError("Split ratios must be non-negative")
        return value


class DatasetExportRequest(BaseModel):
    project_id: int
    format: Literal["coco", "yolo"]
    split: SplitRatios


class ManualAnnotationInstance(BaseModel):
    bbox: List[int]  # [x1, y1, x2, y2]
    class_name: str
    confidence: float = 1.0  # Manual annotations have high confidence by default


class ManualAnnotationSubmit(BaseModel):
    project_id: int
    image_id: int
    instances: List[ManualAnnotationInstance]
    annotation_id: Optional[int] = None  # If updating existing annotation

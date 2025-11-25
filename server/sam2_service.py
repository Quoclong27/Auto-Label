import base64
import concurrent.futures
import copy
import io
import json
import math
import os
import shutil
import tempfile
from pathlib import Path
from typing import Dict, Iterable, List, Literal, Optional, Sequence, Tuple

import cv2
import numpy as np
import requests
import torch
from PIL import Image
from groundingdino.util.inference import Model as GroundingDINOModel
from huggingface_hub import hf_hub_download
from pycocotools import mask as mask_utils
from shapely.geometry import Polygon
from shapely.ops import unary_union
from ultralytics import SAM

from .cloudinary_service import resolve_asset_path

_DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

_SAM2_REGISTRY = {
    "sam2_t": "sam2_t.pt",
    "sam2_s": "sam2_s.pt",
    "sam2_b": "sam2_b.pt",
    "sam2_l": "sam2_l.pt",
    "sam2.1_t": "sam2.1_t.pt",
    "sam2.1_s": "sam2.1_s.pt",
    "sam2.1_b": "sam2.1_b.pt",
    "sam2.1_l": "sam2.1_l.pt",
}

_SAM2_REPO = os.getenv("SAM2_HF_REPO", "ultralytics/sam")
_GROUNDING_CONFIG = os.getenv("GROUNDING_DINO_CONFIG", "GroundingDINO_SwinT_OGC.py")
_GROUNDING_WEIGHTS = os.getenv("GROUNDING_DINO_WEIGHTS", "groundingdino_swint_ogc.pth")
_GROUNDING_REPO = os.getenv("GROUNDING_DINO_HF_REPO", "ShilongLiu/GroundingDINO")
_GROUNDING_DIR = os.getenv("GROUNDING_DINO_DIR")

_MODEL_CACHE: Dict[str, SAM] = {}
_GROUNDING_CACHE: Optional[GroundingDINOModel] = None


def _download_weight(repo: str, filename: str) -> str:
    return hf_hub_download(repo_id=repo, filename=filename)


def _resolve_sam_weight(model_id: str) -> str:
    path_candidate = Path(model_id)
    if path_candidate.is_file():
        return str(path_candidate.resolve())

    normalized_key = model_id.lower().replace("sam2_", "sam2").replace("sam2.", "sam2.")
    candidates = {Path(model_id).name}
    if not Path(model_id).suffix:
        candidates.add(f"{model_id}.pt")
    if normalized_key in _SAM2_REGISTRY:
        candidates.add(_SAM2_REGISTRY[normalized_key])

    hints = []
    env_dirs = os.getenv("SAM2_WEIGHTS_DIR")
    if env_dirs:
        hints.extend(Path(part.strip()) for part in env_dirs.split(os.pathsep) if part.strip())
    project_root = Path(__file__).resolve().parent.parent
    hints.extend([
        Path.cwd(),
        project_root / "server" / "models",
    ])

    for base in hints:
        if not base or not base.exists():
            continue
        for name in candidates:
            if not name:
                continue
            candidate = base / name
            if candidate.exists():
                return str(candidate.resolve())

    if normalized_key in _SAM2_REGISTRY:
        filename = _SAM2_REGISTRY[normalized_key]
        return _download_weight(_SAM2_REPO, filename)
    raise FileNotFoundError(
        f"Unable to resolve SAM2 weights for '{model_id}'. "
        "Place the .pt file in the project root/yoloe folder or set SAM2_WEIGHTS_DIR."
    )


def _get_sam_model(model_id: str) -> SAM:
    path = _resolve_sam_weight(model_id)
    if path not in _MODEL_CACHE:
        model = SAM(path)
        model.to(_DEVICE)
        _MODEL_CACHE[path] = model
    return _MODEL_CACHE[path]


def _resolve_grounding_asset(filename: str) -> str:
    candidates = [filename]
    base_hints: List[Path] = []
    if _GROUNDING_DIR:
        base_hints.extend(Path(part.strip()) for part in _GROUNDING_DIR.split(os.pathsep) if part.strip())
    project_root = Path(__file__).resolve().parent.parent
    base_hints.extend([
        Path.cwd(),
        project_root,
        project_root / "server",
        project_root / "server" / "models",
        project_root / "weights",
    ])
    for base in base_hints:
        if not base.exists():
            continue
        for name in candidates:
            candidate = base / name
            if candidate.exists():
                return str(candidate.resolve())
    return _download_weight(_GROUNDING_REPO, filename)


def _get_grounding_model() -> GroundingDINOModel:
    global _GROUNDING_CACHE
    if _GROUNDING_CACHE is not None:
        return _GROUNDING_CACHE
    config_path = Path(_resolve_grounding_asset(_GROUNDING_CONFIG))
    weight_path = Path(_resolve_grounding_asset(_GROUNDING_WEIGHTS))
    _GROUNDING_CACHE = GroundingDINOModel(
        model_config_path=str(config_path),
        model_checkpoint_path=str(weight_path),
        device=_DEVICE,
    )
    return _GROUNDING_CACHE


def _pil_from_url(url: str) -> Image.Image:
    local_path = resolve_asset_path(url)
    if local_path and Path(local_path).exists():
        return Image.open(local_path).convert("RGB")
    if Path(url).exists():
        return Image.open(url).convert("RGB")
    response = requests.get(url, timeout=60)
    response.raise_for_status()
    return Image.open(io.BytesIO(response.content)).convert("RGB")


def _mask_to_polygon(mask: np.ndarray, tolerance: float = 2.0) -> List[List[float]]:
    mask_uint8 = mask.astype(np.uint8)
    contours, _ = cv2.findContours(mask_uint8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    polygons: List[List[float]] = []
    for contour in contours:
        if len(contour) < 3:
            continue
        epsilon = tolerance
        approx = cv2.approxPolyDP(contour, epsilon, True).reshape(-1, 2)
        if len(approx) < 3:
            continue
        polygons.append(approx.flatten().astype(float).tolist())
    return polygons


def _mask_to_bbox(mask: np.ndarray) -> List[int]:
    ys, xs = np.where(mask > 0)
    if len(xs) == 0 or len(ys) == 0:
        return [0, 0, 0, 0]
    x1 = int(xs.min())
    y1 = int(ys.min())
    x2 = int(xs.max())
    y2 = int(ys.max())
    return [x1, y1, x2, y2]


def _mask_to_rle(mask: np.ndarray) -> Dict:
    rle = mask_utils.encode(np.asfortranarray(mask.astype(np.uint8)))
    rle["counts"] = rle["counts"].decode("ascii")
    return rle


def _area_from_mask(mask: np.ndarray) -> int:
    return int(mask.astype(np.uint8).sum())


def _decode_mask_from_base64(mask_base64: str, size: Tuple[int, int]) -> np.ndarray:
    if "," in mask_base64:
        mask_base64 = mask_base64.split(",", 1)[1]
    data = base64.b64decode(mask_base64)
    image = Image.open(io.BytesIO(data)).convert("L")
    if image.size != size:
        image = image.resize(size, Image.NEAREST)
    mask = np.array(image, dtype=np.uint8)
    return (mask > 0).astype(np.uint8)


def _assess_image_quality(image_np: np.ndarray) -> Tuple[bool, Dict[str, float]]:
    gray = cv2.cvtColor(image_np, cv2.COLOR_RGB2GRAY)
    mean = float(gray.mean())
    std = float(gray.std())
    low_quality = mean < 30.0 or std < 20.0
    return low_quality, {"mean_intensity": mean, "std_intensity": std}


def _flag_overlaps(masks: List[np.ndarray], overlap_threshold: float = 0.8) -> List[bool]:
    n = len(masks)
    flags = [False] * n
    for i in range(n):
        mask_i = masks[i]
        area_i = mask_i.sum()
        if area_i == 0:
            continue
        for j in range(i + 1, n):
            mask_j = masks[j]
            inter = np.logical_and(mask_i, mask_j).sum()
            if inter == 0:
                continue
            union = np.logical_or(mask_i, mask_j).sum()
            if union == 0:
                continue
            iou = inter / union
            if iou >= overlap_threshold:
                flags[i] = True
                flags[j] = True
    return flags


def _text_to_boxes(image_np: np.ndarray, caption: str, box_threshold: float, text_threshold: float) -> Tuple[np.ndarray, List[str], np.ndarray]:
    model = _get_grounding_model()
    detections, phrases = model.predict_with_caption(
        image=image_np,
        caption=caption,
        box_threshold=box_threshold,
        text_threshold=text_threshold,
    )
    if detections is None or len(detections) == 0:
        return np.zeros((0, 4), dtype=np.float32), [], np.zeros((0,), dtype=np.float32)
    boxes = detections.xyxy.astype(np.float32)
    scores = detections.confidence.astype(np.float32)
    return boxes, phrases, scores


def _prepare_point_arrays(points: Sequence[Dict[str, float]], width: int, height: int) -> Tuple[np.ndarray, np.ndarray]:
    pts = []
    labels = []
    for pt in points:
        x = float(pt.get("x", 0))
        y = float(pt.get("y", 0))
        label = 1 if pt.get("positive", True) else 0
        x = min(max(x, 0.0), width - 1)
        y = min(max(y, 0.0), height - 1)
        pts.append([x, y])
        labels.append(label)
    if not pts:
        return np.zeros((0, 2), dtype=np.float32), np.zeros((0,), dtype=np.int64)
    return np.asarray(pts, dtype=np.float32), np.asarray(labels, dtype=np.int64)


def _prepare_boxes(boxes: Sequence[Sequence[float]]) -> np.ndarray:
    out: List[List[float]] = []
    for box in boxes:
        if len(box) != 4:
            continue
        x1, y1, x2, y2 = map(float, box)
        out.append([
            min(x1, x2),
            min(y1, y2),
            max(x1, x2),
            max(y1, y2),
        ])
    return np.asarray(out, dtype=np.float32) if out else np.zeros((0, 4), dtype=np.float32)


def _prepare_predict_kwargs(prompt_type: Literal["text", "box", "point", "mask"], prompt_payload: Dict, image_np: np.ndarray, *,
                            text_box_threshold: float, text_threshold: float) -> Tuple[Dict, List[str]]:
    height, width = image_np.shape[:2]
    prompt_labels: List[str] = []
    kwargs: Dict = {}
    if prompt_type == "text":
        caption = prompt_payload.get("text") or ""
        boxes, phrases, _ = _text_to_boxes(image_np, caption, text_box_threshold, text_threshold)
        kwargs["bboxes"] = boxes.tolist() if len(boxes) else None
        prompt_labels = phrases or [caption or "object"]
    elif prompt_type == "box":
        boxes = prompt_payload.get("boxes") or []
        kwargs["bboxes"] = _prepare_boxes(boxes).tolist()
        prompt_labels = prompt_payload.get("labels") or [f"object_{idx+1}" for idx in range(len(boxes))]
    elif prompt_type == "point":
        points = prompt_payload.get("points") or []
        pts, lbls = _prepare_point_arrays(points, width, height)
        kwargs["points"] = pts.tolist()
        kwargs["labels"] = lbls.tolist()
        prompt_labels = prompt_payload.get("labels") or [f"object_{idx+1}" for idx in range(len(points))]
    elif prompt_type == "mask":
        mask_base64 = prompt_payload.get("mask_base64")
        if not mask_base64:
            raise ValueError("Mask prompt requires mask_base64 data.")
        mask = _decode_mask_from_base64(mask_base64, (width, height))
        coords = np.column_stack(np.where(mask > 0))
        if coords.size == 0:
            raise ValueError("Mask prompt is empty.")
        rng = np.random.default_rng(42)
        max_pos = 100
        if len(coords) > max_pos:
            idx = rng.choice(len(coords), size=max_pos, replace=False)
            coords = coords[idx]
        pos_points = coords[:, [1, 0]].astype(np.float32)

        dilated = cv2.dilate(mask.astype(np.uint8), np.ones((31, 31), np.uint8), iterations=1)
        neg_candidates = np.column_stack(np.where((dilated > 0) & (mask == 0)))
        max_neg = 60
        if len(neg_candidates) > max_neg:
            idx = rng.choice(len(neg_candidates), size=max_neg, replace=False)
            neg_candidates = neg_candidates[idx]
        neg_points = neg_candidates[:, [1, 0]].astype(np.float32) if len(neg_candidates) else np.empty((0, 2), dtype=np.float32)

        pts = pos_points
        labels = np.ones(len(pos_points), dtype=np.int64)
        if len(neg_points):
            pts = np.vstack([pos_points, neg_points])
            labels = np.concatenate([labels, np.zeros(len(neg_points), dtype=np.int64)])
        kwargs["points"] = pts.tolist()
        kwargs["labels"] = labels.tolist()
        kwargs["bboxes"] = [_mask_to_bbox(mask)]
        prompt_labels = prompt_payload.get("labels") or ["mask_prompt"]
    return kwargs, prompt_labels


def _score_tensor_to_numpy(scores: Optional[torch.Tensor]) -> np.ndarray:
    if scores is None:
        return np.asarray([], dtype=np.float32)
    scores = scores.detach().to("cpu")
    if scores.ndim == 0:
        scores = scores.unsqueeze(0)
    return torch.sigmoid(scores).numpy().astype(np.float32)


def _save_mask(mask: np.ndarray, base_dir: Path, stem: str) -> str:
    base_dir.mkdir(parents=True, exist_ok=True)
    out_path = base_dir / f"{stem}.png"
    Image.fromarray((mask * 255).astype(np.uint8)).save(out_path)
    return str(out_path)


def infer_image(
    image_url: str,
    prompt_type: Literal["text", "box", "point", "mask"],
    prompt_payload: Dict,
    *,
    model_id: str = "sam2_t",
    threshold: float = 0.5,
    multimask_output: bool = False,
    save_binary_masks: bool = False,
    masks_dir: Optional[str] = None,
    text_box_threshold: float = 0.35,
    text_threshold: float = 0.25,
    image_override: Optional[Image.Image] = None,
) -> Dict:
    model = _get_sam_model(model_id)
    if image_override is None:
        image = _pil_from_url(image_url)
    elif isinstance(image_override, Image.Image):
        image = image_override
    else:
        image = Image.fromarray(np.asarray(image_override).copy())
    image_np = np.array(image)
    low_quality, quality_metrics = _assess_image_quality(image_np)
    predictor_kwargs, prompt_labels = _prepare_predict_kwargs(
        prompt_type, prompt_payload, image_np,
        text_box_threshold=text_box_threshold,
        text_threshold=text_threshold,
    )
    predict_kwargs = {
        "source": image_np,
        "bboxes": predictor_kwargs.get("bboxes"),
        "points": predictor_kwargs.get("points"),
        "labels": predictor_kwargs.get("labels"),
        "verbose": False,
    }
    if multimask_output:
        predict_kwargs["retina_masks"] = True
    results = model.predict(**predict_kwargs)
    if not results:
        return {"instances": [], "diagnostics": {"num_masks": 0, "threshold": threshold}}
    result = results[0]
    masks = result.masks.data if result.masks is not None else torch.zeros(0)
    np_masks = masks.detach().cpu().numpy()
    mask_scores = getattr(result, "scores", None)
    scores = _score_tensor_to_numpy(mask_scores)
    box_conf = None
    if getattr(result, "boxes", None) is not None and getattr(result.boxes, "conf", None) is not None:
        box_conf = result.boxes.conf.detach().cpu().numpy()
    instances = []
    kept_masks_bool: List[np.ndarray] = []
    label_counts: Dict[str, int] = {}
    base_mask_dir = Path(masks_dir) if masks_dir else Path(tempfile.gettempdir()) / "sam2_masks"
    flagged_reasons_per_instance: Dict[int, List[str]] = {}
    for idx in range(np_masks.shape[0]):
        if idx < len(scores):
            score = float(scores[idx])
        elif box_conf is not None and idx < len(box_conf):
            score = float(box_conf[idx])
        else:
            score = 1.0
        if score < threshold:
            continue
        mask = (np_masks[idx] > 0).astype(np.uint8)
        area = _area_from_mask(mask)
        polygons = _mask_to_polygon(mask)
        if not polygons:
            flagged_reasons_per_instance.setdefault(idx, []).append("empty_mask")
            continue
        bbox = _mask_to_bbox(mask)
        label = prompt_labels[idx] if idx < len(prompt_labels) else f"instance_{idx+1}"
        label_counts[label] = label_counts.get(label, 0) + 1
        instance_name = f"{label}_{label_counts[label]}"
        mask_path = _save_mask(mask, base_mask_dir, instance_name) if save_binary_masks else None
        entry = {
            "bbox": bbox,
            "confidence": score,
            "class_name": label,
            "instance_name": instance_name,
            "segmentation": polygons,
            "area": area,
            "mask_rle": _mask_to_rle(mask),
            **({"mask_path": mask_path} if mask_path else {}),
        }
        entry["_raw_index"] = idx
        if area < 100:
            flagged_reasons_per_instance.setdefault(idx, []).append("small_area")
        instances.append(entry)
        kept_masks_bool.append(mask.astype(bool))
    overlap_flags = _flag_overlaps(kept_masks_bool)
    for idx, flag in enumerate(overlap_flags):
        if flag and idx < len(instances):
            raw = instances[idx]["_raw_index"]
            flagged_reasons_per_instance.setdefault(raw, []).append("overlap")

    flagged_instances: List[Dict] = []
    raw_index_map = {inst["_raw_index"]: inst for inst in instances}
    for raw_idx, reasons in flagged_reasons_per_instance.items():
        inst = raw_index_map.get(raw_idx)
        name = inst["instance_name"] if inst else (
            prompt_labels[raw_idx] if raw_idx < len(prompt_labels) else f"instance_{raw_idx + 1}"
        )
        flagged_instances.append({
            "index": raw_idx,
            "name": name,
            "reason": sorted(set(reasons)),
        })

    flagged_images: List[str] = []
    if low_quality:
        flagged_images.append("low_quality")
    if not instances:
        flagged_images.append("no_masks")
    for entry in flagged_instances:
        flagged_images.extend(entry["reason"])
    flagged_images = sorted(set(flagged_images))

    # Semi-automatic split: top 80% auto, rest review.
    if instances:
        instances.sort(key=lambda inst: inst["confidence"], reverse=True)
        split_index = max(1, math.ceil(0.8 * len(instances)))
        for i, inst in enumerate(instances):
            inst["requires_review"] = i >= split_index or inst["confidence"] < (threshold + 0.05)
    else:
        split_index = 0

    diagnostics = {
        "num_masks": len(instances),
        "raw_masks": int(np_masks.shape[0]),
        "threshold": threshold,
        "prompt_type": prompt_type,
        "model_id": model_id,
        "image_size": {"width": image.width, "height": image.height},
        "low_quality": low_quality,
        "quality_metrics": quality_metrics,
        "auto_split_index": split_index,
        "auto_assignment": {
            "auto": split_index,
            "review": max(0, len(instances) - split_index),
        },
    }

    for inst in instances:
        inst.pop("_raw_index", None)

    return {
        "instances": instances,
        "prompt_labels": prompt_labels,
        "diagnostics": diagnostics,
        "flagged_instances": flagged_instances,
        "flagged_images": flagged_images,
    }


def _apply_augmentation(image: Image.Image, payload: Dict, operation: str) -> Tuple[Image.Image, Dict]:
    width, height = image.size
    augmented_payload = copy.deepcopy(payload)

    def _flip_box_h(b):
        return [width - b[2], b[1], width - b[0], b[3]]

    def _flip_box_v(b):
        return [b[0], height - b[3], b[2], height - b[1]]

    def _rotate_box_ccw(b):
        x1, y1, x2, y2 = b
        return [y1, width - x2, y2, width - x1]

    if operation == "flip_horizontal":
        aug_image = image.transpose(Image.FLIP_LEFT_RIGHT)
        if augmented_payload.get("boxes"):
            augmented_payload["boxes"] = [_flip_box_h(box) for box in augmented_payload["boxes"]]
        if augmented_payload.get("points"):
            augmented_payload["points"] = [{**pt, "x": width - pt["x"]} for pt in augmented_payload["points"]]
    elif operation == "flip_vertical":
        aug_image = image.transpose(Image.FLIP_TOP_BOTTOM)
        if augmented_payload.get("boxes"):
            augmented_payload["boxes"] = [_flip_box_v(box) for box in augmented_payload["boxes"]]
        if augmented_payload.get("points"):
            augmented_payload["points"] = [{**pt, "y": height - pt["y"]} for pt in augmented_payload["points"]]
    elif operation == "rotate90":
        aug_image = image.transpose(Image.ROTATE_90)
        new_width, new_height = aug_image.size
        if augmented_payload.get("boxes"):
            augmented_payload["boxes"] = [_rotate_box_ccw(box) for box in augmented_payload["boxes"]]
        if augmented_payload.get("points"):
            augmented_payload["points"] = [
                {**pt, "x": pt["y"], "y": width - pt["x"]}
                for pt in augmented_payload["points"]
            ]
        width, height = new_width, new_height
    else:
        aug_image = image.copy()

    return aug_image, augmented_payload


def batch_infer(
    records: Sequence[Tuple[int, str]],
    prompt_type: Literal["text", "box", "point", "mask"],
    prompt_payload: Dict,
    *,
    model_id: str = "sam2_t",
    threshold: float = 0.5,
    augmentations: Optional[Sequence[str]] = None,
    num_workers: int = 2,
    save_binary_masks: bool = False,
    masks_dir: Optional[str] = None,
    text_box_threshold: float = 0.35,
    text_threshold: float = 0.25,
) -> List[Tuple[int, Dict]]:
    augmentations = [] if prompt_type == "mask" else (augmentations or [])
    tasks: List[Tuple[int, str, Dict, Optional[np.ndarray], str]] = []
    for image_id, image_url in records:
        image = _pil_from_url(image_url)
        tasks.append((image_id, image_url, prompt_payload, np.array(image), "original"))
        for aug in augmentations:
            aug_image, aug_payload = _apply_augmentation(image, prompt_payload, aug)
            tasks.append((image_id, image_url, aug_payload, np.array(aug_image), aug))

    def _worker(task):
        img_id, url, payload, image_np, tag = task
        result = infer_image(
            url,
            prompt_type,
            payload,
            model_id=model_id,
            threshold=threshold,
            image_override=image_np,
             save_binary_masks=save_binary_masks,
             masks_dir=masks_dir,
             text_box_threshold=text_box_threshold,
             text_threshold=text_threshold,
        )
        result.setdefault("diagnostics", {})["augmentation"] = tag
        return img_id, result

    if num_workers <= 1:
        return [_worker(task) for task in tasks]

    results: List[Tuple[int, Dict]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=num_workers) as executor:
        for res in executor.map(_worker, tasks):
            results.append(res)
    return results


def evaluate_predictions(prediction_coco: Dict, ground_truth_coco: Dict) -> Dict:
    from pycocotools.coco import COCO
    from pycocotools.cocoeval import COCOeval

    tmp_dir = Path(tempfile.mkdtemp())
    try:
        pred_path = tmp_dir / "pred.json"
        gt_path = tmp_dir / "gt.json"
        pred_path.write_text(json.dumps(prediction_coco), encoding="utf-8")
        gt_path.write_text(json.dumps(ground_truth_coco), encoding="utf-8")
        coco_gt = COCO(str(gt_path))
        coco_dt = coco_gt.loadRes(str(pred_path))
        coco_eval = COCOeval(coco_gt, coco_dt, "segm")
        coco_eval.evaluate()
        coco_eval.accumulate()
        coco_eval.summarize()
        metrics = {
            "AP": float(coco_eval.stats[0]),
            "AP50": float(coco_eval.stats[1]),
            "AP75": float(coco_eval.stats[2]),
            "mIoU": float(coco_eval.stats[0]),
        }
        return metrics
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def infer_video(
    video_path: str,
    prompt_type: Literal["text", "box", "point", "mask"],
    prompt_payload: Dict,
    *,
    frame_stride: int = 1,
    max_frames: Optional[int] = None,
    save_binary_masks: bool = False,
    masks_dir: Optional[str] = None,
    **kwargs,
) -> List[Dict]:
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Unable to open video: {video_path}")
    frame_idx = 0
    kept = 0
    outputs: List[Dict] = []
    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            if frame_idx % frame_stride != 0:
                frame_idx += 1
                continue
            image = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            result = infer_image(
                image_url=video_path,
                prompt_type=prompt_type,
                prompt_payload=prompt_payload,
                image_override=image,
                save_binary_masks=save_binary_masks,
                masks_dir=masks_dir,
                **kwargs,
            )
            result.setdefault("diagnostics", {})["frame_index"] = frame_idx
            outputs.append(result)
            kept += 1
            frame_idx += 1
            if max_frames is not None and kept >= max_frames:
                break
    finally:
        cap.release()
    return outputs

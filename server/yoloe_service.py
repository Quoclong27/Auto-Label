# yoloe_service.py
import io
import os
import math
import shutil
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import requests
import torch
import supervision as sv
from PIL import Image
from huggingface_hub import hf_hub_download
from ultralytics import YOLOE
from ultralytics.models.yolo.yoloe.predict_vp import YOLOEVPSegPredictor
from ultralytics.utils.torch_utils import smart_inference_mode

from .cloudinary_service import resolve_asset_path

# ----------------------------
# Global config
# ----------------------------
_DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# Sàn confidence cho mọi chế độ (hạ thấp chút để tránh "no det" khi prompt hẹp)
_MIN_CONF = float(os.getenv("PROMPT_MIN_CONF", "0.12"))
_PROMPT_DETECT_CONF_CAP = float(os.getenv("PROMPT_DETECT_CONF_CAP", "0.12"))
_PROMPT_DETECT_CONF_FLOOR = float(os.getenv("PROMPT_DETECT_CONF_FLOOR", "0.1"))
_PROMPT_DETECT_FALLBACK_CONF = float(os.getenv("PROMPT_DETECT_FALLBACK_CONF", "0.02"))

# Ngưỡng giống nhau cho đặt tên theo prompt embedding (0.0 = không chặn)
_SIMILARITY_THRESHOLD = float(os.getenv("PROMPT_SIM_THRESHOLD", "0.0"))

# Cache model/weights
_MODEL_CACHE: Dict[str, YOLOE] = {}
_TEXT_MODEL_CACHE: Dict[str, YOLOE] = {}
_MOBILECLIP_READY = False


# ----------------------------
# Utilities
# ----------------------------
def _ensure_mobileclip_weights() -> None:
    """Copy MobileCLIP weights (nếu được bundle) về CWD để Ultralytics có thể load."""
    global _MOBILECLIP_READY
    if _MOBILECLIP_READY:
        return
    weight_dir = Path(__file__).resolve().parent.parent / "yoloe"
    if weight_dir.exists():
        for weight in weight_dir.glob("mobileclip_*.pt"):
            target = Path.cwd() / weight.name
            if not target.exists():
                try:
                    shutil.copy(weight, target)
                except OSError:
                    pass
    _MOBILECLIP_READY = True


def _init_model(model_id: str, is_pf: bool = False) -> YOLOE:
    _ensure_mobileclip_weights()
    filename = f"{model_id}-seg.pt" if not is_pf else f"{model_id}-seg-pf.pt"
    path = hf_hub_download(repo_id="jameslahm/yoloe", filename=filename)
    model = YOLOE(path)
    model.eval()
    model.to(_DEVICE)
    return model


def _get_model(model_id: str, is_pf: bool = False) -> YOLOE:
    key = f"{model_id}:pf={is_pf}"
    if key not in _MODEL_CACHE:
        _MODEL_CACHE[key] = _init_model(model_id, is_pf)
    return _MODEL_CACHE[key]


def _get_text_model(model_id: str, texts: List[str]) -> YOLOE:
    normalized = [t.strip() for t in texts if t and t.strip()]
    if not normalized:
        raise ValueError("No text prompts provided")
    cache_key = f"{model_id}:text:{'|'.join(normalized)}"
    if cache_key not in _TEXT_MODEL_CACHE:
        model = _init_model(model_id)
        model.set_classes(normalized, model.get_text_pe(normalized))
        _TEXT_MODEL_CACHE[cache_key] = model
    return _TEXT_MODEL_CACHE[cache_key]


def _pil_from_url(url: str) -> Image.Image:
    """Tải ảnh từ local (nếu mapped) hoặc HTTP(S)."""
    local_path = resolve_asset_path(url)
    if local_path is not None:
        return Image.open(local_path).convert("RGB")
    response = requests.get(url, timeout=60)
    response.raise_for_status()
    return Image.open(io.BytesIO(response.content)).convert("RGB")


def _prepare_head(model: YOLOE) -> Tuple[object, bool, Optional[float], Optional[int]]:
    """Gỡ fuse head để chỉnh conf/max_det an toàn, trả về state để khôi phục."""
    head = model.model.model[-1]
    was_fused = getattr(head, "is_fused", False)
    if was_fused:
        head.is_fused = False
    return head, was_fused, getattr(head, "conf", None), getattr(head, "max_det", None)


def _restore_head(head, was_fused: bool, conf: Optional[float], max_det: Optional[int]) -> None:
    if was_fused:
        head.is_fused = True
    if conf is not None:
        head.conf = conf
    if max_det is not None:
        head.max_det = max_det


def _normalize_vector(vec: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(vec)
    if norm <= 0.0 or not np.isfinite(norm):
        return vec
    return vec / norm


def _ensure_embedding_batch(data: List[List[float]] | np.ndarray) -> np.ndarray:
    """
    ChuA?n hoA~ shape embeddings vA 3 chiA`u: (1, N, D).
    ChA"p nhA~n input (N, D) hoA·c (1, N, D).
    """
    arr = np.asarray(data, dtype=np.float32)
    if arr.ndim == 1:
        arr = arr.reshape(1, 1, -1)
    elif arr.ndim == 2:
        arr = arr[np.newaxis, ...]
    elif arr.ndim == 3:
        pass
    else:
        raise ValueError(f"Unsupported embedding shape {arr.shape}")
    if arr.shape[0] != 1:
        arr = arr[:1, ...]
    return arr


def _resolve_conf(value: Optional[float], has_prompts: bool) -> float:
    """
    Blend user-provided confidence with sensible floors/caps when prompts are used.
    Mirrors the original YOLOE demo behaviour so prompt detection stays responsive.
    """
    if has_prompts:
        base = float(value) if value is not None else _PROMPT_DETECT_CONF_CAP
        return max(_PROMPT_DETECT_CONF_FLOOR, min(_PROMPT_DETECT_CONF_CAP, base))
    base = float(value) if value is not None else _MIN_CONF
    return max(base, 0.0)


def _detections_to_payload(
    detections: sv.Detections,
    label_override: Optional[List[Optional[str]]] = None,
    embeddings: Optional[List[List[float]]] = None,
    match_scores: Optional[List[float]] = None,
    class_names: Optional[List[str]] = None,
) -> Dict:
    """
    Convert supervision.Detections -> API payload.
    - label_override[i] nếu None thì fallback theo class_names[class_id].
    """
    out = {"instances": []}
    label_counts: Dict[str, int] = {}

    xyxy = detections.xyxy if hasattr(detections, "xyxy") else np.zeros((0, 4))
    confs = detections.confidence if hasattr(detections, "confidence") else np.zeros((len(xyxy),), dtype=float)
    cls_ids = detections.class_id if hasattr(detections, "class_id") else np.full((len(xyxy),), -1, dtype=int)

    for i in range(len(xyxy)):
        x1, y1, x2, y2 = map(lambda v: int(float(v)), xyxy[i])
        name: Optional[str] = None
        if label_override is not None and i < len(label_override):
            name = label_override[i]
        if name is None:
            cid = int(cls_ids[i]) if i < len(cls_ids) else -1
            if class_names and 0 <= cid < len(class_names):
                name = str(class_names[cid])
            else:
                name = str(cid)

        label_counts[name] = label_counts.get(name, 0) + 1
        instance_name = f"{name}_{label_counts[name]}"

        inst = {
            "bbox": [x1, y1, x2, y2],
            "confidence": float(confs[i]) if i < len(confs) else 0.0,
            "class_name": name,
            "instance_name": instance_name,
        }
        if embeddings is not None and i < len(embeddings):
            inst["embedding"] = embeddings[i]
        if match_scores is not None and i < len(match_scores):
            inst["match_score"] = match_scores[i]
        out["instances"].append(inst)

    return out


def _sanitize_overlap_threshold(value: Optional[float]) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        numeric = 0.7
    return float(np.clip(numeric, 0.0, 0.99))


def _pairwise_iou(box: np.ndarray, others: np.ndarray) -> np.ndarray:
    if others.size == 0:
        return np.empty((0,), dtype=np.float32)
    box_area = max(0.0, (box[2] - box[0])) * max(0.0, (box[3] - box[1]))
    others_w = np.maximum(0.0, others[:, 2] - others[:, 0])
    others_h = np.maximum(0.0, others[:, 3] - others[:, 1])
    others_area = others_w * others_h

    inter_x1 = np.maximum(box[0], others[:, 0])
    inter_y1 = np.maximum(box[1], others[:, 1])
    inter_x2 = np.minimum(box[2], others[:, 2])
    inter_y2 = np.minimum(box[3], others[:, 3])
    inter_w = np.maximum(0.0, inter_x2 - inter_x1)
    inter_h = np.maximum(0.0, inter_y2 - inter_y1)
    inter_area = inter_w * inter_h

    union = np.maximum(box_area + others_area - inter_area, 1e-9)
    return inter_area / union


def _apply_overlap_suppression(detections: sv.Detections, threshold: float) -> sv.Detections:
    if detections is None or len(detections) == 0 or threshold >= 0.99:
        return detections
    boxes = np.asarray(getattr(detections, "xyxy", np.zeros((0, 4))), dtype=np.float32)
    if boxes.size == 0:
        return detections
    confs = np.asarray(getattr(detections, "confidence", np.ones((len(boxes),), dtype=np.float32)), dtype=np.float32)
    order = confs.argsort()[::-1]
    keep: List[int] = []
    while order.size > 0:
        idx = int(order[0])
        keep.append(idx)
        if order.size == 1:
            break
        rest = order[1:]
        overlaps = _pairwise_iou(boxes[idx], boxes[rest])
        rest = rest[overlaps <= threshold]
        order = rest
    return detections[keep]


# ----------------------------
# Inference endpoints
# ----------------------------
@smart_inference_mode()
def infer_text(url: str, texts: List[str], model_id: str, imgsz: int, conf: float, iou: float) -> Dict:
    model = _get_text_model(model_id, texts)
    image = _pil_from_url(url)
    overlap = _sanitize_overlap_threshold(iou)

    head, was_fused, orig_conf, orig_max_det = _prepare_head(model)
    try:
        head.conf = max(conf if conf is not None else _MIN_CONF, _MIN_CONF)
        results = model.predict(source=image, imgsz=imgsz, conf=head.conf, iou=iou)
    finally:
        _restore_head(head, was_fused, orig_conf, orig_max_det)

    det = sv.Detections.from_ultralytics(results[0])
    det = _apply_overlap_suppression(det, overlap)
    names = getattr(results[0], "names", None)
    name_list = [names[k] for k in sorted(names.keys())] if isinstance(names, dict) else None
    return _detections_to_payload(det, class_names=name_list)



@smart_inference_mode()
def infer_visual(
    url: str,
    prompts: Dict[str, np.ndarray],
    model_id: str,
    imgsz: int,
    conf: float,
    iou: float,
    cross_image_url: Optional[str] = None,
    labels: Optional[List[str]] = None,
    embeddings: Optional[List[List[float]]] = None,
    capture_embeddings: bool = True,
    detect_self_image: bool = True,
) -> Dict:
    model = _get_model(model_id)
    head, was_fused, orig_conf, orig_max_det = _prepare_head(model)
    overlap_threshold = _sanitize_overlap_threshold(iou)

    diagnostics = {
        "mode": "visual",
        "used_conf": None,
        "fallback_used": False,
        "num_prompt_vectors": 0,
        "num_detections": 0,
    }

    prompt_embeddings_payload: Optional[List[List[float]]] = None
    class_names: List[str] = []
    prompt_predictor_active = False

    try:
        src_image = _pil_from_url(url)
        sanitized: Dict[str, List[np.ndarray]] = {}
        for key, value in (prompts or {}).items():
            if value is None:
                continue
            seq: List[np.ndarray] = []
            if isinstance(value, list):
                for item in value:
                    arr = np.asarray(item, dtype=np.int64 if key == "cls" else np.float32)
                    if arr.size:
                        seq.append(arr)
            else:
                arr = np.asarray(value, dtype=np.int64 if key == "cls" else np.float32)
                if arr.size:
                    seq.append(arr)
            if seq:
                sanitized[key] = seq
        has_prompts = any(sanitized.values())

        label_values = [str(lbl).strip() for lbl in (labels or [])]
        label_index = 0

        def _next_label(default: str) -> str:
            nonlocal label_index
            if label_index < len(label_values):
                label = label_values[label_index]
                label_index += 1
                return label or default
            label_index += 1
            return default

        vectors: List[np.ndarray] = []

        if embeddings is not None and len(embeddings) > 0:
            base_batch = _ensure_embedding_batch(embeddings)
            vectors.append(base_batch)
            count = base_batch.shape[1]
            base_names = [_next_label(f"object{i}") for i in range(count)]
            class_names.extend(base_names)

        if has_prompts:
            existing_predictor = getattr(model, "predictor", None)
            if existing_predictor is not None and not hasattr(existing_predictor, "set_prompts"):
                model.predictor = None
            prompt_kwargs = {"prompts": sanitized, "predictor": YOLOEVPSegPredictor}
            prompt_conf = _resolve_conf(conf, has_prompts=True)
            prompt_predictor_active = True
            model.predict(
                source=src_image,
                imgsz=imgsz,
                conf=prompt_conf,
                iou=iou,
                return_vpe=True,
                **prompt_kwargs,
            )
            predictor_obj = getattr(model, "predictor", None)
            if predictor_obj is None or not hasattr(predictor_obj, "vpe"):
                raise RuntimeError("Unable to capture prompt embeddings.")
            tensor = predictor_obj.vpe
            prompt_batch = tensor.detach().cpu().numpy().astype(np.float32)
            vectors.append(prompt_batch)
            count = prompt_batch.shape[1]
            prompt_names = [_next_label(f"object{len(class_names) + i}") for i in range(count)]
            class_names.extend(prompt_names)
            if capture_embeddings:
                payload_array = prompt_batch.reshape(-1, prompt_batch.shape[-1]).tolist()
                prompt_embeddings_payload = payload_array
            model.predictor = None
            prompt_predictor_active = False

        if not vectors:
            raise ValueError("No visual prompts or embeddings provided")

        combined = vectors[0]
        if len(vectors) > 1:
            combined = np.concatenate(vectors, axis=1)
        tensor = torch.from_numpy(combined).to(_DEVICE)
        model.set_classes(class_names, tensor)

        head.is_fused = True
        used_conf = _resolve_conf(conf, has_prompts=True or bool(embeddings))
        head.conf = used_conf
        head.max_det = max(orig_max_det or 300, 1000)
        diagnostics["num_prompt_vectors"] = len(class_names)

        if cross_image_url:
            det_image = _pil_from_url(cross_image_url)
        elif detect_self_image:
            det_image = src_image
        else:
            det_image = None

        if det_image is None:
            empty = sv.Detections.empty()
            payload = _detections_to_payload(empty)
            if prompt_embeddings_payload is not None:
                payload["prompt_embeddings"] = prompt_embeddings_payload
            payload["prompt_labels"] = class_names
            payload["diagnostics"] = diagnostics
            return payload

        diagnostics["used_conf"] = used_conf
        results = model.predict(source=det_image, imgsz=imgsz, conf=used_conf, iou=iou)
        detections = sv.Detections.from_ultralytics(results[0])

        if len(detections) == 0:
            diagnostics["fallback_used"] = True
            results = model.predict(
                source=det_image,
                imgsz=imgsz,
                conf=_PROMPT_DETECT_FALLBACK_CONF,
                iou=min(iou, 0.55),
            )
            detections = sv.Detections.from_ultralytics(results[0])

    finally:
        _restore_head(head, was_fused, orig_conf, orig_max_det)
        if prompt_predictor_active:
            model.predictor = None

    detections = _apply_overlap_suppression(detections, overlap_threshold)
    diagnostics["num_detections"] = len(detections)
    payload = _detections_to_payload(detections, class_names=class_names)
    min_conf_filter = max(0.0, float(conf) if conf is not None else 0.0)
    if payload.get("instances"):
        payload["instances"] = [
            inst for inst in payload["instances"]
            if inst.get("confidence", 0.0) >= min_conf_filter
        ]
    diagnostics["min_conf_filter"] = min_conf_filter
    diagnostics["num_kept"] = len(payload.get("instances", []))
    if prompt_embeddings_payload is not None:
        payload["prompt_embeddings"] = prompt_embeddings_payload
    payload["prompt_labels"] = class_names
    payload["diagnostics"] = diagnostics
    return payload

@smart_inference_mode()
def infer_boxes(
    url: str,
    boxes: List[List[int]],  # pixel int: [x1,y1,x2,y2]
    model_id: str,
    imgsz: int,
    conf: float,
    iou: float,
    cross_image_url: Optional[str] = None,
) -> Dict:
    """
    Adapter cho Box Prompt: ép kiểu, sắp xếp toạ độ, kẹp biên → gọi infer_visual().
    """
    # ép mảng
    arr = np.asarray(boxes, dtype=np.int32)
    if arr.ndim != 2 or arr.shape[1] != 4:
        raise ValueError("boxes must be Nx4 [x1,y1,x2,y2] in pixels")

    # đảm bảo [x1<=x2, y1<=y2]
    x1 = np.minimum(arr[:, 0], arr[:, 2])
    y1 = np.minimum(arr[:, 1], arr[:, 3])
    x2 = np.maximum(arr[:, 0], arr[:, 2])
    y2 = np.maximum(arr[:, 1], arr[:, 3])
    arr = np.stack([x1, y1, x2, y2], axis=1).astype(np.float32)

    # cls bắt buộc cho YOLOEVPSegPredictor (giống bản Gradio)
    prompts = {"bboxes": arr, "cls": np.arange(len(arr), dtype=np.int32)}

    return infer_visual(
        url=url,
        prompts=prompts,
        model_id=model_id,
        imgsz=imgsz,
        conf=conf,
        iou=iou,
        cross_image_url=cross_image_url,
        labels=None,
        embeddings=None,
        capture_embeddings=True,
        detect_self_image=cross_image_url is None,
    )


@smart_inference_mode()
def infer_prompt_free(url: str, vocab: List[str], model_id: str, imgsz: int, conf: float, iou: float) -> Dict:
    """
    Prompt-free: lấy vocab_id từ bản base, sau đó chạy bằng bản -pf đã fine-tune.
    """
    overlap_threshold = _sanitize_overlap_threshold(iou)
    base = _get_model(model_id)
    head = base.model.model[-1]
    was_fused = getattr(head, "is_fused", False)
    if was_fused:
        head.is_fused = False
    orig_conf = getattr(head, "conf", None)
    orig_max_det = getattr(head, "max_det", None)
    try:
        vocab_ids = base.get_vocab(vocab)
    finally:
        if was_fused:
            head.is_fused = True
        if orig_conf is not None:
            head.conf = orig_conf
        if orig_max_det is not None:
            head.max_det = orig_max_det

    model = _get_model(model_id, is_pf=True)
    pf_head = model.model.model[-1]
    pf_was_fused = getattr(pf_head, "is_fused", False)
    pf_orig_conf = getattr(pf_head, "conf", None)
    pf_orig_max_det = getattr(pf_head, "max_det", None)

    if not pf_was_fused:
        pf_head.is_fused = True
    model.set_vocab(vocab_ids, names=vocab)
    pf_head.conf = max(float(conf), _MIN_CONF) if conf is not None else _MIN_CONF
    pf_head.max_det = 1000

    image = _pil_from_url(url)
    try:
        results = model.predict(source=image, imgsz=imgsz, conf=pf_head.conf, iou=iou)
    finally:
        # restore
        if pf_orig_conf is not None:
            pf_head.conf = pf_orig_conf
        if pf_orig_max_det is not None:
            pf_head.max_det = pf_orig_max_det
        pf_head.is_fused = pf_was_fused

    det = sv.Detections.from_ultralytics(results[0])
    det = _apply_overlap_suppression(det, overlap_threshold)
    names = getattr(results[0], "names", None)
    name_list = [names[k] for k in sorted(names.keys())] if isinstance(names, dict) else None
    return _detections_to_payload(det, class_names=name_list)

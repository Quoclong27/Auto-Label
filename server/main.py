# server/main.py
import asyncio
import base64
import os
import json
import tempfile
import random
import math
import zipfile
import shutil
import time
from collections import deque
from urllib.parse import urlparse, unquote
from io import BytesIO
from pathlib import Path
from typing import List, Optional, Dict

import numpy as np
import requests
from PIL import Image
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware
from fastapi.responses import JSONResponse

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text, delete

# ---- Internal imports
from .deps import get_session, engine, get_settings
from .models import Base, User, Project, ImageItem, Annotation
from .schemas import (
    UserOut, ProjectCreate, ProjectUpdate, ProjectOut, CollaboratorOut, ShareProjectRequest,
    InferenceParamsText, InferenceParamsBoxes, InferenceParamsPromptFree,
    InferenceParamsVisual, ReviewDecision, DatasetExportRequest,
    Sam2InferenceParams, Sam2BatchParams, Sam2VideoParams, Sam2EvalParams,
    ManualAnnotationSubmit,
)
from .auth import router as auth_router

# Conditional import: AI services only if models available
try:
    from . import yoloe_service as ys
    from . import sam2_service as sam2
    AI_AVAILABLE = True
except ImportError as e:
    print(f"⚠️  AI models not available: {e}")
    ys = None
    sam2 = None
    AI_AVAILABLE = False

from .cloudinary_service import (
    upload_image_local,
    upload_coco_json,
    local_upload_root,
    using_cloudinary,
    upload_raw_file,
    resolve_asset_path,
    delete_image_asset,
)
from .coco import build_coco, proposals_to_coco_ann

# --------------------------------------------------------------------------
# App & Middleware
# --------------------------------------------------------------------------
settings = get_settings()

app = FastAPI(title="YOLOE Labeling API", version="0.1.0")

if not using_cloudinary():
    app.mount("/uploads", StaticFiles(directory=str(local_upload_root())), name="uploads")

# CORS configuration
allow_origins = {settings.frontend_url}
mirror = (settings.frontend_url.replace("localhost", "127.0.0.1")
          if "localhost" in settings.frontend_url
          else settings.frontend_url.replace("127.0.0.1", "localhost"))
allow_origins.add(mirror)
# Add common dev ports (5173, 5174, 5175)
allow_origins.add("http://localhost:5173")
allow_origins.add("http://localhost:5174")
allow_origins.add("http://localhost:5175")
allow_origins.add("http://127.0.0.1:5173")
allow_origins.add("http://127.0.0.1:5174")
allow_origins.add("http://127.0.0.1:5175")

# Add LAN IP for team access
lan_ip = os.getenv("LAN_IP")
if lan_ip:
    allow_origins.add(f"http://{lan_ip}:5173")
    allow_origins.add(f"http://{lan_ip}:5174")
    allow_origins.add(f"http://{lan_ip}:5175")
    print(f"✅ CORS: Added LAN IP origins: {lan_ip}")

# Add Vercel frontend for production
vercel_url = os.getenv("VERCEL_FRONTEND_URL")
if vercel_url:
    allow_origins.add(vercel_url)
    print(f"✅ CORS: Added Vercel frontend: {vercel_url}")

# Allow all IPs in dev mode for easier LAN testing
if os.getenv("DEV_OAUTH_PERMISSIVE"):
    # Allow any origin in dev mode
    print("⚠️  DEV MODE: CORS allows all origins")
    allow_origins.add("*")

# In dev mode with wildcard, use allow_origin_regex instead
if "*" in allow_origins:
    allow_origins.remove("*")
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"http://(localhost|127\.0\.0\.1|10\.10\.\d+\.\d+):517[3-5]",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    print(f"✅ CORS: Using regex pattern for all local/LAN IPs")
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(allow_origins),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    print(f"✅ CORS: Allowed origins: {allow_origins}")

app.add_middleware(
    SessionMiddleware,
    secret_key=settings.secret_key,
    session_cookie="session",
    same_site="lax",
    https_only=False,
    max_age=3600,
)

# Attach OAuth routes
app.include_router(auth_router, prefix="")

# --------------------------------------------------------------------------
# Helper Functions
# --------------------------------------------------------------------------
def check_ai_available():
    """Raise 503 error if AI models are not available in this environment."""
    if not AI_AVAILABLE or ys is None or sam2 is None:
        raise HTTPException(
            status_code=503,
            detail="AI models not available in this environment. Please use the local version with models installed."
        )

# --------------------------------------------------------------------------
# DB init
# --------------------------------------------------------------------------
@app.on_event("startup")
async def on_startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        result = await conn.execute(text("PRAGMA table_info(projects)"))
        columns = {row[1] for row in result}
        if "description" not in columns:
            await conn.execute(text("ALTER TABLE projects ADD COLUMN description VARCHAR(1024)"))
        if "project_type" not in columns:
            await conn.execute(
                text("ALTER TABLE projects ADD COLUMN project_type VARCHAR(64) DEFAULT 'object_detection'")
            )
        if "publish_level" not in columns:
            await conn.execute(
                text("ALTER TABLE projects ADD COLUMN publish_level VARCHAR(16) DEFAULT 'private'")
            )
        if "archived_by_owner" not in columns:
            await conn.execute(
                text("ALTER TABLE projects ADD COLUMN archived_by_owner BOOLEAN DEFAULT 0")
            )
        await conn.execute(
            text("UPDATE projects SET project_type = 'object_detection' WHERE project_type IS NULL")
        )
        await conn.execute(
            text("UPDATE projects SET publish_level = 'private' WHERE publish_level IS NULL")
        )
        await conn.execute(
            text("UPDATE projects SET archived_by_owner = 0 WHERE archived_by_owner IS NULL")
        )

# --------------------------------------------------------------------------
# Debug & Health
# --------------------------------------------------------------------------
@app.get("/")
def root():
    """Root endpoint - API is running"""
    return {
        "message": "AutoLabel API is running",
        "version": "0.1.0",
        "ai_available": AI_AVAILABLE,
        "endpoints": {
            "health": "/_debug_settings",
            "auth": "/auth/login",
            "docs": "/docs"
        }
    }

@app.get("/_debug_settings")
def debug_settings():
    return {
        "FRONTEND_URL": settings.frontend_url,
        "BACKEND_URL": settings.backend_url,
        "ADMIN_EMAIL": settings.admin_email,
        "HAS_GOOGLE_ID": bool(os.getenv("GOOGLE_CLIENT_ID")),
        "HAS_GOOGLE_SECRET": bool(os.getenv("GOOGLE_CLIENT_SECRET")),
    }

@app.get("/health")
def health():
    return {"ok": True}

# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def _current_email(request: Request) -> str:
    email = request.cookies.get("user_email")
    if not email:
        print(f"❌ No user_email cookie found. Cookies: {request.cookies}")
        raise HTTPException(401, "Not authenticated")
    return email


def _decode_mask(mask_base64: str, target_size: Optional[tuple[int, int]] = None) -> np.ndarray:
    """
    Decode a base64-encoded image into a binary mask (uint8 0/1).
    Optionally resize to the provided (width, height) using nearest neighbour.
    """
    if "," in mask_base64:
        mask_base64 = mask_base64.split(",", 1)[1]
    try:
        data = base64.b64decode(mask_base64)
    except (ValueError, base64.binascii.Error) as exc:
        raise HTTPException(400, "Invalid mask data") from exc

    try:
        image = Image.open(BytesIO(data)).convert("L")
    except (OSError, ValueError) as exc:
        raise HTTPException(400, "Mask image could not be decoded") from exc

    if target_size:
        width, height = target_size
        if image.size != (width, height):
            image = image.resize((width, height), Image.NEAREST)

    mask = np.array(image, dtype=np.uint8)
    mask = (mask > 0).astype(np.uint8)
    if mask.sum() == 0:
        raise HTTPException(400, "Mask is empty")
    return mask


def _download_asset_to_path(url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    local_path = resolve_asset_path(url)
    if local_path and local_path.exists():
        shutil.copy2(local_path, destination)
        return
    response = requests.get(url, timeout=60)
    response.raise_for_status()
    destination.write_bytes(response.content)


def _derive_filename(image: ImageItem) -> str:
    meta_name = (image.meta or {}).get("filename") if image.meta else None
    if meta_name:
        original = meta_name
    else:
        parsed = urlparse(image.url)
        original = Path(unquote(parsed.path)).name or f"image_{image.id}.jpg"
    extension = Path(original).suffix or ".jpg"
    base = Path(original).stem
    return f"{image.id}_{base}{extension}"


def _allocate_split_counts(total: int, ratios: dict[str, float]) -> dict[str, int]:
    counts = {key: 0 for key in ratios}
    if total <= 0:
        return counts
    total_ratio = sum(ratios.values())
    if total_ratio <= 0:
        raise ValueError("Split ratios must sum to a value greater than zero")
    raw = {key: total * (ratios[key] / total_ratio) for key in ratios}
    counts = {key: int(val) for key, val in raw.items()}
    remainder = total - sum(counts.values())
    if remainder:
        order = sorted(ratios.keys(), key=lambda k: (raw[k] - counts[k]), reverse=True)
        for key in order:
            if remainder <= 0:
                break
            counts[key] += 1
            remainder -= 1
    return counts


def _build_yolo_lines(instances: List[dict], width: int, height: int, class_to_id: dict[str, int]) -> List[str]:
    lines: List[str] = []
    if width <= 0 or height <= 0:
        return lines
    for inst in instances or []:
        cls_name = inst.get("class_name")
        if cls_name not in class_to_id:
            continue
        x1, y1, x2, y2 = inst.get("bbox", [0, 0, 0, 0])
        w = max(x2 - x1, 0)
        h = max(y2 - y1, 0)
        if w <= 0 or h <= 0:
            continue
        x_center = (x1 + x2) / 2 / width
        y_center = (y1 + y2) / 2 / height
        w_norm = w / width
        h_norm = h / height
        x_center = min(max(x_center, 0.0), 1.0)
        y_center = min(max(y_center, 0.0), 1.0)
        w_norm = min(max(w_norm, 0.0), 1.0)
        h_norm = min(max(h_norm, 0.0), 1.0)
        line_parts = [str(class_to_id[cls_name]), f"{x_center:.6f}", f"{y_center:.6f}", f"{w_norm:.6f}", f"{h_norm:.6f}"]
        polygons = inst.get("segmentation") or []
        if polygons:
            flattened = []
            for segment in polygons:
                coords = segment if isinstance(segment, list) else list(segment)
                for idx in range(0, len(coords), 2):
                    px = coords[idx] / width
                    py = coords[idx + 1] / height
                    flattened.append(f"{px:.6f}")
                    flattened.append(f"{py:.6f}")
            if flattened:
                line_parts.extend(flattened)
        lines.append(" ".join(line_parts))
    return lines


def _sam2_prompt_payload(params) -> Dict:
    payload: Dict = {}
    text_value = getattr(params, "text", None)
    if text_value:
        payload["text"] = text_value
    boxes_value = getattr(params, "boxes", None)
    if boxes_value:
        payload["boxes"] = [[b.x1, b.y1, b.x2, b.y2] for b in boxes_value]
    points_value = getattr(params, "points", None)
    if points_value:
        payload["points"] = [{"x": p.x, "y": p.y, "positive": p.positive} for p in points_value]
    labels_value = getattr(params, "labels", None)
    if labels_value:
        payload["labels"] = labels_value
    mask_value = getattr(params, "mask_base64", None)
    if mask_value:
        payload["mask_base64"] = mask_value
    return payload


async def _build_dataset_zip(project: Project, records: List[tuple[ImageItem, dict]], export_type: str, ratios: Dict[str, float]) -> str:
    temp_dir = Path(tempfile.mkdtemp())
    dataset_root = temp_dir / f"project_{project.id}_{export_type}"
    dataset_root.mkdir(parents=True, exist_ok=True)
    zip_path: Optional[Path] = None
    try:
        counts = _allocate_split_counts(len(records), ratios)
        shuffled = records[:]
        random.Random(42).shuffle(shuffled)
        train_end = counts.get("train", 0)
        val_end = train_end + counts.get("val", 0)
        splits = {
            "train": shuffled[:train_end],
            "val": shuffled[train_end:val_end],
            "test": shuffled[val_end:],
        }
        class_names = sorted({
            inst.get("class_name")
            for _, ann in records
            for inst in (ann or {}).get("instances", [])
            if inst.get("class_name")
        })
        if not class_names:
            raise ValueError("No class annotations found for export")
        class_to_id = {name: idx for idx, name in enumerate(class_names)}
        categories = [{"id": idx + 1, "name": name} for idx, name in enumerate(class_names)] if export_type == "coco" else []
        coco_dir = dataset_root / "coco" if export_type == "coco" else None
        if coco_dir:
            coco_dir.mkdir(parents=True, exist_ok=True)
        global_coco_images: List[Dict] = []
        global_coco_annotations: List[Dict] = []
        ann_counter = 1
        for split_name, items in splits.items():
            images_dir = dataset_root / split_name / "images"
            images_dir.mkdir(parents=True, exist_ok=True)
            labels_dir: Optional[Path] = None
            if export_type == "yolo":
                labels_dir = dataset_root / split_name / "labels"
                labels_dir.mkdir(parents=True, exist_ok=True)
            for image, annotation in items:
                filename = _derive_filename(image)
                dest_image_path = images_dir / filename
                _download_asset_to_path(image.url, dest_image_path)
                instances = (annotation or {}).get("instances", [])
                if export_type == "yolo":
                    label_path = labels_dir / f"{Path(filename).stem}.txt"
                    lines = _build_yolo_lines(instances, image.width, image.height, class_to_id)
                    label_content = "\n".join(lines)
                    label_path.write_text(label_content + ("\n" if label_content else ""), encoding="utf-8")
                elif export_type == "coco":
                    image_entry = {
                        "id": image.id,
                        "file_name": filename,
                        "width": image.width,
                        "height": image.height,
                        "split": split_name,
                    }
                    global_coco_images.append(image_entry)
                    for inst in instances or []:
                        cls_name = inst.get("class_name")
                        if cls_name not in class_to_id:
                            continue
                        x1, y1, x2, y2 = inst.get("bbox", [0, 0, 0, 0])
                        w = max(x2 - x1, 0)
                        h = max(y2 - y1, 0)
                        if w <= 0 or h <= 0:
                            continue
                        global_coco_annotations.append({
                            "id": ann_counter,
                            "image_id": image.id,
                            "category_id": class_to_id[cls_name] + 1,
                            "bbox": [x1, y1, w, h],
                            "area": float(inst.get("area", w * h)),
                            "segmentation": inst.get("mask_rle") or inst.get("segmentation") or [],
                            "iscrowd": 0,
                        })
                        ann_counter += 1
        if export_type == "coco" and coco_dir is not None:
            aggregated = build_coco(global_coco_images, global_coco_annotations, categories)
            with open(coco_dir / "annotations.json", "w", encoding="utf-8") as f:
                json.dump(aggregated, f, ensure_ascii=False)
        if export_type == "yolo":
            data_yaml_lines = [
                "train: train/images",
                "val: val/images",
            ]
            if len(splits["test"]) > 0:
                data_yaml_lines.append("test: test/images")
            data_yaml_lines.append(f"nc: {len(class_names)}")
            data_yaml_lines.append("names:")
            for idx, name in enumerate(class_names):
                data_yaml_lines.append(f"  {idx}: {name}")
            (dataset_root / "data.yaml").write_text("\n".join(data_yaml_lines) + "\n", encoding="utf-8")
            for split_name in ("train", "val", "test"):
                split_yaml = dataset_root / f"{split_name}.yaml"
                lines = [
                    f"images: {split_name}/images",
                    f"labels: {split_name}/labels",
                    "names:",
                ]
                for idx, name in enumerate(class_names):
                    lines.append(f"  {idx}: {name}")
                split_yaml.write_text("\n".join(lines) + "\n", encoding="utf-8")
        zip_name = f"project_{project.id}_{export_type}_{int(time.time())}.zip"
        zip_path = temp_dir / zip_name
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for file_path in dataset_root.rglob("*"):
                zf.write(file_path, file_path.relative_to(dataset_root))
        folder = f"project_{project.id}/{export_type}"
        url = await upload_raw_file(folder, str(zip_path), zip_name)
        return url
    finally:
        if zip_path and zip_path.exists():
            try:
                zip_path.unlink()
            except Exception:
                pass
        shutil.rmtree(dataset_root, ignore_errors=True)
        shutil.rmtree(temp_dir, ignore_errors=True)

# --------------------------------------------------------------------------
# Me
# --------------------------------------------------------------------------
@app.get("/me", response_model=UserOut)
async def me(request: Request, session: AsyncSession = Depends(get_session)):
    print(f"🔍 /me request cookies: {request.cookies}")
    
    # First try to get email from cookie
    email = request.cookies.get("user_email")
    
    # If no cookie but just returned from OAuth callback, email might be in query params
    if not email:
        email = request.query_params.get("auth_email")
        if email:
            print(f"📝 Got email from query param: {email}")
    
    if not email:
        print(f"❌ No user_email cookie or auth_email param found. Cookies: {request.cookies}")
        raise HTTPException(401, "Not authenticated")
    
    print(f"✅ Authenticated email: {email}")
    res = await session.execute(select(User).where(User.email == email))
    user = res.scalar_one_or_none()
    if not user:
        print(f"❌ User not found: {email}")
        raise HTTPException(404, "User not found")
    print(f"✅ User found: {user.email}, is_admin={user.is_admin}")
    return user

# --------------------------------------------------------------------------
# Projects
# --------------------------------------------------------------------------
@app.post("/projects", response_model=ProjectOut)
async def create_project(
    payload: ProjectCreate,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    email = _current_email(request)
    res = await session.execute(select(User).where(User.email == email))
    user = res.scalar_one()

    proj = Project(
        name=payload.name,
        owner_id=user.id,
        description=payload.description,
        project_type=payload.project_type,
        publish_level=payload.publish_level,
    )
    session.add(proj)
    await session.commit()
    await session.refresh(proj)
    return ProjectOut(
        id=proj.id,
        name=proj.name,
        description=proj.description,
        project_type=proj.project_type,
        publish_level=proj.publish_level,
        created_at=proj.created_at.isoformat() if proj.created_at else None,
    )


@app.put("/projects/{project_id}", response_model=ProjectOut)
async def update_project(
    project_id: int,
    payload: ProjectUpdate,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """Update project (name, description, project_type, publish_level). Owner only."""
    email = _current_email(request)
    res = await session.execute(select(User).where(User.email == email))
    user = res.scalar_one()
    
    # Get project
    proj_res = await session.execute(select(Project).where(Project.id == project_id))
    proj = proj_res.scalar_one_or_none()
    if not proj:
        raise HTTPException(404, "Project not found")
    
    # Check ownership
    if proj.owner_id != user.id:
        raise HTTPException(403, "Only project owner can update")
    
    # Update fields if provided
    if payload.name is not None:
        proj.name = payload.name
    if payload.description is not None:
        proj.description = payload.description
    if payload.project_type is not None:
        proj.project_type = payload.project_type
    if payload.publish_level is not None:
        proj.publish_level = payload.publish_level
    
    await session.commit()
    await session.refresh(proj)
    
    return ProjectOut(
        id=proj.id,
        name=proj.name,
        description=proj.description,
        project_type=proj.project_type,
        publish_level=proj.publish_level,
        created_at=proj.created_at.isoformat() if proj.created_at else None,
    )


@app.get("/projects/{project_id}", response_model=ProjectOut)
async def get_project_detail(
    project_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    from .models import ProjectCollaborator
    
    email = _current_email(request)
    res = await session.execute(select(User).where(User.email == email))
    user = res.scalar_one()

    res = await session.execute(select(Project).where(Project.id == project_id))
    proj = res.scalar_one_or_none()
    if not proj:
        raise HTTPException(404, "Project not found")
    
    # Admin: Xem được PUBLIC projects + PRIVATE projects của chính mình
    # User: Xem được PUBLIC projects, PRIVATE projects của mình, hoặc project chia sẻ
    is_owner = proj.owner_id == user.id
    is_public = proj.publish_level == "public"
    
    if user.is_admin:
        # Admin có thể xem public projects hoặc private projects của chính họ
        if not (is_public or is_owner):
            raise HTTPException(403, "Admin can only view public projects or their own projects")
    else:
        # Check if user is collaborator
        res_collab = await session.execute(
            select(ProjectCollaborator).where(
                (ProjectCollaborator.project_id == project_id) &
                (ProjectCollaborator.user_id == user.id)
            )
        )
        is_collaborator = res_collab.scalar_one_or_none() is not None
        
        if not (is_owner or is_public or is_collaborator):
            raise HTTPException(403, "Not allowed")
    
    return ProjectOut(
        id=proj.id,
        name=proj.name,
        description=proj.description,
        project_type=proj.project_type,
        publish_level=proj.publish_level,
        created_at=proj.created_at.isoformat() if proj.created_at else None,
    )


@app.get("/projects", response_model=List[ProjectOut])
async def list_projects(
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    email = _current_email(request)
    res = await session.execute(select(User).where(User.email == email))
    user = res.scalar_one()

    # Admin: Thấy tất cả project PUBLIC (for Explore/AdminDashboard) + project PRIVATE của chính admin
    # User thường: Thấy tất cả project của mình (cả PRIVATE và PUBLIC) + public projects của người khác + project được chia sẻ
    from sqlalchemy import or_
    from .models import ProjectCollaborator
    
    if user.is_admin:
        # Admin thấy:
        # 1. Tất cả project PUBLIC (for Explore/AdminDashboard) - kể cả đã archived
        # 2. Project PRIVATE của chính admin (chưa archived)
        res = await session.execute(
            select(Project)
            .where(
                or_(
                    Project.publish_level == "public",  # All public projects (kể cả archived)
                    (Project.owner_id == user.id) & (Project.archived_by_owner == False)  # Admin's own non-archived projects
                )
            )
            .order_by(Project.created_at.desc())
        )
        projects = res.scalars().all()
    else:
        # User thường thấy:
        # 1. Project của mình CHƯA bị archive (owner_id) - cả PRIVATE và PUBLIC
        # 2. Project PUBLIC của người khác (for Explore) - kể cả đã archived
        # 3. Project được chia sẻ (ProjectCollaborator) - chưa archived
        res = await session.execute(
            select(Project)
            .where(
                or_(
                    (Project.owner_id == user.id) & (Project.archived_by_owner == False),  # Own non-archived projects
                    Project.publish_level == "public",  # All public projects (for Explore)
                    (Project.id.in_(
                        select(ProjectCollaborator.project_id).where(
                            ProjectCollaborator.user_id == user.id
                        )
                    )) & (Project.archived_by_owner == False)  # Shared non-archived projects
                )
            )
            .order_by(Project.created_at.desc())
        )
        projects = res.scalars().all()
    
    # Build response with additional info
    from .models import ImageItem, Annotation
    result = []
    for p in projects:
        # Get owner email
        owner_res = await session.execute(select(User).where(User.id == p.owner_id))
        owner = owner_res.scalar_one_or_none()
        
        # Count images
        img_count_res = await session.execute(
            select(ImageItem).where(ImageItem.project_id == p.id)
        )
        images = img_count_res.scalars().all()
        image_count = len(images)
        
        # Count annotations (via image_id since Annotation doesn't have project_id)
        annotation_count = 0
        for img in images:
            anno_res = await session.execute(
                select(Annotation).where(Annotation.image_id == img.id)
            )
            annotation_count += len(anno_res.scalars().all())
        
        # Get first image with annotations as thumbnail (prioritize images with inference results)
        thumbnail_url = None
        if images:
            # Try to find first image with annotations
            for img in images:
                anno_res = await session.execute(
                    select(Annotation).where(Annotation.image_id == img.id).limit(1)
                )
                if anno_res.scalar_one_or_none():
                    thumbnail_url = img.url
                    break
            
            # If no annotated images, use first image
            if not thumbnail_url and images:
                first_image = images[0]
                thumbnail_url = first_image.url
        
        result.append(ProjectOut(
            id=p.id,
            name=p.name,
            description=p.description,
            project_type=p.project_type,
            publish_level=p.publish_level,
            created_at=p.created_at.isoformat() if p.created_at else None,
            owner_email=owner.email if owner else None,
            image_count=image_count,
            annotation_count=annotation_count,
            thumbnail_url=thumbnail_url,
        ))
    
    return result


@app.post("/projects/{project_id}/share")
async def share_project(
    project_id: int,
    payload: ShareProjectRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """Share project with another user"""
    from .models import ProjectCollaborator
    
    email = _current_email(request)
    res = await session.execute(select(User).where(User.email == email))
    owner = res.scalar_one()

    # Check if project exists and user is owner
    res = await session.execute(select(Project).where(Project.id == project_id))
    project = res.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    if project.owner_id != owner.id:
        raise HTTPException(403, "Only owner can share project")
    
    # Find collaborator user
    res = await session.execute(select(User).where(User.email == payload.email.lower()))
    collaborator_user = res.scalar_one_or_none()
    if not collaborator_user:
        raise HTTPException(404, "User not found")
    
    # Check if already shared
    res = await session.execute(
        select(ProjectCollaborator).where(
            (ProjectCollaborator.project_id == project_id) & 
            (ProjectCollaborator.user_id == collaborator_user.id)
        )
    )
    existing = res.scalar_one_or_none()
    if existing:
        # Update role
        existing.role = payload.role
        await session.commit()
        return {"message": "Role updated", "role": existing.role}
    
    # Create new collaborator
    collab = ProjectCollaborator(
        project_id=project_id,
        user_id=collaborator_user.id,
        role=payload.role
    )
    session.add(collab)
    await session.commit()
    
    return {"message": "Project shared", "email": payload.email, "role": payload.role}

@app.get("/projects/{project_id}/collaborators")
async def list_collaborators(
    project_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """List collaborators of a project"""
    from .models import ProjectCollaborator
    
    email = _current_email(request)
    res = await session.execute(select(User).where(User.email == email))
    user = res.scalar_one()

    # Check if project exists and user has access
    res = await session.execute(select(Project).where(Project.id == project_id))
    project = res.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    
    # Only owner can see collaborators
    if project.owner_id != user.id:
        raise HTTPException(403, "Only owner can view collaborators")
    
    # Get collaborators
    res = await session.execute(
        select(ProjectCollaborator, User).where(
            (ProjectCollaborator.project_id == project_id) &
            (ProjectCollaborator.user_id == User.id)
        )
    )
    results = res.all()
    
    return [
        CollaboratorOut(
            user_id=collab.user_id,
            email=u.email,
            name=u.name,
            picture=u.picture,
            role=collab.role,
            created_at=collab.created_at.isoformat() if collab.created_at else None,
        )
        for collab, u in results
    ]

@app.delete("/projects/{project_id}/collaborators/{user_id}", status_code=204)
async def remove_collaborator(
    project_id: int,
    user_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """Remove collaborator from project"""
    from .models import ProjectCollaborator
    
    email = _current_email(request)
    res = await session.execute(select(User).where(User.email == email))
    owner = res.scalar_one()

    # Check if project exists and user is owner
    res = await session.execute(select(Project).where(Project.id == project_id))
    project = res.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    if project.owner_id != owner.id:
        raise HTTPException(403, "Only owner can remove collaborators")
    
    # Delete collaborator
    await session.execute(
        delete(ProjectCollaborator).where(
            (ProjectCollaborator.project_id == project_id) &
            (ProjectCollaborator.user_id == user_id)
        )
    )
    await session.commit()
    
    return Response(status_code=204)


@app.post("/projects/{project_id}/fork", response_model=ProjectOut)
async def fork_project(
    project_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """
    Fork a public project to user's own workspace.
    Creates a copy with all images and annotations, sets to private.
    """
    email = _current_email(request)
    res = await session.execute(select(User).where(User.email == email))
    user = res.scalar_one()
    
    # Get original project
    res = await session.execute(select(Project).where(Project.id == project_id))
    original = res.scalar_one_or_none()
    if not original:
        raise HTTPException(404, "Project not found")
    
    # Only allow forking public projects that user doesn't own
    if original.publish_level != "public":
        raise HTTPException(403, "Can only fork public projects")
    if original.owner_id == user.id:
        raise HTTPException(400, "Cannot fork your own project")
    
    # Create new project (fork)
    forked = Project(
        name=f"{original.name} (Fork)",
        owner_id=user.id,
        description=f"Forked from {original.name}",
        project_type=original.project_type,
        publish_level="private",  # Always private
    )
    session.add(forked)
    await session.flush()  # Get forked.id
    
    # Copy images
    res = await session.execute(select(ImageItem).where(ImageItem.project_id == project_id))
    original_images = res.scalars().all()
    
    image_id_map = {}  # old_id -> new_id
    for orig_img in original_images:
        new_img = ImageItem(
            project_id=forked.id,
            file_path=orig_img.file_path,
            url=orig_img.url,
            cloudinary_url=orig_img.cloudinary_url,
            width=orig_img.width,
            height=orig_img.height,
        )
        session.add(new_img)
        await session.flush()
        image_id_map[orig_img.id] = new_img.id
    
    # Copy annotations
    from .models import Annotation
    for old_img_id, new_img_id in image_id_map.items():
        res = await session.execute(
            select(Annotation).where(Annotation.image_id == old_img_id)
        )
        annotations = res.scalars().all()
        for anno in annotations:
            new_anno = Annotation(
                project_id=forked.id,
                image_id=new_img_id,
                data=anno.data,
                status=anno.status,
            )
            session.add(new_anno)
    
    await session.commit()
    await session.refresh(forked)
    
    return ProjectOut(
        id=forked.id,
        name=forked.name,
        description=forked.description,
        project_type=forked.project_type,
        publish_level=forked.publish_level,
        created_at=forked.created_at.isoformat() if forked.created_at else None,
    )


@app.delete("/projects/{project_id}", status_code=204)
async def delete_project(
    project_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> Response:
    email = _current_email(request)
    res = await session.execute(select(User).where(User.email == email))
    user = res.scalar_one()

    res = await session.execute(select(Project).where(Project.id == project_id))
    project = res.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    
    # Authorization logic:
    # - Owner có thể "xóa" project của mình
    #   + Private project: xóa thật khỏi hệ thống
    #   + Public project: chỉ archive (ẩn khỏi Projects nhưng còn trong Explore)
    # - Admin có thể xóa thật bất kỳ project public nào
    is_owner = project.owner_id == user.id
    is_admin = user.is_admin
    
    if not is_owner and not is_admin:
        raise HTTPException(403, "Not allowed")
    
    # Admin chỉ có thể xóa public projects của người khác
    if is_admin and not is_owner and project.publish_level != "public":
        raise HTTPException(403, "Admin can only delete public projects")
    
    # Logic xóa:
    # 1. Owner xóa private project → xóa thật
    # 2. Owner xóa public project → chỉ archive (đánh dấu archived_by_owner=True)
    # 3. Admin xóa public project → xóa thật
    
    if is_owner and not is_admin and project.publish_level == "public":
        # Owner "xóa" public project → archive thôi
        project.archived_by_owner = True
        await session.commit()
        return Response(status_code=204)
    
    # Các trường hợp khác: xóa thật
    res = await session.execute(select(ImageItem).where(ImageItem.project_id == project_id))
    images = res.scalars().all()
    image_ids = [img.id for img in images]

    if image_ids:
        await session.execute(delete(Annotation).where(Annotation.image_id.in_(image_ids)))
        await session.execute(delete(ImageItem).where(ImageItem.id.in_(image_ids)))
    await session.execute(delete(Project).where(Project.id == project_id))
    await session.commit()

    for image in images:
        delete_image_asset(image.url)

    return Response(status_code=204)

# --------------------------------------------------------------------------
# Images ingestion
# --------------------------------------------------------------------------
@app.post("/images/upload")
async def upload_images(
    project_id: int = Form(...),
    files: List[UploadFile] = File(...),
    session: AsyncSession = Depends(get_session),
    request: Request = None
):
    email = _current_email(request)
    res = await session.execute(select(User).where(User.email == email))
    user = res.scalar_one()
    res = await session.execute(select(Project).where(Project.id == project_id))
    project = res.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    if project.publish_level != "public" and project.owner_id != user.id:
        raise HTTPException(403, "Not allowed")

    out = []
    for f in files:
        filename = os.path.basename(f.filename or "")
        display_name = filename or "file"
        _, ext = os.path.splitext(filename)
        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=ext or ".tmp") as tmp:
                await f.seek(0)
                tmp.write(await f.read())
                tmp_path = tmp.name

            try:
                url, wdt, hgt = await upload_image_local(tmp_path, folder=f"project_{project_id}")
            except Exception as exc:
                raise HTTPException(status_code=500, detail=f"Failed to upload image '{display_name}': {exc}") from exc

            meta = {"filename": filename} if filename else None
            img = ImageItem(project_id=project_id, url=url, width=wdt, height=hgt, meta=meta)
            session.add(img)
            await session.flush()
            out.append({
                "id": img.id,
                "url": url,
                "width": wdt,
                "height": hgt,
                "filename": filename or None,
            })
        finally:
            await f.close()
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass

    await session.commit()
    return {"items": out}


@app.get("/projects/{project_id}/images")
async def list_project_images(
    project_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    email = _current_email(request)
    res = await session.execute(select(User).where(User.email == email))
    user = res.scalar_one()
    res = await session.execute(select(Project).where(Project.id == project_id))
    project = res.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    
    # Admin: Xem được PUBLIC projects + PRIVATE projects của chính mình
    # User: Xem được PUBLIC projects, PRIVATE projects của mình, hoặc project chia sẻ
    from .models import ProjectCollaborator
    
    is_owner = project.owner_id == user.id
    is_public = project.publish_level == "public"
    
    if user.is_admin:
        # Admin có thể xem public projects hoặc private projects của chính họ
        if not (is_public or is_owner):
            raise HTTPException(403, "Admin can only view public projects or their own projects")
    else:
        # Check if user is collaborator
        res_collab = await session.execute(
            select(ProjectCollaborator).where(
                (ProjectCollaborator.project_id == project_id) &
                (ProjectCollaborator.user_id == user.id)
            )
        )
        is_collaborator = res_collab.scalar_one_or_none() is not None
        
        if not (is_owner or is_public or is_collaborator):
            raise HTTPException(403, "Not allowed")
    res = await session.execute(
        select(ImageItem).where(ImageItem.project_id == project_id).order_by(ImageItem.created_at.desc())
    )
    images = res.scalars().all()
    image_ids = [img.id for img in images]
    latest_annotations: Dict[int, Annotation] = {}
    if image_ids:
        ann_res = await session.execute(
            select(Annotation)
            .where(Annotation.image_id.in_(image_ids), Annotation.approved.is_(True))
            .order_by(Annotation.created_at.desc())
        )
        for ann in ann_res.scalars():
            if ann.image_id not in latest_annotations:
                latest_annotations[ann.image_id] = ann
    def _serialize_instances(ann: Annotation) -> List[Dict[str, object]]:
        raw = None
        if ann.coco and isinstance(ann.coco, dict):
            raw = ann.coco.get("instances")
        if raw is None and ann.proposals and isinstance(ann.proposals, dict):
            raw = ann.proposals.get("instances")
        output: List[Dict[str, object]] = []
        if not isinstance(raw, list):
            return output
        for item in raw:
            if not isinstance(item, dict):
                continue
            bbox = item.get("bbox")
            if not isinstance(bbox, (list, tuple)) or len(bbox) != 4:
                continue
            try:
                x1, y1, x2, y2 = [int(float(value)) for value in bbox]
            except Exception:
                continue
            label_value = item.get("class_name", "")
            label = "" if label_value is None else str(label_value)
            embedding = item.get("embedding")
            if isinstance(embedding, (list, tuple)):
                embedding_list = [float(v) for v in embedding]
            else:
                embedding_list = None
            output.append({
                "bbox": [x1, y1, x2, y2],
                "confidence": float(item.get("confidence", 0.0)),
                "class_name": label,
                "embedding": embedding_list,
            })
        return output

    return [
        {
            "id": img.id,
            "url": img.url,
            "width": img.width,
            "height": img.height,
            "filename": (img.meta or {}).get("filename") if img.meta else None,
            "created_at": img.created_at.isoformat() if img.created_at else None,
            "annotation_id": latest_annotations.get(img.id).id if latest_annotations.get(img.id) else None,
            "annotation_updated_at": (
                latest_annotations.get(img.id).created_at.isoformat()
                if latest_annotations.get(img.id) and latest_annotations.get(img.id).created_at
                else None
            ),
            "annotation_preview": _serialize_instances(latest_annotations[img.id]) if img.id in latest_annotations else [],
        }
        for img in images
    ]


@app.get("/images/{image_id}/annotations/latest")
async def get_latest_annotation(
    image_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    email = _current_email(request)
    res = await session.execute(select(User).where(User.email == email))
    user = res.scalar_one()
    res = await session.execute(select(ImageItem).where(ImageItem.id == image_id))
    image = res.scalar_one_or_none()
    if not image:
        raise HTTPException(404, "Image not found")
    res = await session.execute(select(Project).where(Project.id == image.project_id))
    project = res.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    if project.publish_level != "public" and project.owner_id != user.id:
        raise HTTPException(403, "Not allowed")
    ann_res = await session.execute(
        select(Annotation)
        .where(Annotation.image_id == image.id, Annotation.approved.is_(True))
        .order_by(Annotation.created_at.desc())
    )
    ann = ann_res.scalars().first()
    if not ann:
        return {"annotation_id": None, "instances": [], "updated_at": None}
    instances = []
    if ann.coco and isinstance(ann.coco, dict):
        instances = ann.coco.get("instances") or []
    if not instances and ann.proposals and isinstance(ann.proposals, dict):
        instances = ann.proposals.get("instances") or []
    return {
        "annotation_id": ann.id,
        "instances": instances,
        "updated_at": ann.created_at.isoformat() if ann.created_at else None,
    }


@app.get("/projects/{project_id}/prompt-embeddings")
async def get_project_prompt_embeddings(
    project_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    email = _current_email(request)
    res = await session.execute(select(User).where(User.email == email))
    user = res.scalar_one()
    res = await session.execute(select(Project).where(Project.id == project_id))
    project = res.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    if project.publish_level != "public" and project.owner_id != user.id:
        raise HTTPException(403, "Not allowed")
    data = _load_prompt_library(project_id)
    return data


@app.delete("/images/{image_id}", status_code=204)
async def delete_image_item(
    image_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> Response:
    email = _current_email(request)
    res = await session.execute(select(User).where(User.email == email))
    user = res.scalar_one()

    res = await session.execute(
        select(ImageItem, Project.owner_id)
        .join(Project, ImageItem.project_id == Project.id)
        .where(ImageItem.id == image_id)
    )
    result = res.first()
    if not result:
        raise HTTPException(404, "Image not found")
    image, owner_id = result
    if owner_id != user.id:
        raise HTTPException(403, "Not allowed")

    await session.execute(delete(Annotation).where(Annotation.image_id == image.id))
    await session.delete(image)
    await session.commit()

    delete_image_asset(image.url)
    return Response(status_code=204)

# --------------------------------------------------------------------------
# Inference (3 modes)
# --------------------------------------------------------------------------
@app.post("/infer/text")
async def infer_text(
    payload: InferenceParamsText,
    session: AsyncSession = Depends(get_session),
):
    check_ai_available()
    res = await session.execute(select(ImageItem).where(
        ImageItem.id == payload.image_id,
        ImageItem.project_id == payload.project_id
    ))
    img = res.scalar_one_or_none()
    if not img:
        raise HTTPException(404, "Image not found")

    proposals = ys.infer_text(
        img.url, payload.texts, payload.model_id, payload.image_size, payload.conf, payload.iou
    )

    ann = Annotation(image_id=img.id, proposals=proposals, approved=False)
    session.add(ann)
    await session.commit()
    await session.refresh(ann)
    return {"annotation_id": ann.id, "proposals": proposals}


@app.post("/infer/boxes")
async def infer_boxes(
    payload: InferenceParamsBoxes,
    session: AsyncSession = Depends(get_session),
):
    check_ai_available()
    res = await session.execute(select(ImageItem).where(
        ImageItem.id == payload.image_id,
        ImageItem.project_id == payload.project_id
    ))
    img = res.scalar_one_or_none()
    if not img:
        raise HTTPException(404, "Image not found")

    boxes = [[b.x1, b.y1, b.x2, b.y2] for b in payload.boxes]
    prompts = {"bboxes": np.array(boxes), "cls": np.zeros(len(boxes), dtype=int)}
    proposals = ys.infer_visual(
        img.url,
        prompts,
        payload.model_id,
        payload.image_size,
        payload.conf,
        payload.iou,
        cross_image_url=payload.cross_image_url,
    )

    ann = Annotation(image_id=img.id, proposals=proposals, approved=False)
    session.add(ann)
    await session.commit()
    await session.refresh(ann)
    return {"annotation_id": ann.id, "proposals": proposals}


@app.post("/infer/visual")
async def infer_visual(
    payload: InferenceParamsVisual,
    session: AsyncSession = Depends(get_session),
):
    check_ai_available()
    res = await session.execute(select(ImageItem).where(
        ImageItem.id == payload.image_id,
        ImageItem.project_id == payload.project_id
    ))
    img = res.scalar_one_or_none()
    if not img:
        raise HTTPException(404, "Image not found")

    cross_image_url = None
    if payload.target_image_id is not None:
        res = await session.execute(select(ImageItem).where(
            ImageItem.id == payload.target_image_id,
            ImageItem.project_id == payload.project_id
        ))
        target = res.scalar_one_or_none()
        if not target:
            raise HTTPException(404, "Target image not found")
        cross_image_url = target.url
    else:
        target = None

    label_queue = deque(label.strip() for label in (payload.labels or []) if label and label.strip())

    def consume_label(default: str) -> str:
        if label_queue:
            candidate = label_queue.popleft()
            if candidate:
                return candidate
        return default

    embeddings_input: Optional[List[List[float]]] = None
    embedding_labels: List[str] = []
    if payload.embeddings:
        filtered_embeddings: List[List[float]] = []
        for embedding in payload.embeddings:
            if not isinstance(embedding, (list, tuple)):
                continue
            if not embedding:
                continue
            try:
                vector = [float(value) for value in embedding]
            except (TypeError, ValueError):
                continue
            if not vector:
                continue
            filtered_embeddings.append(vector)
            embedding_labels.append(consume_label(f"prompt_{len(embedding_labels) + 1}"))
        if filtered_embeddings:
            embeddings_input = filtered_embeddings

    prompts: Optional[Dict[str, np.ndarray]] = None
    prompt_labels: List[str] = []
    if payload.prompt_type == "bboxes":
        if payload.boxes:
            boxes = [[b.x1, b.y1, b.x2, b.y2] for b in payload.boxes]
            prompts = {
                "bboxes": np.array(boxes, dtype=np.float32),
                "cls": np.zeros(len(boxes), dtype=np.int64),
            }
            prompt_labels = [
                consume_label(f"prompt_{len(embedding_labels) + idx + 1}") for idx in range(len(boxes))
            ]
        elif embeddings_input is None:
            raise HTTPException(400, "No bounding boxes provided")
    elif payload.prompt_type == "masks":
        if not payload.mask_base64:
            raise HTTPException(400, "Mask data is required for mask prompts")
        mask = _decode_mask(payload.mask_base64, target_size=(img.width, img.height))
        prompts = {"masks": [mask], "cls": np.zeros(1, dtype=np.int64)}
        prompt_labels = [consume_label("mask_prompt")]
    else:
        raise HTTPException(400, "Unsupported prompt type")

    combined_labels = embedding_labels + prompt_labels

    proposals = ys.infer_visual(
        img.url,
        prompts if prompts is not None else {},
        payload.model_id,
        payload.image_size,
        payload.conf,
        payload.iou,
        cross_image_url=cross_image_url,
        labels=combined_labels if combined_labels else None,
        embeddings=embeddings_input,
        capture_embeddings=bool(payload.capture_embeddings and prompts is not None),
        detect_self_image=payload.detect_self_image,
    )

    ann = Annotation(image_id=img.id, proposals=proposals, approved=False)
    session.add(ann)
    await session.commit()
    await session.refresh(ann)
    return {"annotation_id": ann.id, "proposals": proposals}


@app.post("/sam2/infer")
async def sam2_infer_endpoint(
    payload: Sam2InferenceParams,
    session: AsyncSession = Depends(get_session),
):
    check_ai_available()
    res = await session.execute(select(ImageItem).where(
        ImageItem.id == payload.image_id,
        ImageItem.project_id == payload.project_id
    ))
    img = res.scalar_one_or_none()
    if not img:
        raise HTTPException(404, "Image not found")

    prompt_payload = _sam2_prompt_payload(payload)
    masks_dir = local_upload_root() / f"project_{payload.project_id}" / "sam2_masks"

    try:
        proposals = sam2.infer_image(
            image_url=img.url,
            prompt_type=payload.prompt_type,
            prompt_payload=prompt_payload,
            model_id=payload.model_id,
            threshold=payload.threshold,
            multimask_output=payload.multimask_output,
            save_binary_masks=payload.save_masks,
            masks_dir=str(masks_dir),
            text_box_threshold=payload.text_box_threshold,
            text_threshold=payload.text_threshold,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    ann = Annotation(image_id=img.id, proposals=proposals, approved=False)
    session.add(ann)
    await session.commit()
    await session.refresh(ann)
    return {"annotation_id": ann.id, "proposals": proposals}


@app.post("/sam2/batch")
async def sam2_batch_endpoint(
    payload: Sam2BatchParams,
    session: AsyncSession = Depends(get_session),
):
    check_ai_available()
    if not payload.image_ids:
        raise HTTPException(400, "No image IDs provided")
    res = await session.execute(select(ImageItem).where(
        ImageItem.project_id == payload.project_id,
        ImageItem.id.in_(payload.image_ids)
    ))
    images = res.scalars().all()
    if len(images) != len(set(payload.image_ids)):
        raise HTTPException(404, "Some images were not found for this project")
    records = [(img.id, img.url) for img in images]
    prompt_payload = _sam2_prompt_payload(payload)
    masks_dir = local_upload_root() / f"project_{payload.project_id}" / "sam2_masks"
    loop = asyncio.get_running_loop()
    try:
        batch_results = await loop.run_in_executor(
            None,
            lambda: sam2.batch_infer(
                records,
                payload.prompt_type,
                prompt_payload,
                model_id=payload.model_id,
                threshold=payload.threshold,
                augmentations=payload.augmentations or [],
                num_workers=max(1, payload.num_workers),
                save_binary_masks=payload.save_masks,
                masks_dir=str(masks_dir),
            ),
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    persisted: List[Dict] = []
    for image_id, proposals in batch_results:
        aug_label = proposals.get("diagnostics", {}).get("augmentation", "original")
        if aug_label != "original":
            continue
        ann = Annotation(image_id=image_id, proposals=proposals, approved=False)
        session.add(ann)
        await session.flush()
        persisted.append({"image_id": image_id, "annotation_id": ann.id})
    await session.commit()
    return {
        "items": [
            {
                "image_id": image_id,
                "augmentation": proposals.get("diagnostics", {}).get("augmentation"),
                "proposals": proposals,
            }
            for image_id, proposals in batch_results
        ],
        "persisted": persisted,
    }


@app.post("/sam2/video")
async def sam2_video_endpoint(payload: Sam2VideoParams):
    check_ai_available()
    prompt_payload = _sam2_prompt_payload(payload)
    loop = asyncio.get_running_loop()
    try:
        frames = await loop.run_in_executor(
            None,
            lambda: sam2.infer_video(
                payload.video_path,
                payload.prompt_type,
                prompt_payload,
                model_id=payload.model_id,
                threshold=payload.threshold,
                frame_stride=max(1, payload.frame_stride),
                max_frames=payload.max_frames,
                save_binary_masks=payload.save_masks,
            ),
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"frames": frames, "count": len(frames)}


@app.post("/sam2/evaluate")
async def sam2_evaluate_endpoint(payload: Sam2EvalParams):
    check_ai_available()
    metrics = sam2.evaluate_predictions(payload.predictions, payload.ground_truth)
    return metrics


@app.post("/infer/promptfree")
async def infer_prompt_free(
    payload: InferenceParamsPromptFree,
    session: AsyncSession = Depends(get_session),
):
    check_ai_available()
    res = await session.execute(select(ImageItem).where(
        ImageItem.id == payload.image_id,
        ImageItem.project_id == payload.project_id
    ))
    img = res.scalar_one_or_none()
    if not img:
        raise HTTPException(404, "Image not found")

    proposals = ys.infer_prompt_free(
        img.url, payload.vocab, payload.model_id, payload.image_size, payload.conf, payload.iou
    )

    ann = Annotation(image_id=img.id, proposals=proposals, approved=False)
    session.add(ann)
    await session.commit()
    await session.refresh(ann)
    return {"annotation_id": ann.id, "proposals": proposals}

# --------------------------------------------------------------------------
# Review & dataset export
# --------------------------------------------------------------------------
@app.post("/review")
async def review(
    decision: ReviewDecision,
    session: AsyncSession = Depends(get_session),
):
    res = await session.execute(select(Annotation).where(Annotation.id == decision.annotation_id))
    ann = res.scalar_one_or_none()
    if not ann:
        raise HTTPException(404, "Annotation not found")

    if decision.instances is not None:
        sanitized_instances = []
        existing_instances = (ann.proposals or {}).get("instances") if ann.proposals else []
        for inst in decision.instances:
            x1, y1, x2, y2 = inst.bbox
            bbox = [int(x1), int(y1), int(x2), int(y2)]
            embedding = inst.embedding
            if embedding is None:
                # fall back to existing embedding for this instance if available
                if existing_instances:
                    idx = len(sanitized_instances)
                    if idx < len(existing_instances):
                        existing_embedding = existing_instances[idx].get("embedding")
                        if isinstance(existing_embedding, list):
                            flat_embedding = []
                            for value in existing_embedding:
                                if isinstance(value, (int, float)):
                                    flat_embedding.append(float(value))
                                elif isinstance(value, list):
                                    flat_embedding.extend(float(v) for v in value if isinstance(v, (int, float)))
                            if flat_embedding:
                                embedding = flat_embedding
            sanitized = {
                "bbox": bbox,
                "confidence": float(inst.confidence),
                "class_name": inst.class_name,
            }
            clean_embedding = None
            if inst.embedding is not None:
                clean_embedding = [float(v) for v in inst.embedding if isinstance(v, (int, float))]
            elif embedding is not None:
                clean_embedding = embedding
            if clean_embedding:
                sanitized["embedding"] = clean_embedding
            elif embedding is not None:
                sanitized["embedding"] = embedding
            sanitized_instances.append(sanitized)
        proposals = ann.proposals.copy() if ann.proposals else {}
        proposals["instances"] = sanitized_instances
        ann.proposals = proposals

    if decision.approve:
        inst = ann.proposals.get("instances", [])
        keep = inst if decision.keep_indices is None else [inst[i] for i in decision.keep_indices]
        ann.coco = {"instances": keep}
        ann.approved = True
    else:
        ann.approved = False

    await session.commit()
    return {"approved": ann.approved}


@app.post("/annotations/manual")
async def save_manual_annotation(
    payload: ManualAnnotationSubmit,
    session: AsyncSession = Depends(get_session),
):
    """
    Save or create a manual annotation from user-drawn boxes.
    Can either create a new annotation or update an existing one.
    """
    res = await session.execute(select(ImageItem).where(
        ImageItem.id == payload.image_id,
        ImageItem.project_id == payload.project_id
    ))
    img = res.scalar_one_or_none()
    if not img:
        raise HTTPException(404, "Image not found")

    # Validate and sanitize instances
    sanitized_instances = []
    for inst in payload.instances:
        if not inst.class_name or not inst.class_name.strip():
            raise HTTPException(400, "Each instance must have a class_name")
        
        bbox = [int(v) for v in inst.bbox]
        if len(bbox) != 4:
            raise HTTPException(400, "Each bbox must have 4 values [x1, y1, x2, y2]")
        
        # Normalize bbox
        x1, y1, x2, y2 = bbox
        x1, x2 = min(x1, x2), max(x1, x2)
        y1, y2 = min(y1, y2), max(y1, y2)
        
        sanitized_instances.append({
            "bbox": [x1, y1, x2, y2],
            "confidence": float(inst.confidence),
            "class_name": inst.class_name.strip(),
            "instance_name": f"{inst.class_name.strip()}_1",
        })

    # Build proposals dict
    proposals = {
        "instances": sanitized_instances,
        "prompt_labels": [],
        "prompt_embeddings": [],
        "manual_annotation": True,  # Flag to indicate this is manually created
    }

    # Either update existing annotation or create new one
    if payload.annotation_id:
        # Update existing
        res = await session.execute(select(Annotation).where(
            Annotation.id == payload.annotation_id,
            Annotation.image_id == payload.image_id
        ))
        ann = res.scalar_one_or_none()
        if not ann:
            raise HTTPException(404, "Annotation not found")
        ann.proposals = proposals
    else:
        # Create new
        ann = Annotation(image_id=img.id, proposals=proposals, approved=False)
        session.add(ann)
    
    await session.commit()
    await session.refresh(ann)
    return {
        "annotation_id": ann.id,
        "proposals": proposals,
        "message": "Manual annotation saved successfully"
    }


@app.post("/export/dataset")
async def export_dataset(
    payload: DatasetExportRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    email = _current_email(request)
    res = await session.execute(select(User).where(User.email == email))
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")

    res = await session.execute(select(Project).where(Project.id == payload.project_id))
    project = res.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    if project.owner_id != user.id and not user.is_admin:
        raise HTTPException(403, "Not allowed to export this project")

    res = await session.execute(select(ImageItem).where(ImageItem.project_id == project.id))
    images = res.scalars().all()
    if not images:
        raise HTTPException(400, "No images available for export")

    res = await session.execute(
        select(Annotation)
        .join(ImageItem, Annotation.image_id == ImageItem.id)
        .where(
            ImageItem.project_id == project.id,
            Annotation.approved == True,  # noqa: E712
        )
    )
    approved_anns = res.scalars().all()
    ann_map: Dict[int, dict] = {}
    ann_ts: Dict[int, float] = {}
    for ann in approved_anns:
        ts_value = ann_ts.get(ann.image_id)
        current_ts = ann.created_at.timestamp() if ann.created_at else 0.0
        if ts_value is None or current_ts > ts_value:
            ann_ts[ann.image_id] = current_ts
            ann_map[ann.image_id] = ann.coco or {}

    labeled_records = []
    for image in images:
        ann_payload = ann_map.get(image.id)
        instances = (ann_payload or {}).get("instances") if ann_payload else None
        if not instances:
            continue
        labeled_records.append((image, ann_payload))

    if not labeled_records:
        raise HTTPException(400, "No approved annotations available for export")

    ratios = {
        "train": payload.split.train,
        "val": payload.split.val,
        "test": payload.split.test,
    }

    try:
        url = await _build_dataset_zip(project, labeled_records, payload.format, ratios)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except requests.HTTPError as exc:
        raise HTTPException(exc.response.status_code if exc.response else 502, "Failed to download image assets") from exc
    except Exception as exc:  # pragma: no cover - unexpected failures
        raise HTTPException(500, "Failed to build dataset export") from exc

    return {"format": payload.format, "url": url}


@app.post("/export/coco")
async def export_coco(project_id: int, session: AsyncSession = Depends(get_session)):
    # Images
    res = await session.execute(select(ImageItem).where(ImageItem.project_id == project_id))
    images = res.scalars().all()
    image_map = {im.id: im for im in images}

    # Approved anns
    res = await session.execute(
        select(Annotation)
        .join(ImageItem, Annotation.image_id == ImageItem.id)
        .where(ImageItem.project_id == project_id, Annotation.approved == True)
    )
    anns = res.scalars().all()

    coco_images = [{
        "id": im.id,
        "file_name": image_map[im.id].url.split("/")[-1],
        "width": im.width,
        "height": im.height
    } for im in images]

    class_names = set()
    for a in anns:
        for inst in a.coco.get("instances", []):
            class_names.add(inst["class_name"])
    categories = [{"id": i + 1, "name": name} for i, name in enumerate(sorted(class_names))]
    cat2id = {c["name"]: c["id"] for c in categories}

    coco_annotations = []
    for a in anns:
        coco_annotations += proposals_to_coco_ann(a.image_id, a.coco, cat2id)

    coco = build_coco(coco_images, coco_annotations, categories)

    tmp_dir = tempfile.gettempdir()
    path = os.path.join(tmp_dir, f"project_{project_id}_coco.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(coco, f, ensure_ascii=False)

    try:
        url = await upload_coco_json(f"project_{project_id}", path)
    finally:
        try:
            os.remove(path)
        except OSError:
            pass
    return {"coco_url": url}
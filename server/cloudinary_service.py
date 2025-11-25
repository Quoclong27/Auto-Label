import os
import shutil
from pathlib import Path
from typing import List, Tuple, Optional
from urllib.parse import urlparse, unquote

from PIL import Image
import cloudinary
import cloudinary.uploader

from .deps import get_settings

cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    secure=True,
)

_REQUIRED_ENV = ("CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET")
_USE_CLOUDINARY = all(os.getenv(key) for key in _REQUIRED_ENV)
_LOCAL_ROOT = Path(
    os.getenv("LOCAL_UPLOAD_ROOT")
    or Path(__file__).resolve().parent.parent / "uploads"
).resolve()


def using_cloudinary() -> bool:
    return _USE_CLOUDINARY


def local_upload_root() -> Path:
    _LOCAL_ROOT.mkdir(parents=True, exist_ok=True)
    return _LOCAL_ROOT


def resolve_asset_path(url: str) -> Optional[Path]:
    if not url:
        return None
    parsed = urlparse(url)
    if parsed.scheme == "file":
        return Path(unquote(parsed.path))
    if parsed.scheme in ("http", "https"):
        if not _USE_CLOUDINARY and parsed.path.startswith("/uploads/"):
            relative = unquote(parsed.path[len("/uploads/"):]).lstrip("/")
            return local_upload_root() / relative
    if parsed.scheme == "":
        candidate = Path(url)
        if candidate.exists():
            return candidate
    return None


def _cloudinary_public_id(url: str) -> Optional[str]:
    if not url:
        return None
    parsed = urlparse(url)
    if "/upload/" not in parsed.path:
        return None
    public_part = parsed.path.split("/upload/", 1)[1].lstrip("/")
    if "." in public_part:
        public_part = public_part.rsplit(".", 1)[0]
    return public_part or None


def _safe_segments(path_value: str) -> List[str]:
    return [
        part
        for part in path_value.split("/")
        if part and part not in {".", ".."}
    ]


async def upload_image_local(path: str, folder: str) -> Tuple[str, int, int]:
    if _USE_CLOUDINARY:
        res = cloudinary.uploader.upload(path, folder=folder, overwrite=True)
        return res["secure_url"], res["width"], res["height"]

    dest_dir = local_upload_root().joinpath(*_safe_segments(folder))
    dest_dir.mkdir(parents=True, exist_ok=True)

    source_path = Path(path)
    filename = source_path.name
    dest_path = dest_dir / filename
    stem = dest_path.stem
    suffix = dest_path.suffix
    counter = 1
    while dest_path.exists():
        dest_path = dest_dir / f"{stem}_{counter}{suffix}"
        counter += 1

    shutil.copy2(source_path, dest_path)

    with Image.open(dest_path) as img:
        width, height = img.size

    settings = get_settings()
    base_url = settings.backend_url.rstrip("/")
    url = f"{base_url}/uploads/{'/'.join(_safe_segments(folder) + [dest_path.name])}"
    return url, width, height


async def upload_raw_file(folder: str, file_path: str, filename: str) -> str:
    target_folder = "/".join(_safe_segments(folder))
    if _USE_CLOUDINARY:
        stem = Path(filename).stem
        fmt = Path(filename).suffix.lstrip(".") or None
        upload_kwargs = {
            "folder": target_folder,
            "resource_type": "raw",
            "overwrite": True,
            "public_id": stem,
        }
        if fmt:
            upload_kwargs["format"] = fmt
        res = cloudinary.uploader.upload(file_path, **upload_kwargs)
        return res["secure_url"]

    dest_dir = local_upload_root().joinpath(*target_folder.split("/")) if target_folder else local_upload_root()
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / filename
    shutil.copy2(file_path, dest_path)
    settings = get_settings()
    base_url = settings.backend_url.rstrip("/")
    return f"{base_url}/uploads/{'/'.join(_safe_segments(folder) + [dest_path.name])}"


async def upload_coco_json(project_name: str, json_path: str) -> str:
    return await upload_raw_file(f"{project_name}/coco", json_path, "annotations.json")


def delete_image_asset(url: str) -> None:
    if not url:
        return
    if _USE_CLOUDINARY:
        public_id = _cloudinary_public_id(url)
        if public_id:
            try:
                cloudinary.uploader.destroy(public_id, invalidate=True)
            except Exception:
                pass
    local_path = resolve_asset_path(url)
    if local_path and local_path.exists():
        try:
            local_path.unlink()
        except OSError:
            pass

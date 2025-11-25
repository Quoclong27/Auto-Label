from typing import List, Dict

def build_coco(images: List[Dict], annotations: List[Dict], categories: List[Dict]) -> Dict:
    return {
        "images": images,
        "annotations": annotations,
        "categories": categories,
    }

def proposals_to_coco_ann(image_id: int, proposals: Dict, category_name_to_id: Dict[str, int]):
    anns = []
    for i, p in enumerate(proposals.get("instances", [])):
        cls_name = p["class_name"]
        x1, y1, x2, y2 = p["bbox"]
        w = x2 - x1
        h = y2 - y1
        anns.append({
            "id": i + 1,
            "image_id": image_id,
            "category_id": category_name_to_id.get(cls_name, 1),
            "bbox": [x1, y1, w, h],
            "area": w * h,
            "iscrowd": 0,
        })
    return anns

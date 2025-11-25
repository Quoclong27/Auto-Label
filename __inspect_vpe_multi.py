import numpy as np
from server.yoloe_service import _get_model
from ultralytics.models.yolo.yoloe.predict_vp import YOLOEVPSegPredictor

model = _get_model('yoloe-v8l')
boxes = np.array([
    [221.52, 405.8, 344.98, 857.54],
    [120.0, 425.0, 160.0, 445.0],
], dtype=float)
prompts = {'bboxes': boxes, 'cls': np.array([0, 1])}
image = 'yoloe/ultralytics/assets/bus.jpg'
res = model.predict(source=image, imgsz=640, conf=0.25, iou=0.7, return_vpe=True, prompts=prompts, predictor=YOLOEVPSegPredictor)
print('len', len(res))
print('vpe shape', model.predictor.vpe.shape)
print('names', model.names)
model.predictor = None

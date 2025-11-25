import numpy as np
from ultralytics import YOLOE

model = YOLOE('yoloe/pretrain/yoloe-v8l-seg.pt')
model.eval()
model.to('cpu')
image = 'yoloe/ultralytics/assets/bus.jpg'
res = model.predict(source=image, imgsz=640, conf=0.25, iou=0.7)
result = res[0]
print('has probs', hasattr(result, 'probs'))
print('probs', result.probs)
print('boxes shape', result.boxes.cls.shape)
print('boxes conf shape', result.boxes.conf.shape)

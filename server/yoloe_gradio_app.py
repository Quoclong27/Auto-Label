import torch
import numpy as np
import gradio as gr
import supervision as sv
from ultralytics import YOLOE
from ultralytics.utils.torch_utils import smart_inference_mode
from ultralytics.models.yolo.yoloe.predict_vp import YOLOEVPSegPredictor
from gradio_image_prompter import ImagePrompter
from huggingface_hub import hf_hub_download

def init_model(model_id, is_pf=False):
    filename = f"{model_id}-seg.pt" if not is_pf else f"{model_id}-seg-pf.pt"
    path = hf_hub_download(repo_id="jameslahm/yoloe", filename=filename)
    model = YOLOE(path)
    model.eval()
    model.to("cuda" if torch.cuda.is_available() else "cpu")
    return model

@smart_inference_mode()
def yoloe_inference(image, prompts, target_image, model_id, image_size, conf_thresh, iou_thresh, prompt_type):
    model = init_model(model_id)
    kwargs = {}
    if prompt_type == "Text":
        texts = prompts["texts"]
        model.set_classes(texts, model.get_text_pe(texts))
    elif prompt_type == "Visual":
        kwargs = dict(prompts=prompts, predictor=YOLOEVPSegPredictor)
        if target_image:
            model.predict(source=image, imgsz=image_size, conf=conf_thresh, iou=iou_thresh, return_vpe=True, **kwargs)
            model.set_classes(["object0"], model.predictor.vpe)
            model.predictor = None
            image = target_image
            kwargs = {}
    elif prompt_type == "Prompt-free":
        vocab = model.get_vocab(prompts["texts"])
        model = init_model(model_id, is_pf=True)
        model.set_vocab(vocab, names=prompts["texts"])
        model.model.model[-1].is_fused = True
        model.model.model[-1].conf = 0.001
        model.model.model[-1].max_det = 1000

    results = model.predict(source=image, imgsz=image_size, conf=conf_thresh, iou=iou_thresh, **kwargs)
    detections = sv.Detections.from_ultralytics(results[0])

    thickness = sv.calculate_optimal_line_thickness(resolution_wh=image.size)
    text_scale = sv.calculate_optimal_text_scale(resolution_wh=image.size)

    labels = [f"{cn} {cf:.2f}" for cn, cf in zip(detections['class_name'], detections.confidence)]

    annotated = image.copy()
    annotated = sv.MaskAnnotator(color_lookup=sv.ColorLookup.INDEX, opacity=0.4).annotate(scene=annotated, detections=detections)
    annotated = sv.BoxAnnotator(color_lookup=sv.ColorLookup.INDEX, thickness=thickness).annotate(scene=annotated, detections=detections)
    annotated = sv.LabelAnnotator(color_lookup=sv.ColorLookup.INDEX, text_scale=text_scale, smart_position=True).annotate(scene=annotated, detections=detections, labels=labels)
    return annotated

with gr.Blocks() as demo:
    gr.HTML("""
    <h1 style='text-align: center'>
      <img src="/file=figures/logo.png" width="15%" style="display:inline;padding-bottom:10px">
      YOLOE: Real-Time Seeing Anything (Gradio demo)
    </h1>
    """)
    with gr.Row():
        with gr.Column():
            raw_image = gr.Image(type="pil", label="Image", interactive=True)
            texts = gr.Textbox(label="Input Texts", value='person,bus')
            model_id = gr.Dropdown(choices=["yoloe-v8s","yoloe-v8m","yoloe-v8l","yoloe-11s","yoloe-11m","yoloe-11l"], value="yoloe-v8l")
            image_size = gr.Slider(320,1280,step=32,value=640,label="Image Size")
            conf_thresh = gr.Slider(0.0,1.0,step=0.05,value=0.25,label="Confidence")
            iou_thresh = gr.Slider(0.0,1.0,step=0.05,value=0.70,label="IoU")
            run = gr.Button("Run (Text)")
        with gr.Column():
            output_image = gr.Image(type="numpy", label="Annotated")

    def run_text(img, texts, model_id, imgsz, conf, iou):
        prompts = {"texts": [t.strip() for t in texts.split(',')]}
        return yoloe_inference(img, prompts, None, model_id, imgsz, conf, iou, "Text")

    run.click(run_text, [raw_image, texts, model_id, image_size, conf_thresh, iou_thresh], [output_image])

if __name__ == "__main__":
    demo.launch()

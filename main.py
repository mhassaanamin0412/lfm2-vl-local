import io
import os
from pathlib import Path
from typing import Optional

import torch
from PIL import Image, UnidentifiedImageError
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from transformers import AutoProcessor, AutoModelForImageTextToText

load_dotenv()

MODEL_PATH = Path(os.getenv("MODEL_PATH", r"D:\lfm2-vl-local\model")).expanduser()
MAX_IMAGE_BYTES = 12 * 1024 * 1024
MAX_NEW_TOKENS = 10000

app = FastAPI(title="LFM2-VL Local Vision API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

processor = None
model = None
load_error: Optional[str] = None


@app.on_event("startup")
def load_model():
    global processor, model, load_error
    try:
        if not (MODEL_PATH / "config.json").is_file():
            raise FileNotFoundError(
                f"config.json was not found in MODEL_PATH={MODEL_PATH}. "
                "Set MODEL_PATH in backend/.env to the model folder."
            )

        processor = AutoProcessor.from_pretrained(
            str(MODEL_PATH),
            local_files_only=True,
        )
        model = AutoModelForImageTextToText.from_pretrained(
            str(MODEL_PATH),
            dtype=torch.float32,
            device_map="cpu",
            low_cpu_mem_usage=True,
            local_files_only=True,
        )
        model.eval()
    except Exception as exc:
        load_error = f"{type(exc).__name__}: {exc}"
        print(f"Model loading failed: {load_error}")


@app.get("/api/health")
def health():
    if model is not None and processor is not None:
        return {"status": "ready", "model": "LiquidAI/LFM2-VL-450M"}
    return {"status": "error", "message": load_error or "Model is still loading."}


@app.post("/api/chat")
async def chat(
    question: str = Form(...),
    image: Optional[UploadFile] = File(None),
):
    if model is None or processor is None:
        raise HTTPException(
            status_code=503,
            detail=load_error or "Model is not ready. Check the backend terminal.",
        )

    question = question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Please enter a message.")

    content = []
    if image is not None and image.filename:
        raw = await image.read()
        if not raw:
            raise HTTPException(status_code=400, detail="The uploaded image is empty.")
        if len(raw) > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail="Image must be 12 MB or smaller.")
        try:
            with Image.open(io.BytesIO(raw)) as source:
                img = source.convert("RGB")
        except (UnidentifiedImageError, OSError):
            raise HTTPException(status_code=400, detail="Please upload a valid JPG, PNG, or WebP image.")
        content.append({"type": "image", "image": img})
    content.append({"type": "text", "text": question})
    messages = [{"role": "user", "content": content}]

    try:
        inputs = processor.apply_chat_template(
            messages,
            add_generation_prompt=True,
            tokenize=True,
            return_dict=True,
            return_tensors="pt",
        )
        inputs = {
            key: value.to("cpu") if isinstance(value, torch.Tensor) else value
            for key, value in inputs.items()
        }

        with torch.inference_mode():
            output = model.generate(
                **inputs,
                max_new_tokens=MAX_NEW_TOKENS,
                do_sample=False,
            )

        prompt_length = inputs["input_ids"].shape[1]
        answer = processor.decode(
            output[0, prompt_length:],
            skip_special_tokens=True,
            clean_up_tokenization_spaces=False,
        ).strip()

        return {"answer": answer or "The model did not return text."}
    except Exception as exc:
        print(f"Inference failed: {type(exc).__name__}: {exc}")
        raise HTTPException(status_code=500, detail=f"Inference failed: {type(exc).__name__}: {exc}")

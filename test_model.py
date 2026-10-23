
from pathlib import Path

import torch
from PIL import Image
from transformers import AutoProcessor, AutoModelForImageTextToText

# Change this to the directory containing config.json
MODEL_PATH = Path("./model").resolve()

# Change this to your test image
IMAGE_PATH = Path("./images/test.png").resolve()

QUESTION = "Analyze this UI screenshot and suggest five improvements."

def main():
    if not (MODEL_PATH / "config.json").exists():
        raise FileNotFoundError(
            f"Model configuration not found: {MODEL_PATH}\n"
            "Set MODEL_PATH to the folder containing config.json."
        )

    if not IMAGE_PATH.is_file():
        raise FileNotFoundError(
            f"Image not found: {IMAGE_PATH}"
        )

    print("Loading processor...")

    processor = AutoProcessor.from_pretrained(
        str(MODEL_PATH),
        local_files_only=True,
    )

    print("Loading model on CPU...")
    print("This may take a few minutes.")

    model = AutoModelForImageTextToText.from_pretrained(
        str(MODEL_PATH),
        dtype=torch.float32,
        device_map="cpu",
        local_files_only=True,
    )

    model.eval()

    image = Image.open(IMAGE_PATH).convert("RGB")

    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image", "image": image},
                {"type": "text", "text": QUESTION},
            ],
        }
    ]

    inputs = processor.apply_chat_template(
        messages,
        add_generation_prompt=True,
        tokenize=True,
        return_dict=True,
        return_tensors="pt",
    )

    inputs = {
        key: value.to("cpu") if isinstance(value, torch.Tensor)
        else value
        for key, value in inputs.items()
    }

    print("\nAnalyzing image...\n")

    with torch.inference_mode():
        outputs = model.generate(
            **inputs,
            max_new_tokens=1000,
            do_sample=False,
        )

    # Display only the newly generated answer
    new_tokens = outputs[0][inputs["input_ids"].shape[-1]:]
    answer = processor.decode(
        new_tokens,
        skip_special_tokens=True,
    )

    print("AI response:")
    print(answer)


if __name__ == "__main__":
    main()

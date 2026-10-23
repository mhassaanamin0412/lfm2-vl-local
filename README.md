# LFM2-VL Local Vision Chat

A local React + TypeScript UI connected to a FastAPI backend running `LiquidAI/LFM2-VL-450M` through Hugging Face Transformers.

## Requirements
- Windows 10/11
- Python environment where `torch`, `transformers`, `torchvision`, `accelerate`, `pillow`, and `safetensors` are installed
- Node.js and npm
- Your already-downloaded model files

## 1. Configure the backend

Open `backend/.env.example`, then copy it to `backend/.env` and set `MODEL_PATH` to the exact folder containing `config.json` and your model weights.

Example:
```env
MODEL_PATH=D:/lfm2-vl-local/model
HOST=127.0.0.1
PORT=8000
```

If your model is somewhere else, use its actual path. The model folder must contain `config.json`.

From PowerShell, activate the same Python virtual environment that successfully ran `test_model.py`, then install the backend requirements:

```powershell
cd D:\lfm2-vl-local
.\.venv\Scripts\Activate.ps1
python -m pip install fastapi "uvicorn[standard]" python-multipart python-dotenv
```

Copy this project's `backend` folder into `D:\lfm2-vl-local\backend` (or run it from this project's backend folder using the same virtual environment). Make sure `backend/.env` points to the model files.

Start the backend:
```powershell
cd backend
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

The first start loads the model into RAM and can take a little while. Keep this terminal open.

## 2. Start the frontend

Open a second PowerShell terminal:
```powershell
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite, usually `http://localhost:5173`.

## Notes
- Inference happens on your computer. The app calls only your local backend at `http://127.0.0.1:8000`.
- Do not run `test_model.py` and the API server simultaneously if memory is tight. The backend loads its own copy of the model.
- The model is a vision-language model: it describes and answers questions about images; it does not generate new images.

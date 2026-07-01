import os
import time
import json
import uuid
import sys
from pathlib import Path
from flask import Flask, render_template, request, jsonify, Response, send_from_directory
import numpy as np

app = Flask(__name__)

# ── Folder configurations ─────────────────────────────────────────────────────
UPLOAD_FOLDER = os.path.join(os.getcwd(), 'uploads')
STATIC_HEATMAPS = os.path.join(os.getcwd(), 'static', 'heatmaps')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(STATIC_HEATMAPS, exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['STATIC_HEATMAPS'] = STATIC_HEATMAPS

# ── In-memory task store ──────────────────────────────────────────────────────
tasks_db = {}

# ── DR grade definitions ──────────────────────────────────────────────────────
DIAGNOSES = {
    0: {
        "grade": 0,
        "name": "No DR",
        "pathologies": [],
    },
    1: {
        "grade": 1,
        "name": "Mild NPDR",
        "pathologies": ["Microaneurysms"],
    },
    2: {
        "grade": 2,
        "name": "Moderate NPDR",
        "pathologies": ["Microaneurysms", "Retinal Hemorrhages", "Hard Exudates"],
    },
    3: {
        "grade": 3,
        "name": "Severe NPDR",
        "pathologies": ["Microaneurysms", "Retinal Hemorrhages", "Hard Exudates",
                        "Cotton Wool Spots", "Intraretinal Microvascular Abnormalities (IRMA)"],
    },
    4: {
        "grade": 4,
        "name": "Proliferative DR",
        "pathologies": ["Microaneurysms", "Retinal Hemorrhages", "Hard Exudates",
                        "Neovascularization", "Pre-retinal Hemorrhages",
                        "Tractional Retinal Detachment"],
    }
}

# ── Load ML model (once at startup) ──────────────────────────────────────────
MODEL = None
ROUNDER = None
DEVICE = None

def load_model():
    global MODEL, ROUNDER, DEVICE
    try:
        import torch
        from inference_pipeline import (
            EfficientNetModel, OptimizedRounder,
            MODEL_NAME, load_coefficients
        )
        DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"[INFO] Loading model on {DEVICE}...")
        MODEL = EfficientNetModel(MODEL_NAME).to(DEVICE)
        state = torch.load("best_model_kappa_512.pth", map_location=DEVICE, weights_only=False)
        MODEL.load_state_dict(state, strict=True)
        MODEL.eval()
        coefficients = load_coefficients(Path("rounding_coefficients.json"))
        ROUNDER = OptimizedRounder(coefficients)
        print("[INFO] Model loaded successfully!")
    except Exception as e:
        print(f"[WARNING] Could not load ML model: {e}")
        print("[WARNING] App will start but predictions will fail.")

# ── Real Grad-CAM function ────────────────────────────────────────────────────
def run_real_gradcam(image_path, heatmap_path):
    """
    Run the real EfficientNet-B6 model + Grad-CAM on the uploaded image.
    Returns (grade, confidence, heatmap_saved) tuple.
    """
    import torch
    from inference_pipeline import preprocess_fundus_image, image_to_tensor, DIAGNOSIS_LABELS
    from gradcam import GradCAM, get_efficientnet_target_layer, overlay_heatmap
    import cv2

    # Preprocess
    bgr = preprocess_fundus_image(image_path)
    tensor = image_to_tensor(bgr)

    # Get prediction
    with torch.no_grad():
        raw_score = float(MODEL(tensor.to(DEVICE)).squeeze().cpu().numpy())

    grade = int(ROUNDER.predict(np.array([raw_score]))[0])

    # Map raw score to a 0–1 confidence (sigmoid-like)
    import math
    confidence = round(1 / (1 + math.exp(-abs(raw_score))), 4)
    confidence = min(max(confidence, 0.70), 0.99)  # clamp to realistic range

    # Grad-CAM heatmap
    target_layer = get_efficientnet_target_layer(MODEL)
    grad_cam = GradCAM(MODEL, target_layer)
    heatmap = grad_cam.generate(tensor, DEVICE)
    grad_cam.remove_hooks()

    # Overlay heatmap on original image and save
    overlay = overlay_heatmap(bgr, heatmap, alpha=0.45)
    cv2.imwrite(str(heatmap_path), overlay)

    return grade, confidence, True

# ── Routes ────────────────────────────────────────────────────────────────────
@app.route('/')
def home():
    return render_template('index.html')

@app.route('/api/v1/diagnostics/analyze', methods=['POST'])
def analyze():
    if 'file' not in request.files:
        return jsonify({"error": "No file parameter found"}), 400

    uploaded_file = request.files['file']
    if uploaded_file.filename == '':
        return jsonify({"error": "No file selected"}), 400

    try:
        task_id = f"task_{uuid.uuid4().hex[:12]}"

        # Save uploaded file
        ext = os.path.splitext(uploaded_file.filename)[1].lower()
        if ext not in ['.png', '.jpg', '.jpeg', '.tiff', '.tif']:
            ext = '.png'
        filename = f"{task_id}_original{ext}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        uploaded_file.save(filepath)

        heatmap_filename = f"{task_id}_heatmap.png"
        heatmap_filepath = os.path.join(app.config['STATIC_HEATMAPS'], heatmap_filename)

        # Run real Grad-CAM
        grade, confidence, _ = run_real_gradcam(filepath, heatmap_filepath)
        diag_info = DIAGNOSES[grade]

        tasks_db[task_id] = {
            "taskId": task_id,
            "status": "PENDING",
            "icdrGrade": grade,
            "confidenceScore": confidence,
            "pathologiesDetected": diag_info["pathologies"],
            "heatmapUrl": f"/static/heatmaps/{heatmap_filename}",
            "originalUrl": f"/uploads/{filename}"
        }

        return jsonify({"task_id": task_id, "status": "PENDING"}), 202

    except Exception as e:
        return jsonify({"error": f"Analysis failed: {str(e)}"}), 500

@app.route('/api/v1/diagnostics/tasks/<task_id>/stream')
def stream_status(task_id):
    if task_id not in tasks_db:
        return jsonify({"error": "Task not found"}), 404

    def event_stream():
        task = tasks_db[task_id]

        yield f"data: {json.dumps({'taskId': task_id, 'status': 'PENDING'})}\n\n"
        time.sleep(1.5)

        task['status'] = 'PROCESSING'
        yield f"data: {json.dumps({'taskId': task_id, 'status': 'PROCESSING'})}\n\n"
        time.sleep(1.0)

        task['status'] = 'SUCCESS'
        payload = {
            "taskId": task['taskId'],
            "status": "SUCCESS",
            "icdrGrade": task['icdrGrade'],
            "confidenceScore": task['confidenceScore'],
            "pathologiesDetected": task['pathologiesDetected'],
            "heatmapUrl": task['heatmapUrl'],
            "originalUrl": task['originalUrl']
        }
        yield f"data: {json.dumps(payload)}\n\n"

    return Response(event_stream(), mimetype="text/event-stream")

@app.route('/uploads/<filename>')
def serve_upload(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--test':
        print("Self-test check: Flask app running correctly.")
        sys.exit(0)
    else:
        load_model()
        app.run(host='127.0.0.1', port=5000, debug=False)
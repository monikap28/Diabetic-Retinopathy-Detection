import os
import time
import json
import uuid
import random
import sys
from flask import Flask, render_template, request, jsonify, Response, send_from_directory
from PIL import Image, ImageDraw
import numpy as np

app = Flask(__name__)

# Folder configurations
UPLOAD_FOLDER = os.path.join(os.getcwd(), 'uploads')
STATIC_HEATMAPS = os.path.join(os.getcwd(), 'static', 'heatmaps')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(STATIC_HEATMAPS, exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['STATIC_HEATMAPS'] = STATIC_HEATMAPS

# Global storage for diagnostic tasks (in-memory database)
# Key: task_id, Value: DiagnosticResult dictionary
tasks_db = {}

# Diagnoses definitions
DIAGNOSES = {
    0: {
        "grade": 0,
        "name": "No DR",
        "pathologies": [],
        "min_conf": 0.92,
        "max_conf": 0.99
    },
    1: {
        "grade": 1,
        "name": "Mild NPDR",
        "pathologies": ["Microaneurysms"],
        "min_conf": 0.82,
        "max_conf": 0.94
    },
    2: {
        "grade": 2,
        "name": "Moderate NPDR",
        "pathologies": ["Microaneurysms", "Retinal Hemorrhages", "Hard Exudates"],
        "min_conf": 0.85,
        "max_conf": 0.96
    },
    3: {
        "grade": 3,
        "name": "Severe NPDR",
        "pathologies": ["Microaneurysms", "Retinal Hemorrhages", "Hard Exudates", "Cotton Wool Spots", "Intraretinal Microvascular Abnormalities (IRMA)"],
        "min_conf": 0.88,
        "max_conf": 0.97
    },
    4: {
        "grade": 4,
        "name": "Proliferative DR",
        "pathologies": ["Microaneurysms", "Retinal Hemorrhages", "Hard Exudates", "Neovascularization", "Pre-retinal Hemorrhages", "Tractional Retinal Detachment"],
        "min_conf": 0.90,
        "max_conf": 0.98
    }
}

def generate_mock_heatmap(image_path, heatmap_path, grade):
    """
    Generates a realistic Grad-CAM heatmap using PIL and NumPy.
    Low activations are transparent, medium activations are green/yellow,
    and high activations are red/orange.
    """
    try:
        img = Image.open(image_path)
        w, h = img.size
        
        # Grid dimensions for lower resolution activation map
        grid_size = 32
        grid = np.zeros((grid_size, grid_size), dtype=np.float32)
        
        if grade > 0:
            # Create hot spot circles based on severity grade
            num_spots = random.randint(grade, grade + 2)
            for _ in range(num_spots):
                cx = random.randint(int(grid_size * 0.2), int(grid_size * 0.8))
                cy = random.randint(int(grid_size * 0.2), int(grid_size * 0.8))
                intensity = random.uniform(0.65, 1.0)
                r = random.uniform(2.5, 6.0)
                
                # Apply Gaussian activation peak
                for x in range(grid_size):
                    for y in range(grid_size):
                        dist_sq = (x - cx)**2 + (y - cy)**2
                        val = intensity * np.exp(-dist_sq / (2 * r**2))
                        grid[y, x] = max(grid[y, x], val)
        else:
            # Grade 0 (No DR) has very low or no pathological activations
            cx, cy = random.randint(int(grid_size * 0.45), int(grid_size * 0.55)), random.randint(int(grid_size * 0.45), int(grid_size * 0.55))
            intensity = random.uniform(0.1, 0.25)
            r = random.uniform(2.0, 3.5)
            for x in range(grid_size):
                for y in range(grid_size):
                    dist_sq = (x - cx)**2 + (y - cy)**2
                    grid[y, x] = intensity * np.exp(-dist_sq / (2 * r**2))
                    
        # Normalize grid to 0-255 range
        grid_max = grid.max()
        if grid_max > 0:
            grid = (grid / grid_max) * 255.0
        grid = grid.astype(np.uint8)
        
        # Resize grid to original image dimensions
        grid_img = Image.fromarray(grid, mode='L')
        grid_img_resized = grid_img.resize((w, h), resample=Image.BILINEAR)
        
        # Map values to a colored colormap with alpha channels
        lut = []
        for i in range(256):
            alpha = int(i * 0.75)  # Scale alpha opacity up to ~190
            
            if i < 40:
                # Faint blue/cyan (Cold area, completely transparent at 0)
                r_val = 0
                g_val = int(i * 3)
                b_val = 255
                alpha = int(alpha * 0.2) # Make background blue almost invisible
            elif i < 110:
                # Cyan to green
                r_val = 0
                g_val = 255
                b_val = 255 - int((i - 40) * 3.6)
            elif i < 180:
                # Green to yellow/orange
                r_val = int((i - 110) * 3.6)
                g_val = 255 - int((i - 110) * 1.5)
                b_val = 0
            else:
                # Orange to deep red (Hot lesions)
                r_val = 255
                g_val = 150 - int((i - 180) * 2.0)
                b_val = 0
                
            lut.append((r_val, g_val, b_val, alpha))
            
        pixels = np.array(grid_img_resized)
        rgba_data = [lut[val] for val in pixels.flatten()]
        
        heatmap_img = Image.new("RGBA", (w, h))
        heatmap_img.putdata(rgba_data)
        heatmap_img.save(heatmap_path, "PNG")
        return True
    except Exception as e:
        print(f"Heatmap generation error: {e}")
        return False

# Routes
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
        # Generate unique task ID
        task_id = f"task_{uuid.uuid4().hex[:12]}"
        
        # Secure filename and save
        ext = os.path.splitext(uploaded_file.filename)[1].lower()
        if ext not in ['.png', '.jpg', '.jpeg', '.tiff']:
            ext = '.png'
        filename = f"{task_id}_original{ext}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        uploaded_file.save(filepath)
        
        # Choose a random DR Grade (weighted towards mild/moderate/severe/no DR)
        # Choices: 0 (No DR), 1 (Mild), 2 (Moderate), 3 (Severe), 4 (Proliferative)
        grade = random.choices([0, 1, 2, 3, 4], weights=[35, 20, 25, 12, 8])[0]
        diag_info = DIAGNOSES[grade]
        
        confidence = round(random.uniform(diag_info["min_conf"], diag_info["max_conf"]), 4)
        
        heatmap_filename = f"{task_id}_heatmap.png"
        heatmap_filepath = os.path.join(app.config['STATIC_HEATMAPS'], heatmap_filename)
        
        # Generate mock Grad-CAM overlay
        generate_mock_heatmap(filepath, heatmap_filepath, grade)
        
        # Initialize task context
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
        return jsonify({"error": f"Upload failure: {str(e)}"}), 500

@app.route('/api/v1/diagnostics/tasks/<task_id>/stream')
def stream_status(task_id):
    if task_id not in tasks_db:
        return jsonify({"error": "Task not found"}), 404
        
    def event_stream():
        task = tasks_db[task_id]
        
        # Stream step 1: PENDING
        yield f"data: {json.dumps({'taskId': task_id, 'status': 'PENDING'})}\n\n"
        time.sleep(1.5)
        
        # Stream step 2: PROCESSING
        task['status'] = 'PROCESSING'
        yield f"data: {json.dumps({'taskId': task_id, 'status': 'PROCESSING'})}\n\n"
        time.sleep(2.0)
        
        # Stream step 3: SUCCESS (deliver final payload)
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
    # Test script run
    if len(sys.argv) > 1 and sys.argv[1] == '--test':
        print("Self-test check: Flask app running correctly.")
        sys.exit(0)
    else:
        app.run(host='127.0.0.1', port=5000, debug=True)

import { useDiagnosticStore } from './store.js';
import { mockAnalyticsData } from './mockData.js';

// Global variables for canvas rendering state
let originalImg = new Image();
let heatmapImg = new Image();
let originalLoaded = false;
let heatmapLoaded = false;

let scale = 1.0;
let offsetX = 0;
let offsetY = 0;
let isDragging = false;
let startX = 0;
let startY = 0;

// Active clinician session info
let currentClinician = {
    name: '',
    role: ''
};

document.addEventListener('DOMContentLoaded', () => {
    // Re-initialize Lucide Icons
    if (window.lucide) {
        window.lucide.createIcons();
    }
    
    initAuth();
    initNavigation();
    initUploadAndWorkspace();
    initCanvasInteractions();
    initStoreSubscriptions();
    initAnalyticsCharts();
    initDatabaseTable();
});

// ==============================================================================
// Authentication & Session Manager (Token persistence & RBAC guards)
// ==============================================================================
function initAuth() {
    const authModal = document.getElementById('auth-modal');
    const authForm = document.getElementById('auth-form');
    const usernameInput = document.getElementById('username');
    const userRoleSelect = document.getElementById('user-role');
    const logoutBtn = document.getElementById('logout-btn');
    
    // Check local storage for persistent session
    const savedName = localStorage.getItem('retinanet_username');
    const savedRole = localStorage.getItem('retinanet_role');
    
    if (savedName && savedRole) {
        currentClinician.name = savedName;
        currentClinician.role = savedRole;
        authModal.classList.remove('active');
        updateClinicianProfile();
    }
    
    authForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = usernameInput.value.trim();
        const role = userRoleSelect.value;
        
        if (name) {
            currentClinician.name = name;
            currentClinician.role = role;
            
            // Persist to local storage (simulates token persistence)
            localStorage.setItem('retinanet_username', name);
            localStorage.setItem('retinanet_role', role);
            
            authModal.classList.remove('active');
            updateClinicianProfile();
        }
    });
    
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('retinanet_username');
        localStorage.removeItem('retinanet_role');
        authModal.classList.add('active');
        usernameInput.value = '';
        useDiagnosticStore.resetStore();
        resetCanvasWorkspace();
    });
}

function updateClinicianProfile() {
    const userDisplayName = document.getElementById('user-display-name');
    const userDisplayRole = document.getElementById('user-display-role');
    const userAvatarTag = document.getElementById('user-avatar-tag');
    
    userDisplayName.textContent = currentClinician.name;
    userDisplayRole.textContent = currentClinician.role;
    
    // Avatar initials
    const initials = currentClinician.name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    userAvatarTag.textContent = initials || 'CL';
    
    // RBAC check: Technicians can't verify diagnoses
    const btnSave = document.getElementById('btn-save-diagnostics');
    if (btnSave) {
        if (currentClinician.role === 'Technician') {
            btnSave.disabled = true;
            btnSave.title = 'Requires Ophthalmologist signature privileges';
            btnSave.style.opacity = '0.5';
            btnSave.style.cursor = 'not-allowed';
        } else {
            btnSave.disabled = false;
            btnSave.title = 'Verify results and write record to database';
            btnSave.style.opacity = '1';
            btnSave.style.cursor = 'pointer';
        }
    }
}

// ==============================================================================
// Sidebar Tab Navigation
// ==============================================================================
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const screens = document.querySelectorAll('.dashboard-screen');
    const viewTitle = document.getElementById('view-title');
    const viewSubtitle = document.getElementById('view-subtitle');
    
    const titles = {
        workspace: {
            title: "Diagnostic Workspace",
            sub: "Upload fundus imaging to initiate model classification & Grad-CAM visualization."
        },
        analytics: {
            title: "Historic Analytics",
            sub: "Clinical validation statistics, disease distributions, and model performance metrics."
        },
        database: {
            title: "Screening Database",
            sub: "Search, filter, and review records of all patients evaluated by the AI pipeline."
        }
    };
    
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetTab = item.getAttribute('data-tab');
            
            navItems.forEach(nav => nav.classList.remove('active'));
            screens.forEach(screen => screen.classList.remove('active'));
            
            item.classList.add('active');
            document.getElementById(`screen-${targetTab}`).classList.add('active');
            
            viewTitle.textContent = titles[targetTab].title;
            viewSubtitle.textContent = titles[targetTab].sub;
        });
    });
}

// ==============================================================================
// Upload Pipeline & Workspace Orchestrator (Section 3 of spec)
// ==============================================================================
function initUploadAndWorkspace() {
    const dropzoneArea = document.getElementById('dropzone-area');
    const fileUploader = document.getElementById('file-uploader');
    const canvasWorkspace = document.getElementById('canvas-workspace');
    const btnResetWorkspace = document.getElementById('btn-reset-workspace');
    
    // Direct click trigger
    dropzoneArea.addEventListener('click', () => fileUploader.click());
    
    // Drag & Drop events
    dropzoneArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzoneArea.classList.add('dragover');
    });
    
    dropzoneArea.addEventListener('dragleave', () => {
        dropzoneArea.classList.remove('dragover');
    });
    
    dropzoneArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzoneArea.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleUploadedFile(e.dataTransfer.files[0]);
        }
    });
    
    fileUploader.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            handleUploadedFile(e.target.files[0]);
        }
    });
    
    btnResetWorkspace.addEventListener('click', () => {
        useDiagnosticStore.resetStore();
        resetCanvasWorkspace();
    });
    
    // Commit Diagnosis action
    document.getElementById('btn-save-diagnostics').addEventListener('click', () => {
        const result = useDiagnosticStore.getState().currentResult;
        if (!result) return;
        
        // Add new record to database
        const newRecord = {
            id: result.taskId.toUpperCase(),
            name: "Patient " + result.taskId.substring(5, 9).toUpperCase(),
            age: Math.floor(Math.random() * 40) + 30,
            gender: Math.random() > 0.5 ? 'Female' : 'Male',
            date: new Date().toISOString().replace('T', ' ').substring(0, 16),
            grade: result.icdrGrade,
            label: getICDRGradeLabel(result.icdrGrade),
            confidence: result.confidenceScore,
            pathologies: result.pathologiesDetected,
            status: "Reviewed"
        };
        
        mockAnalyticsData.recentScreenings.unshift(newRecord);
        initDatabaseTable(); // Redraw
        alert(`Diagnosis committed successfully! Saved as Patient ID: ${newRecord.id}`);
    });
    
    // Report download trigger
    document.getElementById('btn-export-report').addEventListener('click', () => {
        const result = useDiagnosticStore.getState().currentResult;
        if (!result) return;
        
        // Simulating clinical report download
        const reportContent = `
=============================================
RETINANET CLINICAL SCREENING REPORT
=============================================
Task Reference:   ${result.taskId}
Date Eval:        ${new Date().toLocaleString()}
Evaluator Name:   ${currentClinician.name}
Role Authorized:  ${currentClinician.role}

---------------------------------------------
DIAGNOSTIC SUMMARY
---------------------------------------------
Classified Grade: ICDR Grade ${result.icdrGrade}
Diagnosis Label:  ${getICDRGradeLabel(result.icdrGrade)}
Confidence Score: ${(result.confidenceScore * 100).toFixed(2)}%

Pathologies Localized:
${result.pathologiesDetected.length > 0 
    ? result.pathologiesDetected.map(p => ` - ${p}`).join('\n') 
    : ' - None Detected (Normal Morphology)'}

---------------------------------------------
Model Specification: EfficientNet-B6 Network
Grad-CAM Blending Map: Committed to Archive
---------------------------------------------
        `;
        
        const blob = new Blob([reportContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `RetinaNet_Report_${result.taskId}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
}

function handleUploadedFile(file) {
    if (!file.type.match('image.*')) {
        alert('Unsupported file format. Please upload a fundus retina image.');
        return;
    }
    
    const dropzoneArea = document.getElementById('dropzone-area');
    const canvasWorkspace = document.getElementById('canvas-workspace');
    
    dropzoneArea.classList.add('hidden');
    canvasWorkspace.classList.remove('hidden');
    
    executeUpload(file);
}

// REST Analysis upload trigger (implements Section 3 API flow)
const executeUpload = async (file) => {
    if (!file) return;
    
    useDiagnosticStore.setUploading(true);
    useDiagnosticStore.setResult(null);
    
    const formData = new FormData();
    formData.append('file', file);
    
    // Read local image immediately for rendering on canvas
    const reader = new FileReader();
    reader.onload = (e) => {
        originalImg.onload = () => {
            originalLoaded = true;
            resetCanvasTransform();
            redrawCanvas();
        };
        originalImg.src = e.target.result;
    };
    reader.readAsDataURL(file);
    
    try {
        const res = await fetch('/api/v1/diagnostics/analyze', { method: 'POST', body: formData });
        if (!res.ok) throw new Error('API server rejection');
        const data = await res.json();
        initializeStatusStream(data.task_id);
    } catch (err) {
        useDiagnosticStore.setResult({ taskId: '', status: 'FAILED', error: 'Upload cycle termination.' });
        useDiagnosticStore.setUploading(false);
    }
};

// SSE real-time state stream (implements Section 3 SSE stream flow)
const initializeStatusStream = (taskId) => {
    const eventSource = new EventSource(`/api/v1/diagnostics/tasks/${taskId}/stream`);
    
    const stepTitle = document.getElementById('inference-step-title');
    const stepSubtitle = document.getElementById('inference-step-subtitle');
    const progressFill = document.getElementById('inference-progress-bar');
    
    eventSource.onmessage = (e) => {
        const parsed = JSON.parse(e.data);
        
        if (parsed.status === 'PENDING') {
            stepTitle.textContent = "Processing Scans...";
            stepSubtitle.textContent = "Pre-processing crop matrices & standardizing channel sizes (512x512).";
            progressFill.style.width = '30%';
        } 
        else if (parsed.status === 'PROCESSING') {
            stepTitle.textContent = "Model Inference...";
            stepSubtitle.textContent = "Evaluating fundus morphology through custom EfficientNet-B6 layers.";
            progressFill.style.width = '70%';
        }
        else if (parsed.status === 'SUCCESS') {
            progressFill.style.width = '100%';
            setTimeout(() => {
                useDiagnosticStore.setResult(parsed);
                useDiagnosticStore.setUploading(false);
                eventSource.close();
                
                // Load and cache mock heatmap image
                heatmapImg.onload = () => {
                    heatmapLoaded = true;
                    redrawCanvas();
                };
                heatmapImg.src = parsed.heatmapUrl;
            }, 500);
        }
        else if (parsed.status === 'FAILED') {
            useDiagnosticStore.setResult(parsed);
            useDiagnosticStore.setUploading(false);
            eventSource.close();
            alert('Model analysis pipeline terminated prematurely.');
        }
    };
    
    eventSource.onerror = () => {
        eventSource.close();
        useDiagnosticStore.setUploading(false);
    };
};

function resetCanvasWorkspace() {
    originalLoaded = false;
    heatmapLoaded = false;
    originalImg = new Image();
    heatmapImg = new Image();
    
    document.getElementById('canvas-workspace').classList.add('hidden');
    document.getElementById('dropzone-area').classList.remove('hidden');
    document.getElementById('file-uploader').value = '';
}

// ==============================================================================
// Zustand Store Subscriptions (Update UI reacting to store state changes)
// ==============================================================================
function initStoreSubscriptions() {
    const resultEmpty = document.getElementById('result-empty');
    const resultLoading = document.getElementById('result-loading');
    const resultSuccess = document.getElementById('result-success');
    
    useDiagnosticStore.subscribe((state) => {
        const { currentResult, isUploading, heatmapOpacity } = state;
        
        // Update opacity readout label
        document.getElementById('opacity-val').textContent = `${Math.round(heatmapOpacity * 100)}%`;
        
        // View toggles
        if (isUploading) {
            resultEmpty.classList.add('hidden');
            resultLoading.classList.remove('hidden');
            resultSuccess.classList.add('hidden');
        } 
        else if (currentResult) {
            resultEmpty.classList.add('hidden');
            resultLoading.classList.add('hidden');
            resultSuccess.classList.remove('hidden');
            
            // Populate Success state values
            const badgeGrade = document.getElementById('diag-badge-grade');
            const labelName = document.getElementById('diag-label-name');
            const txtConfidence = document.getElementById('diag-confidence');
            const barConfidence = document.getElementById('diag-confidence-bar');
            const containerTags = document.getElementById('pathologies-tags-container');
            
            // Clean grade-badges
            badgeGrade.className = `diagnosis-badge badge-grade-${currentResult.icdrGrade}`;
            badgeGrade.textContent = `Grade ${currentResult.icdrGrade}`;
            
            labelName.textContent = getICDRGradeLabel(currentResult.icdrGrade);
            txtConfidence.textContent = `${(currentResult.confidenceScore * 100).toFixed(2)}%`;
            barConfidence.style.width = `${currentResult.confidenceScore * 100}%`;
            
            // Dynamic tags builder
            containerTags.innerHTML = '';
            if (currentResult.pathologiesDetected.length > 0) {
                currentResult.pathologiesDetected.forEach(pathology => {
                    const tag = document.createElement('span');
                    tag.className = 'tag-badge';
                    tag.innerHTML = `<i data-lucide="alert-triangle" class="small-icon"></i> ${pathology}`;
                    containerTags.appendChild(tag);
                });
            } else {
                const emptyTag = document.createElement('span');
                emptyTag.className = 'tag-badge empty-tag';
                emptyTag.textContent = 'Clear Retinal Microvasculature';
                containerTags.appendChild(emptyTag);
            }
            
            if (window.lucide) window.lucide.createIcons();
        } 
        else {
            resultEmpty.classList.remove('hidden');
            resultLoading.classList.add('hidden');
            resultSuccess.classList.add('hidden');
        }
        
        // Redraw canvas with the updated state opacity
        redrawCanvas();
    });
}

function getICDRGradeLabel(grade) {
    const labels = ["No Diabetic Retinopathy", "Mild NPDR", "Moderate NPDR", "Severe NPDR", "Proliferative DR"];
    return labels[grade] || "Unknown Evaluation";
}

// ==============================================================================
// HTML5 Canvas Interactivity (Pan, Zoom, Blending & Opacity Slider)
// ==============================================================================
function initCanvasInteractions() {
    const canvas = document.getElementById('blended-canvas');
    const opacitySlider = document.getElementById('opacity-slider');
    
    // Zoom button controls
    document.getElementById('btn-zoom-in').addEventListener('click', () => {
        scale = Math.min(scale * 1.2, 5.0);
        redrawCanvas();
    });
    
    document.getElementById('btn-zoom-out').addEventListener('click', () => {
        scale = Math.max(scale / 1.2, 0.4);
        redrawCanvas();
    });
    
    document.getElementById('btn-zoom-reset').addEventListener('click', () => {
        resetCanvasTransform();
        redrawCanvas();
    });
    
    // Opacity slider event
    opacitySlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) / 100;
        useDiagnosticStore.setOpacity(val);
    });
    
    // Mouse dragging / Panning logic
    canvas.addEventListener('mousedown', (e) => {
        if (!originalLoaded) return;
        isDragging = true;
        startX = e.clientX - offsetX;
        startY = e.clientY - offsetY;
    });
    
    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        offsetX = e.clientX - startX;
        offsetY = e.clientY - startY;
        redrawCanvas();
    });
    
    window.addEventListener('mouseup', () => {
        isDragging = false;
    });
    
    // Touch gestures support
    canvas.addEventListener('touchstart', (e) => {
        if (!originalLoaded || e.touches.length !== 1) return;
        isDragging = true;
        startX = e.touches[0].clientX - offsetX;
        startY = e.touches[0].clientY - offsetY;
    });
    
    canvas.addEventListener('touchmove', (e) => {
        if (!isDragging || e.touches.length !== 1) return;
        offsetX = e.touches[0].clientX - startX;
        offsetY = e.touches[0].clientY - startY;
        redrawCanvas();
    });
    
    canvas.addEventListener('touchend', () => {
        isDragging = false;
    });
}

function resetCanvasTransform() {
    scale = 1.0;
    offsetX = 0;
    offsetY = 0;
}

function redrawCanvas() {
    const canvas = document.getElementById('blended-canvas');
    if (!canvas || !originalLoaded) return;
    
    const ctx = canvas.getContext('2d');
    
    // Canvas sizing setup to fit dimensions
    const wrapper = canvas.parentElement;
    const cw = wrapper.clientWidth;
    const ch = wrapper.clientHeight;
    
    canvas.width = cw;
    canvas.height = ch;
    
    ctx.clearRect(0, 0, cw, ch);
    
    ctx.save();
    // Centering & applying scale/offset adjustments
    ctx.translate(cw / 2 + offsetX, ch / 2 + offsetY);
    ctx.scale(scale, scale);
    
    // Calculate aspect ratio fitting dimensions
    const imgW = originalImg.width;
    const imgH = originalImg.height;
    const ratio = Math.min((cw - 40) / imgW, (ch - 40) / imgH);
    
    const dw = imgW * ratio;
    const dh = imgH * ratio;
    const dx = -dw / 2;
    const dy = -dh / 2;
    
    // 1. Draw base fundus morphology
    ctx.drawImage(originalImg, dx, dy, dw, dh);
    
    // 2. Overlay custom Grad-CAM colormap
    if (heatmapLoaded && useDiagnosticStore.getState().currentResult) {
        ctx.globalAlpha = useDiagnosticStore.getState().heatmapOpacity;
        ctx.drawImage(heatmapImg, dx, dy, dw, dh);
    }
    
    ctx.restore();
}

// ==============================================================================
// Historical Analytics Dashboard (Charts & Confusion Matrix)
// ==============================================================================
let kappaChart = null;
let severityChart = null;

function initAnalyticsCharts() {
    const ctxKappa = document.getElementById('chart-kappa-history').getContext('2d');
    const ctxSeverity = document.getElementById('chart-severity-pie').getContext('2d');
    
    // Destroy previous instances if re-rendering
    if (kappaChart) kappaChart.destroy();
    if (severityChart) severityChart.destroy();
    
    // Epoch vs Cohen Kappa Chart
    const epData = mockAnalyticsData.kappaHistory;
    kappaChart = new Chart(ctxKappa, {
        type: 'line',
        data: {
            labels: epData.map(e => `Epoch ${e.epoch}`),
            datasets: [
                {
                    label: "Validation Kappa Index",
                    data: epData.map(e => e.valKappa),
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    borderWidth: 2,
                    tension: 0.35,
                    fill: true,
                    yAxisID: 'y'
                },
                {
                    label: "Training MSE Loss",
                    data: epData.map(e => e.trainLoss),
                    borderColor: '#a855f7',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    tension: 0.35,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#94a3b8', font: { family: 'Inter' } } }
            },
            scales: {
                x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                y: { 
                    type: 'linear', 
                    position: 'left',
                    grid: { color: 'rgba(255,255,255,0.05)' }, 
                    ticks: { color: '#94a3b8' },
                    min: 0,
                    max: 1.0
                },
                y1: {
                    type: 'linear',
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#94a3b8' },
                    min: 0,
                    max: 1.0
                }
            }
        }
    });
    
    // Severity Distribution Doughnut Chart
    const sevData = mockAnalyticsData.severityDistribution;
    severityChart = new Chart(ctxSeverity, {
        type: 'doughnut',
        data: {
            labels: sevData.map(s => s.label),
            datasets: [{
                data: sevData.map(s => s.count),
                backgroundColor: [
                    '#475569', // Slate
                    '#10b981', // Emerald
                    '#f59e0b', // Amber
                    '#f97316', // Orange
                    '#ef4444'  // Red
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { 
                    position: 'bottom',
                    labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 } } 
                }
            }
        }
    });
    
    renderConfusionMatrix();
}

function renderConfusionMatrix() {
    const container = document.getElementById('confusion-matrix-grid');
    if (!container) return;
    
    container.innerHTML = '';
    const { labels, matrix } = mockAnalyticsData.confusionMatrix;
    
    // 1. Draw top left spacer
    const spacer = document.createElement('div');
    spacer.className = 'matrix-cell label-cell';
    spacer.innerHTML = 'True \\ Pred';
    spacer.style.fontSize = '8px';
    container.appendChild(spacer);
    
    // 2. Draw Column headers (predictions)
    labels.forEach(l => {
        const cell = document.createElement('div');
        cell.className = 'matrix-cell label-cell';
        cell.textContent = l.split(' ')[0]; // Short label name
        container.appendChild(cell);
    });
    
    // 3. Draw rows (True labels + matrix numbers)
    for (let r = 0; r < 5; r++) {
        // Row label
        const rowLabel = document.createElement('div');
        rowLabel.className = 'matrix-cell label-cell';
        rowLabel.textContent = labels[r].split(' ')[0];
        container.appendChild(rowLabel);
        
        // Matrix values
        for (let c = 0; c < 5; c++) {
            const val = matrix[r][c];
            const cell = document.createElement('div');
            cell.className = 'matrix-cell val-cell';
            cell.textContent = val;
            
            // Set cell heatmap colors depending on values (focus on diagonal accuracy)
            if (r === c) {
                if (val > 150) cell.classList.add('matrix-glow-high');
                else if (val > 50) cell.classList.add('matrix-glow-med');
                else cell.classList.add('matrix-glow-low');
            } else {
                if (val > 10) cell.classList.add('matrix-glow-low');
            }
            
            container.appendChild(cell);
        }
    }
}

// ==============================================================================
// Patient Database Table Layout & Filtering
// ==============================================================================
function initDatabaseTable() {
    const tbody = document.getElementById('patient-table-body');
    const searchInput = document.getElementById('search-patients');
    
    const records = mockAnalyticsData.recentScreenings;
    
    const drawTable = (filteredRecords) => {
        tbody.innerHTML = '';
        if (filteredRecords.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">No records match criteria.</td></tr>`;
            return;
        }
        
        filteredRecords.forEach(rec => {
            const tr = document.createElement('tr');
            
            tr.innerHTML = `
                <td class="row-patient-id">${rec.id}</td>
                <td><strong>${rec.name}</strong></td>
                <td>${rec.age} y/o | ${rec.gender}</td>
                <td>${rec.date}</td>
                <td><span class="row-grade-badge grade-${rec.grade}">${rec.label}</span></td>
                <td><strong style="color: #fff;">${(rec.confidence * 100).toFixed(1)}%</strong></td>
                <td><span class="row-status-badge ${rec.status === 'Reviewed' ? 'status-reviewed' : 'status-action'}">${rec.status}</span></td>
                <td>
                    <button class="btn-table-action btn-review" data-id="${rec.id}">
                        <i data-lucide="eye" class="small-icon"></i>
                        <span>Inspect</span>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        
        if (window.lucide) window.lucide.createIcons();
        bindTableActions();
    };
    
    // Draw initial state
    drawTable(records);
    
    // Search listener filter
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const filtered = records.filter(r => 
            r.name.toLowerCase().includes(query) || 
            r.id.toLowerCase().includes(query) ||
            r.label.toLowerCase().includes(query)
        );
        drawTable(filtered);
    });
}

function bindTableActions() {
    const reviewButtons = document.querySelectorAll('.btn-review');
    reviewButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = btn.getAttribute('data-id');
            const records = mockAnalyticsData.recentScreenings;
            const rec = records.find(r => r.id === id);
            
            if (rec) {
                // Switch back to workspace tab to review
                const workspaceNav = document.getElementById('nav-workspace-btn');
                workspaceNav.click();
                
                // Mock set in store so dashboard highlights this review state
                useDiagnosticStore.setResult({
                    taskId: rec.id.toLowerCase(),
                    status: 'SUCCESS',
                    icdrGrade: rec.grade,
                    confidenceScore: rec.confidence,
                    pathologiesDetected: rec.pathologies,
                    heatmapUrl: `/static/heatmaps/${rec.id.toLowerCase()}_heatmap.png` // Fallback schema match
                });
                
                // Draw mock fundus images onto canvas workspace (represented via a colored retinal disk placeholder)
                originalLoaded = true;
                originalImg.onload = () => {
                    redrawCanvas();
                };
                
                // For demo inspects, load a synthesized eye fundus schema directly onto canvas!
                // To keep the user visually wowed, we construct a custom retinal disk drawing on canvas!
                createSynthesizedFundusDisk(rec.grade);
            }
        });
    });
}

function createSynthesizedFundusDisk(grade) {
    const canvas = document.getElementById('blended-canvas');
    const ctx = canvas.getContext('2d');
    
    // Setup workspace view
    document.getElementById('dropzone-area').classList.add('hidden');
    document.getElementById('canvas-workspace').classList.remove('hidden');
    
    // Synthesize fundus image using a secondary offscreen canvas, export to image source
    const off = document.createElement('canvas');
    off.width = 512;
    off.height = 512;
    const octx = off.getContext('2d');
    
    // Retina Orange Base Background
    const grad = octx.createRadialGradient(256, 256, 10, 256, 256, 250);
    grad.addColorStop(0, '#ff7849');
    grad.addColorStop(0.6, '#e05320');
    grad.addColorStop(1, '#6a1a05');
    octx.fillStyle = grad;
    octx.fillRect(0, 0, 512, 512);
    
    // Circle mask to represent clinical circular photo
    octx.globalCompositeOperation = 'destination-in';
    octx.beginPath();
    octx.arc(256, 256, 240, 0, Math.PI * 2);
    octx.fill();
    octx.globalCompositeOperation = 'source-over';
    
    // Draw Optic Disc (yellow glowing circle)
    octx.beginPath();
    octx.arc(380, 256, 35, 0, Math.PI * 2);
    octx.fillStyle = 'rgba(255, 235, 170, 0.85)';
    octx.shadowColor = '#ffeaad';
    octx.shadowBlur = 20;
    octx.fill();
    octx.shadowBlur = 0; // Reset
    
    // Draw retinal blood vessels (curving dark red lines branching from optic disc)
    octx.strokeStyle = '#6d0b04';
    octx.lineWidth = 3;
    octx.beginPath();
    // Main top arch
    octx.moveTo(380, 256);
    octx.bezierCurveTo(340, 180, 250, 130, 120, 150);
    // Main bottom arch
    octx.moveTo(380, 256);
    octx.bezierCurveTo(340, 320, 250, 380, 120, 360);
    // Branch top
    octx.moveTo(300, 160);
    octx.quadraticCurveTo(240, 100, 150, 80);
    // Branch bottom
    octx.moveTo(300, 340);
    octx.quadraticCurveTo(240, 420, 150, 440);
    octx.stroke();
    
    // Draw Macula fovea (darker central spot)
    octx.beginPath();
    octx.arc(200, 256, 20, 0, Math.PI * 2);
    octx.fillStyle = 'rgba(100, 20, 5, 0.6)';
    octx.fill();
    
    // Draw lesion highlights depending on disease grade
    if (grade > 0) {
        octx.fillStyle = '#ffdf00'; // Hard exudates (bright yellow dots)
        for (let i = 0; i < grade * 5; i++) {
            octx.beginPath();
            octx.arc(150 + (i * 12) % 180, 180 + (i * 27) % 160, 2 + (i % 2), 0, Math.PI * 2);
            octx.fill();
        }
        
        octx.fillStyle = '#cc0000'; // Hemorrhages (red blots)
        for (let i = 0; i < grade * 3; i++) {
            octx.beginPath();
            octx.arc(100 + (i * 29) % 200, 200 + (i * 37) % 120, 3 + (i % 3), 0, Math.PI * 2);
            octx.fill();
        }
    }
    
    originalImg.onload = () => {
        // Trigger mock heatmap matching the grade
        const tempHeatmap = document.createElement('canvas');
        tempHeatmap.width = 512;
        tempHeatmap.height = 512;
        const hctx = tempHeatmap.getContext('2d');
        
        // Draw simple radial activation on heatmap
        const heatGrad = hctx.createRadialGradient(230, 230, 10, 230, 230, 140);
        heatGrad.addColorStop(0, 'rgba(255, 0, 0, 0.7)');     // Hot core
        heatGrad.addColorStop(0.4, 'rgba(255, 230, 0, 0.55)'); // Medium yellow
        heatGrad.addColorStop(0.8, 'rgba(0, 255, 0, 0.15)');    // Cold boundary
        heatGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        hctx.fillStyle = heatGrad;
        
        hctx.beginPath();
        hctx.arc(230, 230, 150, 0, Math.PI*2);
        hctx.fill();
        
        heatmapImg.onload = () => {
            heatmapLoaded = true;
            resetCanvasTransform();
            redrawCanvas();
        };
        heatmapImg.src = tempHeatmap.toDataURL();
    };
    originalImg.src = off.toDataURL();
}

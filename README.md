# Diabetic Retinopathy Detection

## Overview

Diabetic Retinopathy (DR) is a diabetes-related eye disease that can lead to vision loss if not detected early. This project provides a web-based application that allows users to upload retinal fundus images and obtain predictions from a trained machine learning model for diabetic retinopathy detection.

The system combines a trained deep learning model with a Flask-based web interface, making diabetic retinopathy screening more accessible and user-friendly. Similar projects in this domain use deep learning and retinal image analysis to assist in early detection of DR.

## Project Objectives

* Detect diabetic retinopathy from retinal fundus images.
* Provide an easy-to-use web interface for image upload and prediction.
* Integrate machine learning predictions with a responsive frontend.
* Support early screening and awareness of diabetic retinopathy.

## Technologies Used

### Frontend

* HTML5
* CSS3
* JavaScript

### Backend

* Python
* Flask

### Machine Learning

* Pre-trained Diabetic Retinopathy Detection Model
* Image Processing Techniques

## Project Structure

```text
Diabetic-Retinopathy-Detection/
│
├── app.py
├── requirements.txt
├── .gitignore
│
├── templates/
│   └── index.html
│
├── static/
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── app.js
│       ├── mockData.js
│       └── store.js
│
├── uploads/
│   └── .gitkeep
│
└── README.md
```

## Installation

### Clone Repository

```bash
git clone https://github.com/monikap28/Diabetic-Retinopathy-Detection.git
cd Diabetic-Retinopathy-Detection
```

### Create Virtual Environment

```bash
python -m venv venv
```

### Activate Environment

Windows:

```bash
venv\Scripts\activate
```

Linux/Mac:

```bash
source venv/bin/activate
```

### Install Dependencies

```bash
pip install -r requirements.txt
```

## Running the Application

```bash
python app.py
```

Open your browser and visit:

```text
http://127.0.0.1:5000
```

## How It Works

1. User uploads a retinal fundus image.
2. The image is processed by the backend.
3. The trained diabetic retinopathy model analyzes the image.
4. Prediction results are displayed through the web interface.

## Features

* Retinal image upload
* Diabetic retinopathy prediction
* Interactive web interface
* Flask-based backend integration
* Organized frontend and backend architecture


### Web Application & Integration

This repository focuses on:

* Frontend development
* Backend development using Flask
* User interface design
* Deployment-ready application structure

## Future Enhancements

* Grad-CAM heatmap visualization
* Multi-class diabetic retinopathy severity classification
* Cloud deployment

## License

This project is developed for academic and educational purposes.

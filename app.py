"""
Face Auth - Sistema de verificacion biometrica facial (1 a N)
Backend: Flask + face_recognition + OpenCV + PIL
FIX: Compatibilidad NumPy 2.x con dlib 19.24.1 y Soporte Multi-Sujeto
"""

import os
import base64
import io
from pathlib import Path
from datetime import datetime

import cv2
import numpy as np
import face_recognition
from PIL import Image, ImageOps
from flask import Flask, render_template, request, jsonify, send_from_directory

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max

# Configuración de carpetas
#UPLOAD_FOLDER = Path("/Pruebas de comparacion visual foto-imagen guardada/static/uploads")
UPLOAD_FOLDER = Path("static/uploads")
UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)

# -----------------------------------------------------------
# Utilidades de imagen
# -----------------------------------------------------------

def decode_base64_to_rgb(data_url: str) -> np.ndarray:
    """Convierte base64 a array RGB uint8 C-contiguo."""
    if "," in data_url:
        data_url = data_url.split(",")[1]

    img_bytes = base64.b64decode(data_url)
    image = Image.open(io.BytesIO(img_bytes))

    # Corrige rotaciones EXIF (moviles / webcams)
    image = ImageOps.exif_transpose(image)

    # Fuerza RGB puro (descarta alfa, convierte grises, etc.)
    image = image.convert("RGB")

    # np.array() con copy=True garantiza memoria propia
    arr = np.array(image, dtype=np.uint8, copy=True)
    arr = np.ascontiguousarray(arr)

    # Doble verificacion para dlib
    assert arr.dtype == np.uint8,       f"dtype incorrecto: {arr.dtype}"
    assert arr.ndim == 3,               f"ndim incorrecto: {arr.ndim}"
    assert arr.shape[2] == 3,          f"canales incorrectos: {arr.shape[2]}"
    assert arr.flags['C_CONTIGUOUS'],  "array no es C-contiguo"

    return arr


def ndarray_to_base64(img_bgr: np.ndarray, quality: int = 85) -> str:
    """Convierte array numpy BGR a base64 JPEG."""
    encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), quality]
    _, buffer = cv2.imencode(".jpg", img_bgr, encode_param)
    return base64.b64encode(buffer).decode("utf-8")


def draw_face_box(img_bgr: np.ndarray, locations: list, match: bool, confidence: float) -> np.ndarray:
    """Dibuja rectangulos sobre los rostros detectados (espera BGR)."""
    output = img_bgr.copy()
    for (top, right, bottom, left) in locations:
        color    = (0, 220, 80)  if match else (60, 60, 230)
        label_bg = (0, 180, 60)  if match else (50, 50, 210)

        cv2.rectangle(output, (left, top), (right, bottom), color, 2)

        label = f"{'VERIFICADO' if match else 'NO COINCIDE'}  {confidence:.1f}%"
        font, scale, thick = cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1
        (tw, th), _ = cv2.getTextSize(label, font, scale, thick)

        cv2.rectangle(output, (left, bottom), (left + tw + 10, bottom + th + 10), label_bg, -1)
        cv2.putText(output, label, (left + 5, bottom + th + 5), font, scale, (255, 255, 255), thick)

    return output


def get_face_data(img_rgb: np.ndarray):
    """Extrae encoding y ubicaciones de un array RGB uint8 C-contiguo."""
    if img_rgb is None or img_rgb.size == 0:
        return None, []

    img_rgb = np.ascontiguousarray(img_rgb, dtype=np.uint8)

    locations = face_recognition.face_locations(img_rgb, model="hog")
    if not locations:
        return None, []

    encodings = face_recognition.face_encodings(img_rgb, locations)
    return (encodings[0] if encodings else None), locations


def face_distance_to_confidence(distance: float) -> float:
    if distance > 1.0:   return 0.0
    if distance <= 0.35: return 100.0
    return round(max(0.0, min((1.0 - distance) / 0.65 * 100, 100.0)), 2)


# -----------------------------------------------------------
# Rutas de la aplicacion
# -----------------------------------------------------------

@app.route("/")
def index():
    # Verifica si hay al menos un sujeto guardado
    has_reference = len(list(UPLOAD_FOLDER.glob("sujeto_*.jpg"))) > 0
    return render_template("index.html", has_reference=has_reference)


@app.route("/upload_reference", methods=["POST"])
def upload_reference():
    data = request.get_json()
    if not data or "image" not in data:
        return jsonify({"success": False, "error": "No se recibio imagen"}), 400

    try:
        img_rgb = decode_base64_to_rgb(data["image"])
        encoding, locations = get_face_data(img_rgb)

        if encoding is None:
            return jsonify({
                "success": False,
                "error": "No se detecto ningun rostro. Asegurate de que tu cara sea visible y bien iluminada."
            }), 400

        # LÓGICA MULTI-SUJETO: Contar cuántos hay y asignar el siguiente número
        existing_files = list(UPLOAD_FOLDER.glob("sujeto_*.jpg"))
        next_id = len(existing_files) + 1
        new_filename = f"sujeto_{next_id}.jpg"
        new_path = UPLOAD_FOLDER / new_filename

        # Guardar en disco como BGR (OpenCV)
        img_bgr = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR)
        cv2.imwrite(str(new_path), img_bgr)

        annotated   = draw_face_box(img_bgr, locations, match=True, confidence=100.0)
        preview_b64 = ndarray_to_base64(annotated)

        return jsonify({
            "success":     True,
            "subject":     f"Sujeto {next_id}",
            "preview":     f"data:image/jpeg;base64,{preview_b64}",
            "faces_found": len(locations),
            "timestamp":   datetime.now().strftime("%H:%M:%S")
        })

    except AssertionError as ae:
        return jsonify({"success": False, "error": f"Formato de imagen invalido: {ae}"}), 400
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"success": False, "error": f"Error de servidor: {e}"}), 500


@app.route("/verify", methods=["POST"])
def verify():
    # Obtener todas las imágenes de sujetos guardadas
    saved_subjects = list(UPLOAD_FOLDER.glob("sujeto_*.jpg"))
    if not saved_subjects:
        return jsonify({"success": False, "error": "No hay sujetos registrados en el sistema."}), 400

    data = request.get_json()
    if not data or "image" not in data:
        return jsonify({"success": False, "error": "No se recibio imagen"}), 400

    try:
        # Cargar todos los encodings conocidos a la memoria
        known_encodings = []
        known_names = []
        
        for file_path in saved_subjects:
            ref_bgr = cv2.imread(str(file_path))
            if ref_bgr is None:
                continue # Si el archivo no se puede leer, lo salta
                
            ref_img_rgb = np.ascontiguousarray(cv2.cvtColor(ref_bgr, cv2.COLOR_BGR2RGB), dtype=np.uint8)
            
            # Usamos nuestra propia función validada en lugar de face_recognition nativo
            ref_encoding, _ = get_face_data(ref_img_rgb)
            
            if ref_encoding is not None:
                known_encodings.append(ref_encoding)
                # Formatear "sujeto_1" a "Sujeto 1"
                known_names.append(file_path.stem.replace("_", " ").title()) 

        # --- ESCUDO PROTECTOR ---
        if len(known_encodings) == 0:
            return jsonify({
                "success": False, 
                "match": False,
                "confidence": 0,
                "error": "Las imágenes en la base de datos no tienen rostros legibles. Usa 'Borrar Todo' y regístralos de nuevo con buena luz."
            }), 400
        # ------------------------

        # Imagen capturada
        cap_img_rgb  = decode_base64_to_rgb(data["image"])
        cap_encoding, cap_locations = get_face_data(cap_img_rgb)

        if cap_encoding is None:
            return jsonify({
                "success":    False,
                "match":      False,
                "confidence": 0,
                "error":      "No se detecto rostro en la imagen capturada.",
                "preview":    None
            })

        # Comparación 1 a N
        distances = face_recognition.face_distance(known_encodings, cap_encoding)
        
        # Encontrar el que tenga la distancia MÁS CORTA
        best_match_index = np.argmin(distances)
        min_distance = distances[best_match_index]
        
        confidence = face_distance_to_confidence(min_distance)
        THRESHOLD  = 55.0
        match      = bool(confidence >= THRESHOLD)

        matched_name = known_names[best_match_index] if match else "Desconocido"
        matched_image_url = f"/static/uploads/{saved_subjects[best_match_index].name}" if match else ""

        # Anotar y devolver
        cap_img_bgr = cv2.cvtColor(cap_img_rgb, cv2.COLOR_RGB2BGR)
        annotated   = draw_face_box(cap_img_bgr, cap_locations, match=match, confidence=confidence)
        preview_b64 = ndarray_to_base64(annotated)

        if   confidence >= 85: level = "ALTA"
        elif confidence >= 65: level = "MEDIA"
        elif confidence >= 45: level = "BAJA"
        else:                  level = "MUY BAJA"

        return jsonify({
            "success":        True,
            "match":          match,
            "matched_name":   matched_name,
            "matched_image":  matched_image_url,
            "confidence":     confidence,
            "distance":       round(float(min_distance), 4),
            "security_level": level,
            "preview":        f"data:image/jpeg;base64,{preview_b64}",
            "timestamp":      datetime.now().strftime("%H:%M:%S"),
            "threshold":      THRESHOLD
        })

    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"success": False, "error": f"Error de servidor: {e}"}), 500


@app.route("/clear_reference", methods=["POST"])
def clear_reference():
    """Elimina TODOS los sujetos registrados."""
    for file_path in UPLOAD_FOLDER.glob("sujeto_*.jpg"):
        file_path.unlink()
    return jsonify({"success": True})


@app.route("/static/uploads/<path:filename>")
def serve_upload(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)


if __name__ == "__main__":
    print("=" * 50)
    print("  FACE AUTH MULTI-SUJETO - Servidor biométrico activo")
    print("  URL: http://127.0.0.1:5000")
    print("=" * 50)
    app.run(debug=True, host="0.0.0.0", port=5000)
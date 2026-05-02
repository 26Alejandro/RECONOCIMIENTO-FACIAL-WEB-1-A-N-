# FaceAuth: Sistema de Reconocimiento Biométrico Facial (1:N) 👁️🛡️

FaceAuth es un sistema de identidad y control de acceso basado en biometría facial en tiempo real. Construido con Python, Flask y OpenCV, este proyecto evolucionó de un sistema de verificación simple (1:1) a un motor de **Reconocimiento Facial Multi-Sujeto (1:N)**.

El sistema extrae características faciales (128-d encodings) y utiliza la Distancia Euclidiana para identificar rostros frente a una base de datos local, devolviendo métricas de confianza y niveles de seguridad dinámicos en una interfaz de usuario de estética industrial/cyber.

## ✨ Características Principales

*   **Identificación Multi-Sujeto (1:N):** Capacidad de registrar múltiples rostros dinámicamente (`sujeto_1`, `sujeto_2`, `...`, `sujeto_n`).
*   **Análisis en Tiempo Real:** Interacción fluida con la cámara web del usuario para captura de referencias y verificación en vivo.
*   **Métricas de Confianza:** Cálculo matemático de similitud con ajustes de umbral (Threshold) para evitar falsos positivos.
*   **Programación Defensiva:** Validación estricta de estructuras de memoria (C-contiguous arrays, uint8, RGB) antes de inyectar datos al motor de C++.
*   **Interfaz Cyber/Industrial:** UI responsive construida en Vanilla JS y CSS puro, con animaciones de escaneo, tarjetas de información y un historial de sesión detallado.

## 🛠️ Tecnologías Utilizadas

*   **Backend:** Python 3.x, Flask
*   **Visión Computacional & Biometría:** OpenCV (`cv2`), `face_recognition` (dlib), Pillow (PIL)
*   **Procesamiento de Datos:** NumPy
*   **Frontend:** HTML5, CSS3, Vanilla JavaScript (Fetch API, MediaDevices API)

## ⚙️ Instalación y Configuración

1. Clona este repositorio:
   ```bash
   git clone [https://github.com/tu-usuario/faceauth.git](https://github.com/tu-usuario/faceauth.git)
   cd faceauth

2. Crea y activa un entorno virtual (recomendado):
   ```bash
   python -m venv venv
   # En Windows:
   venv\Scripts\activate
   # En Linux/Mac:
   source venv/bin/activate
   ```

3. Instala las dependencias. **Nota crítica sobre NumPy:** Debido a cambios en la ABI de C en NumPy 2.0 que rompen los binarios precompilados de `dlib`, es estrictamente necesario instalar una versión `1.x` de NumPy:
   ```bash
   pip install "numpy<2" flask opencv-python face_recognition pillow
   ```

4. Ejecuta el servidor:
   ```bash
   python app.py
   ```

5. Abre tu navegador y dirígete a `[http://127.0.0.1:5000](http://127.0.0.1:5000)`.

## 🧠 ¿Cómo funciona bajo el capó?

1. **Captura y Limpieza:** La imagen en Base64 se decodifica y se pasa por PIL para corregir rotaciones EXIF y asegurar que sea un formato RGB puro, eliminando canales alfa.
2. **Estructura de Memoria:** Se fuerza la creación de un nuevo array de memoria alineada (`np.ascontiguousarray`) para evitar el temido error `Unsupported image type, must be 8bit gray or RGB image` del motor `dlib`.
3. **Extracción de Características:** `face_recognition` ubica el rostro mediante el modelo HOG (Histogram of Oriented Gradients) y genera un vector de 128 dimensiones.
4. **Comparación Múltiple:** Al verificar, el sistema calcula la Distancia Euclidiana entre el vector capturado y todos los vectores registrados, seleccionando el índice (`np.argmin`) con la menor distancia matemática.

## 👨‍💻 Autor

**Alejandro Melgarejo Sotelo**  
Desarrollo e implementación.

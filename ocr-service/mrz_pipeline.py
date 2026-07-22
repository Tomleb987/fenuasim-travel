"""Pré-traitement OpenCV + lecture PaddleOCR de la MRZ, en deux passes.
Tout se passe en mémoire (numpy array) : aucune image n'est jamais écrite
sur disque (cf. docs/etape-0-mvp-esta.md, section 4 — "image (transit
only)").

Passe 1 : image entière redimensionnée (rapide) → localise la MRZ.
Passe 2 : recadrage serré autour de la zone trouvée en passe 1, agrandi et
binarisé (police OCR-B, monospace) → relecture plus fine, sans le bruit
visuel du reste de la photo. Si la passe 2 ne trouve rien d'exploitable,
on retombe sur le résultat de la passe 1 (jamais pire qu'avant)."""

import re
import numpy as np
import cv2
from paddleocr import PaddleOCR

# Singleton : le chargement des modèles PaddleOCR est coûteux (plusieurs
# secondes) et ne doit se produire qu'une fois par instance du service, pas
# à chaque requête.
_ocr_engine = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)

_MRZ_CHARSET = re.compile(r"[^A-Z0-9<]")
_MRZ_LINE_LEN = 44
_MAX_DIMENSION = 1600  # px, sur le plus grand côté, pour la passe 1


def _resize_for_speed(gray: np.ndarray) -> np.ndarray:
    """Une vraie photo de téléphone (souvent 3000-4000 px de large) fait
    largement dépasser le timeout de 12s côté Next.js si on lit l'image
    entière à pleine résolution. La passe 2 (recadrage + agrandissement
    ciblé) compense la perte de détail sur la zone qui compte vraiment."""
    height, width = gray.shape[:2]
    largest_side = max(height, width)
    if largest_side <= _MAX_DIMENSION:
        return gray
    scale = _MAX_DIMENSION / largest_side
    return cv2.resize(gray, (int(width * scale), int(height * scale)), interpolation=cv2.INTER_AREA)


def _order_points(pts: np.ndarray) -> np.ndarray:
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    return rect


def _correct_perspective(gray: np.ndarray) -> np.ndarray:
    """Best-effort : si un contour de document net (quadrilatère occupant
    une large part de l'image) est détecté, corrige la perspective. Sinon,
    renvoie l'image telle quelle plutôt que d'échouer."""
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return gray

    image_area = gray.shape[0] * gray.shape[1]
    best = None
    for contour in sorted(contours, key=cv2.contourArea, reverse=True)[:5]:
        area = cv2.contourArea(contour)
        if area < image_area * 0.3:
            continue
        peri = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.02 * peri, True)
        if len(approx) == 4:
            best = approx.reshape(4, 2)
            break

    if best is None:
        return gray

    rect = _order_points(best.astype("float32"))
    (tl, tr, br, bl) = rect
    width = int(max(np.linalg.norm(br - bl), np.linalg.norm(tr - tl)))
    height = int(max(np.linalg.norm(tr - br), np.linalg.norm(tl - bl)))
    # Garde-fou mémoire : un contour parasite (bruit, ombres) peut donner des
    # points mal ordonnés et une taille de sortie disproportionnée, ce qui
    # ferait allouer une image bien plus grande que l'original — jamais utile
    # ici puisque l'image d'entrée est déjà redimensionnée à _MAX_DIMENSION.
    if width < 10 or height < 10 or width > _MAX_DIMENSION * 2 or height > _MAX_DIMENSION * 2:
        return gray

    dst = np.array([[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]], dtype="float32")
    matrix = cv2.getPerspectiveTransform(rect, dst)
    return cv2.warpPerspective(gray, matrix, (width, height))


def _binarize_for_recognition(gray: np.ndarray) -> np.ndarray:
    """Seuillage d'Otsu : améliore nettement la lecture de texte monospace
    imprimé (police OCR-B de la MRZ), en particulier sous éclairage inégal
    (ombre portée, reflet) typique d'une photo de téléphone."""
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    _, binary = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return binary


def _crop_with_padding(
    gray: np.ndarray, boxes: list[np.ndarray], padding_ratio: float = 0.3
) -> np.ndarray | None:
    all_points = np.concatenate(boxes, axis=0)
    x_min, y_min = all_points.min(axis=0)
    x_max, y_max = all_points.max(axis=0)
    pad_x = (x_max - x_min) * padding_ratio
    pad_y = (y_max - y_min) * padding_ratio

    h, w = gray.shape[:2]
    x0 = max(0, int(x_min - pad_x))
    y0 = max(0, int(y_min - pad_y))
    x1 = min(w, int(x_max + pad_x))
    y1 = min(h, int(y_max + pad_y))
    if x1 - x0 < 10 or y1 - y0 < 10:
        return None
    return gray[y0:y1, x0:x1]


def _normalize_candidate_line(text: str) -> str:
    cleaned = _MRZ_CHARSET.sub("", text.upper())
    if len(cleaned) < _MRZ_LINE_LEN:
        missing = _MRZ_LINE_LEN - len(cleaned)
        # PaddleOCR régulièrement ne détecte qu'un seul "<" pour un long run
        # de remplissage (jusqu'à 14 consécutifs sur la ligne 2 TD3), ce qui
        # décale tout ce qui suit (dont les digits de contrôle finaux) si on
        # se contente d'ajouter le padding manquant en toute fin de chaîne.
        # On le réinjecte plutôt à l'emplacement du dernier "<" détecté, pour
        # que les caractères suivants (digits de contrôle) retrouvent leur
        # position absolue correcte dans la ligne de 44 caractères.
        last_chevron = cleaned.rfind("<")
        if last_chevron != -1:
            cleaned = cleaned[:last_chevron] + "<" * (missing + 1) + cleaned[last_chevron + 1 :]
        else:
            cleaned = cleaned.ljust(_MRZ_LINE_LEN, "<")
    return cleaned[:_MRZ_LINE_LEN]


def _mrz_score(raw_text: str) -> float:
    """Score de ressemblance MRZ calculé sur le texte BRUT (avant nettoyage).
    Un simple ratio de caractères appartenant au charset MRZ ne suffit pas :
    un texte normal en majuscules (ex. "REPUBLIQUE FRANCAISE") n'utilise que
    des lettres, qui font toutes partie du charset MRZ elles aussi. Le
    signal réellement discriminant est la présence de `<` de remplissage
    (quasi absent de tout texte normal) et une longueur proche de 44
    caractères (TD3)."""
    cleaned = raw_text.upper().replace(" ", "")
    if len(cleaned) < 20:
        return 0.0

    valid_chars = sum(1 for c in cleaned if c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<")
    charset_ratio = valid_chars / len(cleaned)
    # Le détecteur PaddleOCR tronque souvent la boîte englobante avant la fin
    # d'un long run de "<" de remplissage (ligne 2 TD3 : jusqu'à 20 "<"
    # consécutifs) : une ligne correctement lue peut donc n'avoir plus qu'un
    # seul "<" survivant, bien en dessous d'un seuil en ratio. Un seul "<"
    # suffit déjà à distinguer une MRZ d'un texte normal (qui n'en contient
    # jamais) sans être sensible à cette troncature.
    has_chevron = "<" in cleaned
    if not has_chevron or charset_ratio < 0.9:
        return 0.0

    length_score = max(0.0, 1.0 - abs(len(cleaned) - _MRZ_LINE_LEN) / _MRZ_LINE_LEN)
    return charset_ratio * 0.4 + length_score * 0.6


def _run_ocr_pass(gray: np.ndarray):
    """Lance PaddleOCR sur l'image donnée et renvoie la meilleure paire de
    lignes adjacentes ressemblant à une MRZ : ((ligne1, conf1, box1),
    (ligne2, conf2, box2)), ou None si rien d'exploitable."""
    result = _ocr_engine.ocr(gray, cls=True)
    if not result or not result[0]:
        return None

    # Résultat PaddleOCR : liste de [box, (texte, confiance)]. On trie par
    # position verticale pour retrouver l'ordre de lecture haut → bas : les
    # deux lignes de la MRZ sont toujours directement adjacentes entre elles.
    detections = sorted(result[0], key=lambda item: item[0][0][1])
    entries = [
        (_normalize_candidate_line(text), conf, _mrz_score(text), box) for box, (text, conf) in detections
    ]
    if len(entries) < 2:
        return None

    best_pair = None
    best_score = 0.0
    for i in range(len(entries) - 1):
        combined = entries[i][2] + entries[i + 1][2]
        if combined > best_score:
            best_score = combined
            best_pair = (entries[i], entries[i + 1])

    if best_pair is None or best_score == 0.0:
        return None

    (line1, conf1, _, box1), (line2, conf2, _, box2) = best_pair
    return (line1, conf1, box1), (line2, conf2, box2)


def extract_mrz_lines(image_bytes: bytes) -> tuple[str, str, float] | None:
    """Retourne (ligne1, ligne2, confiance_moyenne) ou None si aucune MRZ
    plausible n'a été détectée."""
    array = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is None:
        return None

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gray = _resize_for_speed(gray)
    gray = _correct_perspective(gray)

    pass1 = _run_ocr_pass(gray)
    if pass1 is None:
        return None
    (line1, conf1, box1), (line2, conf2, box2) = pass1

    # Passe 2 : recadrage serré sur la zone MRZ localisée en passe 1,
    # agrandi et binarisé — moins de texte parasite autour, meilleur
    # contraste sur la police monospace. Ne remplace le résultat de la
    # passe 1 que si elle produit quelque chose d'exploitable.
    crop = _crop_with_padding(gray, [np.array(box1), np.array(box2)])
    if crop is not None:
        upscaled = cv2.resize(crop, (crop.shape[1] * 3, crop.shape[0] * 3), interpolation=cv2.INTER_CUBIC)
        binary = _binarize_for_recognition(upscaled)
        pass2 = _run_ocr_pass(binary)
        if pass2 is not None:
            (refined_line1, refined_conf1, _), (refined_line2, refined_conf2, _) = pass2
            return refined_line1, refined_line2, (refined_conf1 + refined_conf2) / 2

    return line1, line2, (conf1 + conf2) / 2

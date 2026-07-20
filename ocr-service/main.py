import logging
import os

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from pydantic import BaseModel

from mrz_checksum import validate_td3
from mrz_parse import parse_td3_fields
from mrz_pipeline import extract_mrz_lines

logger = logging.getLogger("ocr-service")

SHARED_SECRET = os.environ.get("OCR_SHARED_SECRET")

app = FastAPI(title="fenuasim-travel-ocr")


class ExtractResponse(BaseModel):
    success: bool
    confidence: float
    mrz_raw: str | None = None
    fields: dict | None = None
    error: str | None = None


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/extract", response_model=ExtractResponse)
async def extract(
    file: UploadFile = File(...),
    x_shared_secret: str | None = Header(default=None, alias="X-Shared-Secret"),
):
    if not SHARED_SECRET or x_shared_secret != SHARED_SECRET:
        raise HTTPException(status_code=401, detail="unauthorized")

    # Traitement entièrement en mémoire : l'image n'est jamais écrite sur
    # disque, jamais journalisée (cf. docs/etape-0-mvp-esta.md, section 4).
    image_bytes = await file.read()

    try:
        mrz = extract_mrz_lines(image_bytes)
    except Exception:
        logger.exception("Échec du traitement OCR (détails non journalisés)")
        return ExtractResponse(success=False, confidence=0.0, error="processing_error")

    if mrz is None:
        return ExtractResponse(success=False, confidence=0.0, error="no_mrz_detected")

    line1, line2, ocr_confidence = mrz
    checksum = validate_td3(line1, line2)

    # Un checksum ICAO invalide est un signal d'erreur de lecture plus fort
    # que la seule confiance OCR brute (cf. cadrage : "checksums ICAO stricts").
    confidence = ocr_confidence if checksum.all_valid else ocr_confidence * 0.3

    fields = parse_td3_fields(line1, line2, checksum)
    mrz_raw = f"{line1}\n{line2}"

    return ExtractResponse(
        success=True,
        confidence=round(confidence, 3),
        mrz_raw=mrz_raw,
        fields=fields,
    )

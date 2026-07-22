import "server-only";

export type OcrFields = {
  first_name: string | null;
  last_name: string | null;
  sex: string | null;
  date_of_birth: string | null;
  nationality: string | null;
  passport_number: string | null;
  passport_issuing_country: string | null;
  passport_expiry_date: string | null;
};

export type OcrResult =
  | { success: true; confidence: number; mrzRaw: string; fields: OcrFields }
  | { success: false };

// Ne lève jamais d'exception : réseau en échec, timeout, réponse non-2xx ou
// malformée -> { success: false }, pour que l'appelant retombe
// systématiquement sur le fallback manuel sans jamais bloquer l'upload
// (cf. docs/etape-0-mvp-esta.md, section risques : "timeout court +
// fallback automatique vers saisie manuelle").
export async function callOcrService(file: File): Promise<OcrResult> {
  const serviceUrl = process.env.OCR_SERVICE_URL;
  const sharedSecret = process.env.OCR_SERVICE_SHARED_SECRET;
  if (!serviceUrl || !sharedSecret) return { success: false };

  try {
    const formData = new FormData();
    formData.set("file", file);

    const response = await fetch(`${serviceUrl}/extract`, {
      method: "POST",
      headers: { "X-Shared-Secret": sharedSecret },
      body: formData,
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) {
      // Ne jamais logger le corps de la réponse : peut contenir la MRZ / le
      // numéro de passeport en clair si le service a partiellement traité
      // l'image avant l'échec.
      console.error("OCR service: réponse non-2xx", response.status);
      return { success: false };
    }

    const data = await response.json();
    if (!data.success || !data.fields || typeof data.confidence !== "number") {
      // Idem : ne loguer que la forme de la réponse (quelles clés manquent),
      // jamais son contenu — `data.fields`/`data.mrz_raw` sont potentiellement
      // des données passeport en clair.
      console.error("OCR service: réponse sans résultat exploitable", {
        hasSuccess: Boolean(data?.success),
        hasFields: Boolean(data?.fields),
        confidenceType: typeof data?.confidence,
      });
      return { success: false };
    }

    return {
      success: true,
      confidence: data.confidence,
      mrzRaw: typeof data.mrz_raw === "string" ? data.mrz_raw : "",
      fields: data.fields,
    };
  } catch (error) {
    console.error("OCR service: appel en échec", error);
    return { success: false };
  }
}

import type { Database } from "@/lib/supabase/database.types";

export type TravelRequestStatus = Database["public"]["Enums"]["travel_request_status"];

// Libellés client, cf. docs/etape-0-mvp-esta.md section 5.
export const TRAVEL_REQUEST_STATUS_LABELS: Record<TravelRequestStatus, string> = {
  draft: "Brouillon",
  scan_pending: "Scan en attente",
  ocr_done: "OCR terminé",
  to_verify: "À vérifier",
  payment_pending: "Paiement en attente",
  paid: "Payé",
  to_submit: "À déposer",
  submitted: "Déposé",
  additional_info_requested: "Complément demandé",
  accepted: "Accepté",
  rejected: "Refusé",
  cancelled: "Annulé",
  refunded: "Remboursé",
  closed: "Clôturé",
};

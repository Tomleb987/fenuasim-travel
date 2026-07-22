import "server-only";

export type TransactionalEmail = {
  to: string;
  subject: string;
  htmlContent: string;
};

// Ne lève jamais d'exception : un email transactionnel qui échoue ne doit
// jamais bloquer la création du dossier, la confirmation de paiement ou le
// remboursement — même philosophie que src/lib/ocr/client.ts (clé absente,
// timeout, réponse non-2xx -> { success: false }, logué, jamais propagé).
export async function sendTransactionalEmail(email: TransactionalEmail): Promise<{ success: boolean }> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return { success: false };

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: "FenuaSIM Travel", email: "no-reply@fenuasim.com" },
        to: [{ email: email.to }],
        subject: email.subject,
        htmlContent: email.htmlContent,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.error("Brevo: réponse non-2xx", response.status, await response.text());
      return { success: false };
    }

    return { success: true };
  } catch (error) {
    console.error("Brevo: appel en échec", error);
    return { success: false };
  }
}

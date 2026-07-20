import { validateAndMarkScanned } from "../actions";
import { QrScanUploadForm } from "./qr-scan-upload-form";

export default async function ScanPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await validateAndMarkScanned(token);

  if (!session) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Lien invalide</h1>
        <p className="mt-3 text-black/60 dark:text-white/60">
          Ce lien de scan n&apos;est plus valide ou a déjà été utilisé. Retournez sur votre
          ordinateur pour en générer un nouveau.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Photo du passeport</h1>
      <p className="mt-3 text-black/60 dark:text-white/60">
        Prenez en photo la page principale de votre passeport (celle avec votre photo et vos
        informations).
      </p>
      <QrScanUploadForm token={token} />
    </div>
  );
}

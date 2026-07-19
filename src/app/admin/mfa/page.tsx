import { Suspense } from "react";
import { MfaForm } from "./mfa-form";

export default function AdminMfaPage() {
  return (
    <Suspense>
      <MfaForm />
    </Suspense>
  );
}

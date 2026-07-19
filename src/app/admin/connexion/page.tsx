import { Suspense } from "react";
import { AdminConnexionForm } from "./admin-connexion-form";

export default function AdminConnexionPage() {
  return (
    <Suspense>
      <AdminConnexionForm />
    </Suspense>
  );
}

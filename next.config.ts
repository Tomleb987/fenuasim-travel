import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Next.js limite par défaut le corps d'une Server Action à 1 Mo — trop
    // bas pour une photo de passeport prise au téléphone. Aligné sur la
    // limite applicative de src/app/dashboard/actions.ts (MAX_UPLOAD_BYTES).
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;

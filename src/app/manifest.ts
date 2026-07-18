import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FenuaSIM Travel",
    short_name: "FenuaSIM Travel",
    description: "Assistance à la demande d'autorisation de voyage ESTA (États-Unis).",
    start_url: "/",
    display: "standalone",
    background_color: "#EEF1F3",
    theme_color: "#16223B",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}

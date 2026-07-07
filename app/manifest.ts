import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AI Validator",
    short_name: "AI Validator",
    description:
      "Simuliraj reakcije 50 raznolikih kupaca na tvoju ideju i koristi AI savjetnike izravno na telefonu ili desktopu.",
    start_url: "/",
    display: "standalone",
    background_color: "#050507",
    theme_color: "#050507",
    lang: "hr",
    orientation: "portrait",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}

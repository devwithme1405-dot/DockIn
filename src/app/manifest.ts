import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DockIn",
    short_name: "DockIn",
    description: "Attendance, money, assignments and exams in one place.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#1f5fd6",
    theme_color: "#1f5fd6",
    id: "/",
    lang: "en-IN",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    // Long-press the icon on Android to jump straight to these.
    shortcuts: [
      { name: "Mark attendance", url: "/", icons: [] },
      { name: "Add expense", url: "/money?add=1", icons: [] },
      { name: "Add assignment", url: "/tasks?add=1", icons: [] },
    ],
  };
}

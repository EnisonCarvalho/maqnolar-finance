import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MaqnoLar Financeiro" },
      { name: "description", content: "Gestão operacional e financeira da MaqnoLar Assistência Técnica." },
      { property: "og:title", content: "MaqnoLar Financeiro" },
      { property: "og:description", content: "Gestão operacional e financeira da MaqnoLar Assistência Técnica." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});

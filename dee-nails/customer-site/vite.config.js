import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const TITLE = "Dee Nails | Book your appointment";
const DESCRIPTION = "Book your nails with Dee. Choose your services, pick a time, and confirm on WhatsApp.";

// Link previews (WhatsApp, Facebook, X) need ABSOLUTE urls and are read from the
// raw HTML, before any JavaScript runs. So the tags are added at build time, from
// VITE_SITE_URL. Without it nothing is added, rather than shipping broken tags.
function socialTags(siteUrl) {
  return {
    name: "social-tags",
    transformIndexHtml(html) {
      if (!siteUrl) return html;
      const base = siteUrl.replace(/\/+$/, "");
      const tags = [
        ["og:type", "website"],
        ["og:site_name", "Dee Nails"],
        ["og:title", TITLE],
        ["og:description", DESCRIPTION],
        ["og:url", base + "/"],
        ["og:image", base + "/og-image.jpg"],
        ["og:image:width", "1200"],
        ["og:image:height", "630"],
      ].map(([k, v]) => `  <meta property="${k}" content="${v}" />`);
      tags.push('  <meta name="twitter:card" content="summary_large_image" />');
      return html.replace("</head>", tags.join("\n") + "\n</head>");
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), socialTags(env.VITE_SITE_URL)],
    server: { port: 5173 },
  };
});

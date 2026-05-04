import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  const base =
    process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://getpolaris.xyz"
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/settings/", "/sign-in", "/sign-up"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  }
}

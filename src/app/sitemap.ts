import type { MetadataRoute } from "next"

export default function sitemap(): MetadataRoute.Sitemap {
  const base =
    process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://getpolaris.xyz"
  const lastModified = new Date()
  return [
    { url: `${base}/`, lastModified, priority: 1.0, changeFrequency: "weekly" },
    { url: `${base}/pricing`, lastModified, priority: 0.9, changeFrequency: "monthly" },
    { url: `${base}/about`, lastModified, priority: 0.6, changeFrequency: "monthly" },
    { url: `${base}/status`, lastModified, priority: 0.4, changeFrequency: "daily" },
    { url: `${base}/legal/terms`, lastModified, priority: 0.3, changeFrequency: "monthly" },
    { url: `${base}/legal/privacy`, lastModified, priority: 0.3, changeFrequency: "monthly" },
    { url: `${base}/legal/dpa`, lastModified, priority: 0.3, changeFrequency: "monthly" },
    { url: `${base}/legal/cookies`, lastModified, priority: 0.3, changeFrequency: "monthly" },
  ]
}

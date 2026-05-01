import type { Metadata } from "next"
import { MarketingHeader } from "@/features/marketing/components/marketing-header"
import { Footer } from "@/features/marketing/components/footer"

export const metadata: Metadata = {
  title:
    "Polaris by Praxiom — The AI IDE that builds from spec, not instinct.",
  description:
    "Polaris is a spec-driven AI cloud IDE. Describe your app, watch it run live, ship it to Vercel. Real Next.js + Supabase. You own the code.",
  openGraph: {
    title: "Polaris by Praxiom",
    description:
      "The AI IDE that builds from spec, not instinct. Spec-driven. Cloud-native. Yours to keep.",
    type: "website",
    url: "https://build.praxiomai.xyz",
  },
}

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-surface-0">
      <MarketingHeader />
      <main>{children}</main>
      <Footer />
    </div>
  )
}

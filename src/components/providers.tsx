"use client";

import { ConvexReactClient } from "convex/react";
import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ConvexProviderWithClerk } from "convex/react-clerk";

import { ThemeProvider } from "./theme-provider";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * Global context providers — Clerk, Convex, Theme.
 * Auth gating (Authenticated / Unauthenticated / AuthLoading) is handled
 * per-route in the (app) layout so marketing pages render without auth.
 */
export const Providers = ({ children }: { children: React.ReactNode }) => {
  return (
    <ClerkProvider>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
};

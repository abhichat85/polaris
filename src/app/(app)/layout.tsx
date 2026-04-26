"use client";

import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";

import { AuthLoadingView } from "@/features/auth/components/auth-loading-view";
import { UnauthenticatedView } from "@/features/auth/components/unauthenticated-view";

/**
 * Auth-gated layout for all app routes (dashboard, projects).
 * Marketing routes live in (marketing) and render without auth.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AuthLoading>
        <AuthLoadingView />
      </AuthLoading>
      <Unauthenticated>
        <UnauthenticatedView />
      </Unauthenticated>
      <Authenticated>
        {children}
      </Authenticated>
    </>
  );
}

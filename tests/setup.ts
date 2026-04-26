import "@testing-library/jest-dom/vitest"
import { vi } from "vitest"

/**
 * Global Convex mock — most component tests don't wrap their tree in a real
 * ConvexProvider. This stub makes `useQuery`/`useMutation`/`useAction` return
 * inert values so pure render-and-assert tests work. Tests that need real
 * Convex behavior can `vi.unmock("convex/react")` and provide their own.
 */
vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: () => {
    const fn = vi.fn(async () => undefined)
    // emulate the .withOptimisticUpdate(...) chain Convex exposes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(fn as any).withOptimisticUpdate = () => fn
    return fn
  },
  useAction: () => vi.fn(async () => undefined),
  useConvexAuth: () => ({ isLoading: false, isAuthenticated: false }),
  ConvexProvider: ({ children }: { children: unknown }) => children,
  ConvexReactClient: class {},
  Authenticated: ({ children }: { children: unknown }) => children,
  Unauthenticated: ({ children }: { children: unknown }) => children,
  AuthLoading: ({ children }: { children: unknown }) => children,
}))

// jsdom polyfills required by Radix UI primitives (Select, Dropdown, Dialog, …)
if (typeof globalThis.ResizeObserver === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
}

if (typeof globalThis.DOMRect === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).DOMRect = class {
    static fromRect() {
      return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }
    }
  }
}

// jsdom doesn't implement scrollIntoView; Radix Select uses it.
if (typeof window !== "undefined") {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function () {}
  }
  if (!Element.prototype.hasPointerCapture) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(Element.prototype as any).hasPointerCapture = function () {
      return false
    }
  }
  if (!Element.prototype.releasePointerCapture) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(Element.prototype as any).releasePointerCapture = function () {}
  }
}

/**
 * Settings hooks. Authenticated wrappers around Convex queries/mutations.
 * Each hook returns either the live data or `undefined` while loading —
 * components MUST guard for `undefined` rather than rendering against a
 * falsy fallback (the synthetic defaults already handle "no row" cases).
 */

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";

export const useCurrentProfile = () => {
  return useQuery(api.user_profiles.getCurrent, {});
};

export const useCurrentCustomer = () => {
  return useQuery(api.customers.getCurrent, {});
};

export const useUpdatePreferences = () => {
  return useMutation(api.user_profiles.updatePreferences);
};

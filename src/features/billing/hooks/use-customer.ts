/**
 * Billing hooks. Auth-bound Convex query wrappers.
 * Authority: D-019 (plans source-of-truth), §17 quotas.
 */

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";

export const useCustomer = () => {
  return useQuery(api.customers.getCurrent, {});
};

export const useCurrentMonthUsage = () => {
  return useQuery(api.usage.getCurrentMonthForCurrentUser, {});
};

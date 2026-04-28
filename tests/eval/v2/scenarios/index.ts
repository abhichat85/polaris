/**
 * v2 eval scenario registry — D-048 (plan H.2).
 *
 * Authored scenarios are registered here so the runner / CI can
 * iterate them as a set. Order is the canonical order of the eval
 * report.
 */

import type { RealEvalScenario } from "../types"

import { SCENARIO_01 } from "./01-static-marketing-page"
import { SCENARIO_02 } from "./02-auth-flow"
import { SCENARIO_03 } from "./03-product-list-cart"
import { SCENARIO_04 } from "./04-form-validation"
import { SCENARIO_05 } from "./05-dark-light-toggle"
import { SCENARIO_06 } from "./06-fix-runtime-bug"
import { SCENARIO_07 } from "./07-image-to-ui"
import { SCENARIO_08 } from "./08-fullstack-todo"

export const ALL_SCENARIOS: RealEvalScenario[] = [
  SCENARIO_01,
  SCENARIO_02,
  SCENARIO_03,
  SCENARIO_04,
  SCENARIO_05,
  SCENARIO_06,
  SCENARIO_07,
  SCENARIO_08,
]

export function getScenario(id: string): RealEvalScenario | undefined {
  return ALL_SCENARIOS.find((s) => s.id === id)
}

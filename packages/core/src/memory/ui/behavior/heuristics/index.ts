/**
 * HCI Heuristic Analyzers — Modular Entry Point
 *
 * Each heuristic is an independent module. This barrel re-exports
 * the factory function for each analyzer and the composite factory.
 */

import type { BehaviorAnalyzer } from '../analyzers';
import type { AnalyzerConfig } from './types';
import { createReworkFrictionAnalyzer } from './reworkFriction';
import { createErrorRecoveryCostAnalyzer } from './errorRecoveryCost';
import { createLostnessLightAnalyzer } from './lostnessLight';
import { createHickHymanAnalyzer } from './hickHyman';
import { createKlmLightAnalyzer } from './klmLight';
import { createPracticeCurveAnalyzer } from './practiceCurve';
import { createFittsLawAnalyzer } from './fittsLaw';
import { createSteeringLawAnalyzer } from './steeringLaw';
import { createFormFrictionAnalyzer } from './formFriction';
import { createFocusSwitchCostAnalyzer } from './focusSwitchCost';
import { createInformationScentAnalyzer } from './informationScent';

export function createBuiltinBehaviorAnalyzers(config?: AnalyzerConfig): BehaviorAnalyzer[] {
  return [
    createReworkFrictionAnalyzer(config),
    createErrorRecoveryCostAnalyzer(config),
    createLostnessLightAnalyzer(config),
    createHickHymanAnalyzer(config),
    createKlmLightAnalyzer(config),
    createPracticeCurveAnalyzer(config),
    createFittsLawAnalyzer(config),
    createSteeringLawAnalyzer(config),
    createFormFrictionAnalyzer(config),
    createFocusSwitchCostAnalyzer(config),
    createInformationScentAnalyzer(config),
  ];
}

export {
  createReworkFrictionAnalyzer,
  createErrorRecoveryCostAnalyzer,
  createLostnessLightAnalyzer,
  createHickHymanAnalyzer,
  createKlmLightAnalyzer,
  createPracticeCurveAnalyzer,
  createFittsLawAnalyzer,
  createSteeringLawAnalyzer,
  createFormFrictionAnalyzer,
  createFocusSwitchCostAnalyzer,
  createInformationScentAnalyzer,
};

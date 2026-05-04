# Adaptive Behavior

This is the layer that makes Anya UI *adapt* rather than just *generate*. It runs a measured pipeline against every user interaction, surfaces the cost of using your interface in calibrated terms, proposes UI changes when the cost is high, and measures whether those changes actually helped.

If you only need generative views, you can skip this guide. If you want your interface to learn from how people actually use it, this is the load-bearing piece.

## What gets measured

When `uiMemory.behavior.enabled` is `true`, the framework runs the **behaviour pipeline** every time the trigger fires (typically after a session ends or when N interactions have accumulated). The pipeline does five things:

1. **Project events into signals.** Raw `interaction.measured` events become `BehaviorSignal` records — typed measurements with target size, travel distance, modality, success, retry count, etc.
2. **Reduce into segments and summaries.** Signals are grouped per session and per `contextArchetype` (a logical task identifier — typically derived from the workflow or view kind).
3. **Run analyzers.** Ten HCI heuristics evaluate the data and emit findings.
4. **Build composites.** Findings are fused into four composite friction scores per `(actor, contextArchetype)`.
5. **Reduce outcomes.** For any recommendations whose application was previously recorded, the reducer compares the current composite to the baseline and emits an outcome finding.

The full data flow:

```
RuntimeEvent (interaction.measured)
       ↓
UiEventCollector.collect → MemoryStore.appendEvents
       ↓ (TriggerManager fires)
UiBehaviorPipeline.runAnalysis():
  events → signals (signalProjector)
  signals → segments (segmentReducer)
  segments → session summaries (sessionSummaryProjector)
  summaries → aggregates (aggregateReducer)
  scheduler.run(analyzers) → BehaviorFinding[]
  interpretBehaviorFindings → retained findings → MemoryStore reflections/patterns
  buildBehaviorComposites(retained findings) → BehaviorComposite[]
  reduceRecommendationOutcomes → outcome findings + resolved AppliedRecommendations
```

## The ten heuristics

Each is a pure function from signals to findings. They are independent, share grouping utilities (`grouping.ts`), and all exported individually so you can subset them or add your own.

| Analyzer | Measures | Source signals |
|---|---|---|
| `fitts_law` | Pointer target acquisition difficulty (ID, throughput) | `targetWidthPx`, `travelPx` |
| `steering_law` | Drag-path constraint difficulty | `pathLengthPx`, `pathWidthPx` |
| `hick_hyman` | Decision time from choice-set size | `choiceSetSize` |
| `klm_light` | Operator burden (actions + retries + waits + modality switches) | mixed |
| `focus_switch_cost` | Modality and focus switching pressure | `modality`, `focusMovesSinceLast` |
| `information_scent` | Navigation quality (revisit/oscillation) | navigation signals |
| `lostness_light` | Spatial disorientation in view transitions | navigation signals |
| `form_friction` | Input correction pressure | `valueLength`, `deltaLength` |
| `error_recovery_cost` | Failure recovery effort | `success`, `waitMs`, `actionFamily` |
| `rework_friction` | Retry frequency per context | session retry counts |
| `practice_curve` | Trajectory of burden across sessions (improvement detection) | summaries over time |

Each finding carries:

```ts
{
  id, actorId, analyzerId, kind,           // 'reflection_candidate' | 'pattern_candidate' | ...
  conceptKey, scopeKey,                    // e.g. 'fitts:browse_scan', 'context:browse_scan'
  confidence: 0..1,
  support: number,                         // how many sessions/signals back this
  severity: 'low' | 'medium' | 'high',
  evidenceRefs: string[],                  // pointers to the underlying signals
  payload: { contextArchetype, ...metrics } // analyzer-specific metrics
  createdTs,
}
```

## Composites — the prompt-facing scores

Findings are detailed, but they're individually noisy and hard to act on. The composite reducer fuses related heuristics into four named scores per task context:

| Composite | Heuristics fused | What it tells you |
|---|---|---|
| `motor_friction` | fitts_law, steering_law | Pointer/path effort is high — targets too small or too far |
| `cognitive_load` | hick_hyman, klm_light, focus_switch_cost | Too many decisions or modality switches |
| `wayfinding_health` | information_scent, lostness_light | The user is getting lost or oscillating between views |
| `input_friction` | form_friction, error_recovery_cost, rework_friction | Forms and recovery flows are causing rework |

`practice_curve` is intentionally excluded — it's a *trajectory* signal, not a cost, and aggregating it would obscure direction of change.

The score is a **confidence-weighted average of severity**:

```
score = Σ(confidence_i × severityScore_i) / Σ(confidence_i)
severityScore: high=1.0, medium=0.6, low=0.25
severity:      score >= 0.7 → high
               score >= 0.4 → medium
               else         → low
```

Composites are persisted in `BehaviorStore` with a deterministic id `bcomp:<actor>:<kind>:<context>`, so each pipeline run overwrites cleanly. They surface in the planner prompt under `### Interaction Friction Summary`:

```
## UI Memory Priors
### Interaction Friction Summary
Per-context composite scores (0–1) fused from related heuristics.
- [high] Motor friction in Browse Scan: score 0.82 (confidence 0.84, support 7, from fitts_law, steering_law).
- [medium] Input friction in Checkout: score 0.51 (confidence 0.71, support 5, from form_friction, rework_friction).
```

The agent gets a calibrated, summarised view of friction without having to interpret 10+ raw findings.

## Recommendations — friction made actionable

`ViewRecommendationEngine` ranks retained findings (filtered through the interpreter policy) into top-N proposals. The score combines:

```
score = w_confidence · confidence
      + w_recency    · recency_normalized
      + w_support    · support_normalized
      + w_severity   · severityToScore(severity)
      + w_context    · contextScore           // task-class match
      + w_composite  · compositeScore         // boost from the matching composite
      + w_outcome    · outcomeBias            // history of similar applications
```

Default weights live in the engine constructor; override via `new ViewRecommendationEngine({ ranking: { compositeWeight: 0.4, ... } })`.

A recommendation looks like:

```ts
{
  id: 'finding-form-friction',
  analyzer: 'form_friction',
  priority: 1,
  score: 0.91,
  severity: 'high',
  confidence: 0.84,
  support: 5,
  summary: 'Repeated correction loops are showing up in Checkout.',
  recommendation: 'Shorten forms, prefill where possible, add inline validation.',
  evidence: [{ label: 'avgRetryRate', value: '28%' }],
  target: { viewId, workflow: 'checkout', ... },
  scope: 'context:checkout',
}
```

The `recommendation` field is imperative because it's about to be inlined into a user intent (`"Revise the current view in checkout to address: ..."`) when the agent is asked to revise.

## Closing the loop

This is the part that takes Anya from "open-loop advisor" to "perceptual control." Three steps:

### Step 1 — record the application

After applying a recommendation, capture the current composite as a baseline:

```ts
const ui = useAnyaUI();
const engine = ui.context.viewRecommendations;
if (engine) {
  await engine.recordApplication({
    recommendation: rec,
    contextArchetype: 'checkout',
    appliedSessionId: currentSessionId,
  });
}
```

This persists an `AppliedRecommendation` in the behaviour store with the baseline `motor_friction` (or whichever composite the analyzer maps to) at the moment of application.

If the analyzer doesn't map to a composite (e.g. `practice_curve`), the record is created without a baseline and the outcome remains "inconclusive" — but the application is still tracked.

### Step 2 — accumulate post-application sessions

The pipeline tracks how many sessions in the same `contextArchetype` have happened since `appliedTs`. The threshold is `POST_APPLICATION_SESSIONS = 3`. Below that, the applied record stays open and no outcome is emitted.

### Step 3 — outcome attribution

Once the threshold is reached, on the next pipeline run `reduceRecommendationOutcomes`:

- Looks up the current composite for the same `(kind, context)`.
- Compares to baseline. With `OUTCOME_DELTA = 0.05`:
  - `score < baseline - 0.05` → **improved**
  - `score > baseline + 0.05` → **regressed**
  - within ±0.05 → **neutral**
  - composite missing → **inconclusive**
- Emits a `recommendation_outcome` finding (kind `reflection_candidate`) and marks the applied record resolved with the outcome and delta.

The outcome flows through the same interpreter pipeline as any other finding — it lands in `MemoryStore` as a reflection and in `BehaviorStore` as a finding.

### Step 4 — feedback into ranking

When the recommendation engine builds its next ranked list, it filters out findings with `analyzerId === 'recommendation_outcome'` (so they're not surfaced as recommendations themselves) but uses them as a **bias**:

| Outcome | Bias |
|---|---|
| improved | +1 |
| regressed | -1 |
| neutral | -0.5 |
| inconclusive | 0 |

For each candidate recommendation, the engine looks up the most recent matching outcome (same `analyzerId`, same `contextArchetype`) and adds `outcomeWeight × bias` to the score. By default `outcomeWeight = 0.25`, which is enough to materially reorder the list when history is informative but not so much that a single outcome dominates.

This means: **a regressed Fitts adaptation in checkout will rank lower the next time the engine considers a Fitts-style proposal in checkout.** The system literally learns from its mistakes.

## Calibration

Weight tuning, threshold tuning, and policy tuning all happen through the calibration harness in `behavior/calibration.ts`. A `CalibrationFixture` declares:

- A set of `findings` (synthetic or replayed from production).
- Expected `operations` (which ones should promote to memory, which should be retained as diagnostic, which should be ignored).
- Expected `composites` — ranges that the composite reducer should produce: `{ kind, contextArchetype, scoreMin?, scoreMax?, severity? }`.

`evaluateCalibrationProfile(profile, fixtures)` runs the interpreter and the composite reducer, then computes:

```
score = 0.30 · precision
      + 0.30 · recall
      + 0.15 · exactMatch
      + 0.25 · compositeMatchRate
```

`rankCalibrationProfiles([...], fixtures)` returns profiles sorted by score. Use it in CI: any heuristic tweak that drops a fixture's composite out of its expected range is caught immediately.

## Customising the pipeline

### Subset the analyzers

```ts
import { createFittsLawAnalyzer, createFormFrictionAnalyzer } from 'anya-ui/core';

<AnyaProvider
  uiMemory={{
    enabled: true,
    actorId,
    behavior: {
      enabled: true,
      analyzers: [createFittsLawAnalyzer(), createFormFrictionAnalyzer()],
    },
  }}
>
```

If `analyzers` is omitted, all built-ins run.

### Custom analyzer

A `BehaviorAnalyzer` is a small object:

```ts
const myAnalyzer: BehaviorAnalyzer = {
  id: 'long_dwell',
  dependencies: ['signals'],
  cadence: 'rollup',
  minInteractions: 3,
  run(input) {
    const slow = input.signals.filter((s) => (s.waitMs ?? 0) > 5000);
    if (slow.length === 0) return { findings: [] };
    return {
      findings: [createBehaviorFinding({
        actorId: input.actorId,
        analyzerId: 'long_dwell',
        kind: 'reflection_candidate',
        conceptKey: 'long-dwell:overall',
        confidence: 0.7,
        support: slow.length,
        severity: 'medium',
        evidenceRefs: slow.map((s) => s.id),
        payload: { contextArchetype: 'global', avgWaitMs: avg(slow.map(s => s.waitMs!)) },
      })],
    };
  },
};
```

Pass it into `behavior.analyzers`. To make findings flow into composites, choose an `analyzerId` listed in the composite mapping table (or extend the mapping by patching `composites.ts`).

### Capture every run

For debugging or replay, wire `onBehaviorAnalysisRun` on the Provider:

```tsx
<AnyaProvider
  onBehaviorAnalysisRun={(capture) => {
    console.log('analyzers ran', capture.scheduler.runRecords);
    console.log('integration', capture.integration);
    console.log('composites', capture.composites);
    console.log('outcomes', capture.outcomeFindings, capture.resolvedRecommendations);
  }}
>
```

The capture includes the full analyzer schedule result, integration counts, computed composites, and any outcome findings emitted on this run.

## Persistence

By default everything lives in `InMemoryBehaviorStore` and is lost on reload. For production, supply your own:

```ts
behavior: {
  enabled: true,
  store: new YourPersistentBehaviorStore(),
}
```

The interface is in `src/core/memory/ui/behavior/store.ts` and includes signals, segments, summaries, aggregates, findings, composites, and applied recommendations. None of the methods are optional — implement them all.

The `MemoryStore` (which holds preferences, patterns, reflections, episodes) supports `'memory' | 'localstorage' | 'sqlite' | 'indexeddb'` via the `storePolicy` config. The behaviour store has no shipped persistence adapters — bring your own when you're ready.

## Practical recipe

```tsx
function AdaptivePanel() {
  const ui = useAnyaUI();
  const engine = ui.context.viewRecommendations;
  const [recs, setRecs] = useState([]);

  useEffect(() => {
    if (!engine) return;
    ui.listCurrentViewRecommendations({ limit: 3 }).then(setRecs);
  }, [ui.viewState.spec?.id, engine]);

  const apply = async (rec) => {
    if (!engine) return;
    // 1. Record application BEFORE the change happens, so the baseline
    //    reflects pre-application friction.
    await engine.recordApplication({
      recommendation: rec,
      contextArchetype: rec.target.workflow ?? 'global',
    });
    // 2. Run the agent session that performs the change.
    await ui.runViewRecommendationUpdate(rec, { transport });
    // 3. Refresh the panel.
    const next = await ui.listCurrentViewRecommendations({ limit: 3 });
    setRecs(next);
  };

  if (!recs.length) return null;
  return (
    <aside aria-label="Adaptive suggestions">
      {recs.map((r) => (
        <button key={r.id} onClick={() => apply(r)}>
          [{r.severity}] {r.summary}
        </button>
      ))}
    </aside>
  );
}
```

That's the whole loop in one component: list, apply with recording, refresh. The framework handles the rest — friction measurement, composite reduction, outcome attribution, and rank biasing — every time the pipeline runs.

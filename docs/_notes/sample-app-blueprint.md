# Sample App Blueprint (internal)

A minimal realistic example to anchor the docs. Keeps shape, not full code. Pulled into Getting Started.

## Scenario

A "task triage" app. The user types an intent ("help me prioritize today's tasks"); the agent generates a UI made of registered components (TaskList, PrioritySlider, CategoryFilter, TimelineView). Over time the system learns:

- The user prefers `TimelineView` over `TaskList` for week-spanning tasks → preference memory
- Wide pointer travel between filter and list → motor_friction composite high
- After several sessions, the system suggests "Move filters into the list header" → user accepts → outcome reducer attributes a drop in motor_friction → future similar suggestions ranked higher.

This is concrete enough that a reader can map it to their own domain.

## Skeleton (verified APIs only)

```tsx
// 1. Components
const TaskList = defineComponent({
  name: 'TaskList',
  description: 'Vertical list of tasks with completion state',
  propsSchema: z.object({
    title: z.string(),
    tasks: z.array(z.object({ id: z.string(), label: z.string(), done: z.boolean() })),
  }),
  render: ({ props, onInteraction }) => (
    <ul>
      {props.tasks.map((t) => (
        <li key={t.id}
            onClick={() => onInteraction('toggle', {
              propName: 'done',
              previousValue: t.done,
              newValue: !t.done,
              targetIds: [t.id],
            })}>
          {t.label}
        </li>
      ))}
    </ul>
  ),
});

// 2. Transport (host-supplied; calls the LLM)
const transport = createAgentSessionTransport(async (input, ctx) => {
  // Call your LLM with input.systemPrompt + input.messages
  // Stream view spec back as session events
  return { events: yourEventStream };
});

// 3. Provider
<AnyaProvider
  nodes={[TaskList, PrioritySlider, CategoryFilter]}
  workflows={[triageWorkflow]}
  uiMemory={{
    enabled: true,
    actorId: currentUser.id,
    behavior: { enabled: true },
    runPrompt: yourLLMCallback,
  }}
>
  <App />
</AnyaProvider>

// 4. The app
function App() {
  const ui = useAnyaUI();

  return (
    <>
      <input onSubmit={(intent) => ui.runAgentSession({
        userIntent: intent,
        messages: [],
        transport,
      })} />
      <AdaptiveRenderer viewSpec={ui.viewState.spec} />
      <RecommendationsPanel />
    </>
  );
}

// 5. Recommendations panel — uses the adaptive layer
function RecommendationsPanel() {
  const ui = useAnyaUI();
  const [recs, setRecs] = useState<ViewRecommendation[]>([]);

  useEffect(() => {
    ui.listCurrentViewRecommendations().then(setRecs);
  }, [ui.viewState.spec?.id]);

  return recs.map((r) => (
    <button key={r.id} onClick={() => ui.runViewRecommendationUpdate(r, { transport })}>
      {r.summary}
    </button>
  ));
}
```

## Doc usage

- README: link the blueprint as the headline example.
- Getting Started: walk through this skeleton in 5 steps.
- Concepts: refer to TaskList for "what is a Node", triageWorkflow for "what is a Skill".
- Adaptive Behavior: the motor_friction story above is the canonical example.

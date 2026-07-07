# gstack review for AI Validator

Reviewed: 2026-06-27

Source repo: https://github.com/garrytan/gstack

## Short verdict

`gstack` is not a direct competitor to AI Validator. It is an AI-assisted software factory: a set of role-based workflows, browser tooling, planning gates, QA/review rituals, context memory, and release discipline.

The best ideas to borrow are not the browser daemon or Claude-specific slash commands. The best ideas for this app are:

- Turn vague user intent into a structured process.
- Use specialist roles with explicit outputs, not one generic assistant.
- Save decisions, plans, and learnings so each project compounds.
- Make every AI result actionable: tasks, tests, launch checklist, or next interview.
- Add quality gates and confidence scores before users trust generated output.

## What gstack does especially well

### 1. Workflow over chat

`gstack` treats AI work as a sprint:

`Think -> Plan -> Build -> Review -> Test -> Ship -> Reflect`

This is the strongest concept for us. AI Validator currently has several strong modules, but the user can still experience them as separate screens:

- idea form
- validation report
- advisor panel
- task manager
- research
- pricing / conjoint / conversion / angles

Borrowed idea:
Create a visible project journey that tells the founder what stage they are in and what to do next.

Suggested AI Validator flow:

`Idea -> Office Hours -> Market Simulation -> Review Findings -> Advisor Plan -> Task Sprint -> Evidence / Launch Readiness`

### 2. Office-hours forcing questions

`gstack`'s office-hours skill is built around hard product questions:

- Who specifically has this pain?
- What is the current workaround?
- Is there demand or just interest?
- What is the smallest wedge someone would pay for?
- What behavior proves the problem is real?

This maps directly to AI Validator. Our current form collects the idea, but it could first challenge the founder before simulation.

Implementation:

- Add a pre-validation "Founder Office Hours" step.
- Ask 5-7 questions before running validation.
- Store answers in `IdeaFormData.discovery_answers`.
- Feed answers into `/api/validate`, `/api/audiences`, and advisor knowledge.

Example questions:

- "Name one specific buyer and the moment when this problem becomes painful."
- "What do they use today instead?"
- "What would make them switch this week?"
- "What would prove this is a must-have, not a nice-to-have?"
- "What is the smallest paid pilot version?"

### 3. Review modes

`gstack` uses different review postures:

- scope expansion
- selective expansion
- hold scope
- scope reduction

This is very useful for us because founders often need different advice depending on stage.

Implementation:

Add "Strategy Mode" after validation:

- `Go bigger`: find bigger/10x version of the opportunity.
- `Tighten wedge`: reduce scope to the smallest sellable pilot.
- `Fix objections`: focus only on blockers from skeptics.
- `Prepare launch`: turn report into landing page, outreach, and experiments.

This could be a new on-demand route:

- `POST /api/strategy-review`

Inputs:

- idea
- report
- selected mode
- tasks / knowledge if project is saved

Output:

- one-line recommendation
- accepted scope
- not-in-scope
- next 5 tasks
- risks
- open decisions

### 4. Spec and implementation alternatives

`gstack` forces 2-3 approaches before implementation:

- minimal viable
- ideal architecture
- optional third path

For AI Validator, this becomes startup strategy, not code architecture.

Implementation:

Add "Approach Alternatives" to the validation report or advisor panel:

- `MVP pilot`
- `Premium wedge`
- `Marketplace / partner-led path`

Each should include:

- effort
- risk
- who it is for
- first experiment
- success metric
- what to avoid

This would make the report feel less like a score and more like a decision engine.

### 5. Quality gates and confidence scoring

`gstack` does not treat AI output as automatically correct. It uses review loops, confidence scores, adversarial checks, and "do not proceed" gates.

Our report currently has a score, but not enough explanation of confidence.

Implementation:

Add `confidence` and `evidence_quality` fields to `ValidationReport`:

```ts
confidence: {
  score: number;
  label: 'low' | 'medium' | 'high';
  reasons: string[];
  missing_evidence: string[];
}
```

Display this near the report summary:

- "Confidence: medium"
- "Why: good persona spread, weak real-world evidence, no competitor proof."
- "What would increase confidence: 5 interviews with business buyers, landing page CTR, pricing test."

This prevents the app from overclaiming synthetic results.

### 6. Context memory and learning

`gstack` has a "brain" concept: project product digest, goals, recent decisions, learnings, and cross-session memory.

AI Validator already has `ProjectKnowledge`, advisor chat, and tasks. This is one of our strongest foundations.

Implementation:

Upgrade `ProjectKnowledge` with:

- `decisions`: durable product/business decisions
- `experiments`: planned/running/completed experiments
- `learnings`: what has been learned from validation, advisors, and user edits
- `assumptions`: assumptions still unproven

Add a background route:

- `POST /api/project-memory`

Modes:

- `extract_decisions`
- `extract_learnings`
- `extract_assumptions`
- `summarize_next_step`

Use it after:

- validation
- advisor messages
- task completion
- research report generation

### 7. QA as a product feature

`gstack`'s QA flow opens a real browser, tests flows, fixes bugs, and writes reports. We should not copy its browser daemon, but the product idea is valuable.

For AI Validator, QA means launch readiness, not code QA.

Implementation:

Add "Launch QA" for a project:

- landing page clarity check
- objection coverage
- pricing clarity
- proof/trust audit
- CTA quality
- mobile UX checklist if website URL exists
- competitor positioning check

We already have `website_url` and `website_context`; this can plug into existing research/website parsing.

Possible route:

- `POST /api/launch-qa`

Output:

- QA score
- issues by severity
- fixes
- landing page copy suggestions
- missing proof
- recommended A/B tests

### 8. Design review / AI slop detection

`gstack` explicitly calls out AI slop in design review. This maps well to generated landing pages, pitch copy, positioning, and marketing angles.

Implementation:

Add "Anti-slop review" for:

- elevator pitch
- target audience
- marketing angles
- action plan
- landing page copy

Checks:

- Is the copy generic?
- Is the promise specific?
- Is there a concrete buyer?
- Does the CTA match the market stage?
- Are objections answered directly?

This could be integrated into existing `/api/angles` or new `/api/copy-review`.

### 9. Readiness dashboard

`gstack` has concepts like landing report, queue status, review logs, and dashboard views of process state.

AI Validator could use a project readiness dashboard:

Sections:

- Validation: done / stale / missing
- Buyer clarity: weak / medium / strong
- Business-side proof: weak / medium / strong
- User-side demand: weak / medium / strong
- Pricing confidence
- Launch copy readiness
- Tasks open
- Experiments running

This would make saved projects feel alive.

## What not to copy

- Do not copy the browser daemon. Our environment already has web/browser features where needed, and our users are founders, not agent-tool power users.
- Do not copy slash-command UX directly. In our product, workflows should be buttons/cards/tabs, not commands.
- Do not add huge process overhead before the first validation. The app's core promise is fast validation. Use office-hours as optional or lightweight, not mandatory for every user.
- Do not expose too many internal AI-agent terms. Users should see "Strategy Review", "Launch QA", "Next Sprint", not "plan-ceo-review".

## Recommended implementation roadmap

### Phase 1: High-impact, low-risk

1. Add Founder Office Hours before validation
- 5-7 hard questions.
- Save answers on the idea.
- Feed answers into validation and audience prompts.

2. Add confidence/evidence quality to reports
- New `report.confidence`.
- UI block in Dashboard.
- Prompt asks model to list missing real-world evidence.

3. Add Strategy Mode after validation
- Four modes: Go Bigger, Tighten Wedge, Fix Objections, Prepare Launch.
- Route: `/api/strategy-review`.
- Store result on project.

4. Upgrade task manager to "Next Sprint"
- Tasks grouped by Product / Marketing / Sales / Research / Legal.
- Each task has source: objection, question, advisor, strategy review.

### Phase 2: Make projects compound

5. Add project memory extraction
- Decisions, learnings, assumptions, experiments.
- Show them in advisors.
- Use them in future prompts.

6. Add launch readiness dashboard
- Score each readiness dimension.
- Show "next best action".

7. Add assumptions and experiments
- Convert report risks into experiments.
- Track status and result.

### Phase 3: Advanced differentiation

8. Add launch QA from website URL
- Analyze page clarity, CTA, proof, objections.
- Suggest fixes.

9. Add anti-slop copy review
- Detect generic marketing.
- Rewrite into sharper market-specific copy.

10. Add workflow orchestration
- A guided project state machine:
  - Idea captured
  - Discovery complete
  - Validation complete
  - Strategy selected
  - Sprint active
  - Launch QA ready
  - Evidence collected

## Concrete data model additions

```ts
interface DiscoveryAnswer {
  question: string;
  answer: string;
  category: 'buyer' | 'pain' | 'status_quo' | 'wedge' | 'proof' | 'risk';
}

interface ReportConfidence {
  score: number;
  label: 'low' | 'medium' | 'high';
  reasons: string[];
  missing_evidence: string[];
}

interface StrategyReview {
  mode: 'go_bigger' | 'tighten_wedge' | 'fix_objections' | 'prepare_launch';
  recommendation: string;
  accepted_scope: string[];
  not_in_scope: string[];
  next_tasks: ProjectTask[];
  risks: string[];
  open_decisions: string[];
  created_at: string;
}

interface ProjectExperiment {
  id: string;
  title: string;
  hypothesis: string;
  metric: string;
  status: 'planned' | 'running' | 'done';
  result?: string;
  created_at: string;
  updated_at: string;
}
```

## Suggested UI changes

### Home / idea form

- Add optional "Sharpen idea first" card.
- If clicked, open Founder Office Hours mini flow.
- Show progress: `Idea -> Discovery -> Simulation`.

### Results dashboard

- Add "Confidence & missing evidence" card.
- Add "Choose strategy mode" section.
- Replace generic action plan with "Recommended next sprint".

### Advisors page

- Add persistent side panel:
  - Decisions
  - Assumptions
  - Experiments
  - Open tasks

### Projects page

- Add readiness badges:
  - Validation score
  - Confidence
  - Open sprint tasks
  - Launch readiness

## Best first implementation

Start with:

1. Founder Office Hours
2. Report Confidence
3. Strategy Review

Why this order:

- It directly improves the core validation experience.
- It reuses current validation/report architecture.
- It does not require new auth, billing, browser infra, or external services.
- It makes the product feel more like a founder operating system, not just a synthetic survey.

## Source notes

Repo reviewed:

- README and skill list: https://github.com/garrytan/gstack
- Architecture: https://github.com/garrytan/gstack/blob/main/ARCHITECTURE.md
- Office-hours workflow: https://github.com/garrytan/gstack/tree/main/office-hours
- CEO review workflow: https://github.com/garrytan/gstack/tree/main/plan-ceo-review
- Engineering review workflow: https://github.com/garrytan/gstack/tree/main/plan-eng-review
- QA workflow: https://github.com/garrytan/gstack/tree/main/qa
- Review workflow: https://github.com/garrytan/gstack/tree/main/review

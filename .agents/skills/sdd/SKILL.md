---
name: sdd
description: >-
  Use this skill to perform Spec-Driven Development (SDD) workflow. 
  Trigger this when the user wants to specify, plan, and implement a new feature following a structured, spec-driven approach.
---

# Spec-Driven Development (SDD) Workflow

This skill teaches the agent how to follow the SDD methodology.
In SDD, specifications dictate implementation. The process consists of five distinct phases.

## Phase 1: Specify
- Gather requirements from the user.
- Create a `specs/<feature-name>/spec.md` document.
- Include user stories, acceptance criteria, and non-functional requirements.

## Phase 2: Plan
- Analyze the `spec.md` to create a technical plan.
- Create `specs/<feature-name>/plan.md`.
- Include technology choices, data models, API contracts, and architecture diagrams.

## Phase 3: Tasks
- Break the plan down into actionable, sequential tasks.
- Create `specs/<feature-name>/tasks.md`.
- Mark parallelizable tasks with `[P]`.

## Phase 4: Implement
- Execute the tasks sequentially.
- Write code that satisfies the contracts defined in the plan.
- Do NOT deviate from the plan without updating it first.

## Phase 5: Converge
- Verify the implementation against the original `spec.md` and `plan.md`.
- Create tests and fix any discrepancies.
- Mark tasks as `[x]` in `tasks.md` once complete.

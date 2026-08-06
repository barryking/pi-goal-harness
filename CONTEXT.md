# Goala Goal Lifecycle

Goala governs one outcome-oriented Goal from intent through independent verification. It may consume versioned guidance from an optional external memory provider, but it does not own long-term memory.

## Language

**Goal**:
A durable, phase-spanning statement of an outcome, its acceptance contract, current plan, progress, defects, and verification state.
_Avoid_: Task, job, memory

**Goal Memory Context**:
The immutable, bounded set of versioned memory documents selected and captured when one Goal begins.
_Avoid_: Recall packet, live memory, attachment

**Advisory Memory**:
Remembered guidance that may inform a Goal but may be overridden by stronger current repository evidence.
_Avoid_: Requirement, source of truth

**Binding Memory**:
User-approved remembered guidance that forms part of a Goal's acceptance contract; conflicts must be surfaced explicitly.
_Avoid_: Preference, suggestion

## External boundary

Goala may discover, search, and read promoted documents through Dream's generic
read-only interop API. Dream, Candidate, Store promotion, and Remember this are
external Dream concepts, not Goala domain concepts. Goal completion produces
only Goal state and ordinary Pi sessions; it emits no memory receipt or episode.

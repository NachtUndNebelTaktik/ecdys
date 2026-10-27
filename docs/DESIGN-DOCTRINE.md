# EcDys — Design Doctrine

A working document. This isn't a style guide that happens to have values bolted on. It's the reverse: the values come first, and every visual decision is downstream of them. If a design choice can't be traced back to a line in here, it's decoration, and it doesn't ship.

## The thesis

Most security software performs security. Glowing wireframes, threat-level dashboards, red alerts, "AI-powered" sparkles. It looks like a film about hacking and behaves like a marketing page.

EcDys should look like a tool that someone actually relies on. The aesthetic of a well-made instrument: precise, quiet, legible, and honest about its own limits.

You stand for technical sovereignty, minimal trusted computing base, cryptographic trust that's physically segregated, and telling the truth even when the truth is inconvenient. Those aren't product features — they're a worldview, and a worldview shows up in how a thing is built and how it looks.

So the first rule:

EcDys does not perform. It reports.

## Eight principles

### 1. The interface is a witness, not a performer

Everything on screen must be traceable to something that actually happened.

- No simulated progress bars, no invented metrics, no "estimated 12 threats blocked."
- No animation that implies work happening when nothing is happening.
- If a value is unknown, it says unknown. It never says zero.
- If a job hasn't started, it says queued. It doesn't pretend to be 4% complete.
- If a number is stale, it's dated. Staleness is information.

Test: could a hostile auditor ask "where did this number come from?" and get an answer? If not, cut it.

### 2. Every boundary is drawn

Your doctrine is physical segregation — red USB in, green USB out, air gaps, unidirectional flow. That has a visual corollary: the operator must always be able to see which side of a boundary they're on.

- Encrypted vs decrypted: visually distinct, always.
- Local vs remote: stated, not implied.
- Sandboxed vs host: shown on the tool card and in the run confirmation.
- Vault locked vs unlocked: a persistent, unmissable state, not a toast that vanishes.
- Data leaving the machine: an explicit indicator, every time, on the specific action that causes it.

No boundary should ever be invisible. An invisible boundary is the same as no boundary.

### 3. Calm under load

This is a working environment for someone doing difficult, sometimes adversarial research. An interface that shouts at you makes you worse at that.

- No pulsing red alerts. No siren aesthetics. No jitter.
- Severity communicated by position, weight and label — not by strobe.
- Crimson is a signal, not a mood. Used sparingly, it means this matters. Used everywhere, it means nothing.
- Motion exists to explain a change in state. It never exists to fill silence.
- Motion budget: under 200ms, eased, and skippable. prefers-reduced-motion isn't a checkbox, it's the default assumption.

### 4. Structure over decoration

Chrome is the UI equivalent of attack surface. Every pixel that isn't carrying information is a pixel that can mislead.

- One border. One radius. One shadow level. Enough.
- Gradients only where they encode depth that means something.
- No glassmorphism, no parallax, no floating orbs, no decorative noise textures.
- Whitespace is a component. It's how density stays readable at three panels open.
- When in doubt: remove the element, not the information.

### 5. Nothing that matters is hidden

You don't do dark patterns, so the product doesn't either.

- Destructive action needs friction, not camouflage. Confirmation isn't a trick question.
- Consent is granular and pre-split, never bundled behind one "Accept."
- No pre-checked boxes. No "remind me later" that trains the operator to ignore the thing that mattered.
- Retention and deletion behaviour is stated in the UI, in plain language, at the point of action.
- If the product can see something, it says so. If it can't, it says that too.

### 6. Reversibility, with weight where it belongs

- Undo everywhere it's cheap: layout, notes, mindmap edits, filter changes.
- Irreversible actions get a second look, and the second look says what will actually be lost.
- "Deleted" means deleted, and says whether it's recoverable.
- The interface never destroys something the operator didn't intend to lose because of a mis-click on a 24px target.

### 7. The operator's hands, not the product's

Sovereignty is a UX property, not just an architectural one.

- Layout belongs to the operator. Move it, split it, float it, save it.
- Tools belong to the operator. They choose which exist, from where, and whether to trust them.
- Data belongs to the operator. Export is a first-class action, not a hostage negotiation.
- No forced accounts. No feature gated behind a sign-in that doesn't need to exist.
- The app must be fully functional with the premium tier uninstalled, not merely disabled.

### 8. Language is a material

The product speaks like a competent colleague, not a brand.

- Declarative, specific, unhurried. "Stored locally. Encrypted at rest. Not synced."
- No exclamation marks. No "Oops!" No mascot voice.
- No hedging that hides a limitation: say "persistent sessions are not yet available," not "coming soon."
- Name things by what they do. Secure cloud storage, not Nimbus. Browsing report, not Insights.
- Every error states what happened, what it means, and what to do next — in that order.

## The visual language

Derived from the principles, not chosen from a mood board.

### Colour

- One accent. Crimson (#dc143c) as the default, because it reads as a signal rather than a brand colour, and it survives on a dark surface without glowing.
- Everything else is neutral: near-black grounds, two surface steps, hairsline rules. The palette is deliberately small so that when something is coloured, it means something.
- Status is a dot plus a word. Filled = active. Hollow = inert. Never colour alone, because colour alone fails for a meaningful fraction of people.
- Light mode is a real mode, not a compromise. Same hierarchy, inverted weights.
- Red is reserved. If crimson appears on every card, the operator stops seeing it on the one card that's actually a problem.

### Type

- Two registers: humanist sans for prose and labels, monospace for values, identifiers, hashes, statuses, timestamps.
- That split is doing real work — it's how an operator distinguishes "what this is" from "what it currently says."
- Tight, confident sizing. No fluid clamp theatre. The scale is small and consistent.
- Mono for anything that might be copied, compared, or pasted into a terminal.

### Space

- 4px base grid. Consistent rhythm beats clever spacing.
- Density is a feature at panel level, generosity is a feature at page level. Cramped everywhere reads as cheap; airy everywhere wastes the operator's screen.
- Alignment is non-negotiable. One thing off-grid is more noticeable than one thing missing.

### Iconography

- Single weight, single stroke, geometric, 24-unit grid. They should look drawn by one hand on one afternoon.
- Icons support the label; they never replace it. No mystery meat navigation.
- No filled/solid duotone sets. No emoji. No illustrative hero art.

### Motion

- State change only. 120–180ms. Eased, not springy. No bounce — bounce is playfulness, and this isn't play.
- Nothing loops, pulses, or breathes in the background.
- Every animation has a reduced-motion equivalent that is simply "the end state, immediately."

## What EcDys must never look like

A list worth keeping visible, because the drift is always toward these:

- Cyberpunk theatre — matrix rain, wireframe globes, hexagon grids, glowing nodes on a world map.
- SaaS dashboard cosplay — hero gradients, 3D isometric illustrations, "Trusted by 10,000 teams."
- Gamification — streaks, badges, points, confetti, "You're on a roll!"
- Fake intelligence — sparkle icons, "AI magic," confidence percentages with no model behind them.
- Urgency manipulation — countdown timers, "Only 2 seats left," red banners for non-emergencies.
- Mascots and personality — a friendly robot, a chatty empty state, jokes in error messages.
- Decoration masking absence — an illustration where a feature should be, a skeleton loader that never resolves.

Every item on that list is a way of performing competence instead of demonstrating it.

## Where the doctrine bites

Design principles are cheap until they cost something. These are the real tensions in EcDys, and how they resolve:

Density vs calm. Three panels, a console streaming, and a mindmap is inherently busy. Resolution: density is allowed inside panels; the frame around them stays quiet. Chrome gets the whitespace budget, content gets the pixels.

Security friction vs usability. Every lock, confirmation and warning costs the operator attention. Resolution: friction is proportional to irreversibility, not to category. Unlocking is cheap. Purging a cloud copy is expensive to do by accident, so it's expensive to confirm.

Sovereignty vs onboarding. A tool that hands you an empty socket is honest but intimidating. Resolution: the empty state is a designed screen with three clear paths and one working example, not a shrug. Guide without taking control.

Honesty vs confidence. "Persistent sessions are not yet available" is worse marketing than "seamless persistence." Resolution: ship the honest sentence. An operator who trusts your limitations will trust your claims.

Premium vs principle. Cloud sync, detachable notepad, larger storage — all legitimate, all optional. Resolution: premium adds reach, never capability. Nothing core is ever behind the paywall, because a sovereignty tool that gates sovereignty is a contradiction.

## The five-question test

Before anything ships — a screen, a component, a sentence, an animation — it has to pass:

1. Can I trace this to a real event? (Witness, not performer.)
2. Can the operator see which side of every boundary they're on? (Boundaries drawn.)
3. If I removed this element, would any information be lost? (Structure over decoration.)
4. Does this respect the operator's attention and their ownership? (Their hands.)
5. Would I be comfortable if the source code and the marketing copy were read side by side? (Honesty.)

Five yeses. Anything less goes back.

## One sentence

EcDys looks like a tool that respects the person holding it: quiet, precise, honest about its limits, and never pretending to be more than it is.

That's the whole doctrine. Everything else in this document is that sentence, applied.

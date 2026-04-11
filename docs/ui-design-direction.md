# UI Design Direction

## Core Direction
Create a Wordle-inspired puzzle interface with a parchment and eggshell material language, then layer in saturated pastel accents for state and emphasis. The result should feel editorial, tactile, and lightly nostalgic rather than dark, neon, or overly glossy.

## Visual Character
- Composition: centered, compact, and puzzle-first.
- Tone: warm, printed, slightly vintage, but still crisp and modern.
- Surfaces: parchment, cream, eggshell, and soft paper gradients.
- Accents: restrained but saturated pastel colors for feedback states and atmospheric glows.
- Overall feel: readable, deliberate, and designed rather than decorative.

## Palette
Use semantic Tailwind theme tokens rather than hardcoded colors in components.

Primary tokens:
- `paper-*` for shell and surface layers
- `ink` and `ink-soft` for text
- `header`, `description`, `label`, and `badge` for hierarchy
- `shell` for borders and containers
- `glow-*` for soft background atmosphere
- `tile-*` tokens for tile states
- `control-*` tokens for buttons and interactive chrome

## Typography
- Display face: `Fraunces`
- Body face: `Alegreya Sans`
- Use the display face for the title and the body face for all supporting copy and controls.
- Keep letter spacing slightly expanded on labels and actions to preserve the editorial puzzle feel.

## Layout
- Keep the board centered inside a soft paper card.
- Avoid glassmorphism, dark panels, and heavy neon glow.
- Use generous outer breathing room with a focused inner composition.
- Maintain the 5x5 board structure and the current component hierarchy.

## Tiles
- Tiles should read like physical puzzle pieces.
- Prefer squarer corners with subtle rounding, paper-like fills, and soft depth.
- Use warm neutral styling for default tiles.
- Use pastel red and pastel green/teal for alternate states.
- Keep letter rendering bold and highly legible.

## Controls and Status UI
- Current word panel should feel like a note card or paper label.
- Submit button should look like a soft printed action chip rather than a neon CTA.
- Status chips should stay compact and editorial.

## Motion and Effects
- Keep motion subtle.
- Use hover lift, soft shadows, and gentle emphasis only.
- Atmospheric background blurs are okay if they remain diffuse and paper-like.
- Avoid distracting animation or arcade-style flashing.

## Guardrails
- Do not revert to dark glass UI.
- Do not use generic system-font stacks.
- Do not use purple-heavy gradients or common AI-generated neon styling.
- Do not copy Wordle literally; use it as a structural reference only.

## Implementation Notes
- Define shared colors in `src/index.css` using Tailwind v4 theme variables.
- Consume those tokens in component class names instead of repeating raw hex values.
- Keep browser chrome, page background, and component surfaces aligned with the same palette.

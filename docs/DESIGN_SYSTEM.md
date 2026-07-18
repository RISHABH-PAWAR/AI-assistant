# Design System — "Warm Clinical"

The visual language for the Lakeside Dental agent, derived from the
[Pythagoras AI](https://getpythagoras.ai/) aesthetic: a premium, healthcare-grade feel
built on **warm cream backgrounds, a coral→pink→purple accent, generous whitespace, soft
rounded surfaces, and calm, smooth motion**. No harsh or saturated "eye-piercing"
colors — everything is muted and warm.

> Tokens are the single source of truth. They live in machine-readable form at
> [`design-tokens.json`](../design-tokens.json) and as CSS variables at
> [`web/src/styles/tokens.css`](../web/src/styles/tokens.css). Components reference
> variables — never hard-coded hex.

---

## 1. Design Principles

1. **Calm over loud.** Warm neutrals dominate; color is used sparingly for emphasis.
2. **Soft, not flat.** Rounded corners, hairline borders, low-opacity warm shadows.
3. **Motion with intent.** Every animation eases in/out, 160–420ms, and respects
   `prefers-reduced-motion`. Nothing blinks, bounces harshly, or flashes.
4. **One accent, used well.** The coral→pink→purple gradient is the brand signature;
   it appears on the send button, key highlights, and user bubbles — not everywhere.
5. **Legibility first.** AA contrast on all text; body copy is warm slate, not pure grey.

---

## 2. Color Tokens

### Brand / accent
| Token | Hex | Use |
|---|---|---|
| `--brand-coral` | `#F0553D` | Primary accent, CTA, send button, user bubble start |
| `--brand-coral-hover` | `#DB4832` | Hover/active on coral surfaces |
| `--brand-coral-soft` | `#FCEAE4` | Tinted background (badges, hovers) |
| `--brand-pink` | `#D65C93` | Gradient mid-stop |
| `--brand-purple` | `#8A6FE8` | Gradient end-stop |
| `--brand-gradient` | `linear-gradient(90deg,#F0553D 0%,#D65C93 55%,#8A6FE8 100%)` | Accent text, user bubble, hero highlight |

### Surfaces & background
| Token | Hex | Use |
|---|---|---|
| `--bg-base` | `#FDF7F3` | App background (warm cream) |
| `--bg-glow` | `radial-gradient(1200px 600px at 50% -10%, #FBE4DA 0%, #FDF7F3 60%)` | Soft peach glow behind hero/header |
| `--surface` | `#FFFFFF` | Cards, assistant bubbles, composer |
| `--surface-subtle` | `#FBF4EF` | Secondary panels, system lines |
| `--border` | `#EFE6DF` | Hairline dividers, card borders |

### Text
| Token | Hex | Contrast | Use |
|---|---|---|---|
| `--text-ink` | `#1B1A26` | AAA on cream | Headings, primary text |
| `--text-slate` | `#5E5D6B` | AA | Body copy, subtitles |
| `--text-muted` | `#95949F` | AA (large) | Timestamps, captions, placeholders |
| `--text-on-accent` | `#FFFFFF` | AA on coral | Text on coral/gradient surfaces |

### Semantic (muted, never neon)
| Token | Hex | Use |
|---|---|---|
| `--success` | `#3FA57A` | Booking confirmed indicator |
| `--danger` | `#C24A38` | Error text (warm, coral-family) |
| `--danger-soft` | `#FBE7E2` | Error background |

---

## 3. Typography

| Role | Family | Weight | Size / line |
|---|---|---|---|
| Display (hero) | **General Sans** (fallback Inter) | 700 | 48–56 / 1.05, tight tracking `-0.02em` |
| H1 | General Sans | 700 | 32 / 1.15 |
| H2 | General Sans | 600 | 24 / 1.2 |
| Body | **Inter** | 400 | 16 / 1.6 |
| Body-strong | Inter | 500/600 | 16 / 1.6 |
| Small | Inter | 400 | 14 / 1.5 |
| Caption | Inter | 400 | 13 / 1.4, `--text-muted` |

Fonts are loaded from Fontshare (General Sans) + Google Fonts (Inter), both free and
self-hostable. If offline, the stack degrades to `system-ui, sans-serif` cleanly.

---

## 4. Radius, Spacing, Elevation

**Radius:** `--r-xs 8`, `--r-sm 12`, `--r-md 16`, `--r-lg 20`, `--r-pill 999`.
Buttons/badges/input = pill; cards/bubbles = `--r-lg`.

**Spacing** (4px base): `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64`.

**Elevation** (warm, low-opacity — never a hard black shadow):
| Token | Value |
|---|---|
| `--shadow-sm` | `0 1px 2px rgba(27,26,38,.04)` |
| `--shadow-md` | `0 4px 16px rgba(27,26,38,.06)` |
| `--shadow-glow` | `0 8px 30px rgba(240,85,61,.14)` (coral CTA/focus) |

---

## 5. Motion Tokens

| Token | Value | Use |
|---|---|---|
| `--ease-standard` | `cubic-bezier(.4,0,.2,1)` | Most transitions |
| `--ease-out-soft` | `cubic-bezier(.16,1,.3,1)` | Entrances (fade-up) |
| `--ease-spring` | `cubic-bezier(.34,1.3,.64,1)` | Send button press, bubble pop (subtle) |
| `--dur-fast` | `160ms` | Hover, focus, color |
| `--dur-base` | `240ms` | Bubble entrance, panel open |
| `--dur-slow` | `420ms` | Hero/section reveal |

**Named animations**
- **Message enter:** `opacity 0→1`, `translateY 8px→0`, `scale .98→1` over `--dur-base`
  with `--ease-out-soft`.
- **Typing indicator:** three 6px dots, staggered opacity pulse (0/150/300ms), 1.2s loop.
- **Send button:** scale `1→.94→1` on press with `--ease-spring`; coral glow on focus.
- **Section reveal (marketing header):** fade-up on mount, staggered 60ms per element.

**Accessibility:** a global `@media (prefers-reduced-motion: reduce)` block disables
transforms/animations and keeps only instant opacity — required, not optional.

---

## 6. Component Specs (chat app)

### App shell
Warm `--bg-base` with `--bg-glow` behind a slim header. Centered column, max-width
`720px`, comfortable side padding on mobile.

### Header
Coral heart-in-chat glyph + "Lakeside Dental" wordmark (General Sans 600). A small pill
badge: live dot (`--brand-coral`) + "Virtual receptionist" — echoes the site's
"Now in production…" chip.

### Assistant bubble
`--surface`, `--text-ink`, `--r-lg`, `--shadow-sm`, hairline `--border`, left-aligned,
max-width 78%. Enters with the Message-enter animation.

### User bubble
`--brand-gradient` background, `--text-on-accent`, `--r-lg` (tighter bottom-right
corner `--r-sm` for the "tail"), right-aligned, `--shadow-glow` at low opacity.

### System / tool-trace line
Centered `--text-muted` caption on `--surface-subtle`, e.g.
`· checked availability for Jul 20 ·` — subtle, collapsible.

### Composer
Pill input (`--surface`, `--border`, focus ring = coral glow) + circular coral send
button with a north-east arrow. Enter submits; Shift+Enter newlines. Disabled + spinner
while awaiting the agent.

### Empty state
A warm greeting bubble from the assistant on load ("Hi! I can help you book, check, or
cancel an appointment at Lakeside Dental…") with two suggestion chips.

---

## 7. What Makes It Read as "Premium," Not "Vibe-Coded"

- Consistent 4px spacing rhythm and a single radius language.
- Real type scale with a display face — not default browser fonts.
- Warm, layered shadows and a radial background glow instead of flat white.
- Restrained color: one gradient, used deliberately.
- Micro-interactions (focus rings, press states, staggered entrances) that ease, never snap.
- Full dark-on-warm contrast compliance and reduced-motion support.

---

## 8. Do / Don't

| Do | Don't |
|---|---|
| Use the gradient for one hero moment per view | Paint whole panels in saturated coral |
| Keep motion under ~420ms, eased | Bounce, spin, or flash elements |
| Reference tokens (`var(--…)`) | Hard-code hex in components |
| Warm greys for body text | Pure `#000`/`#666` cold greys |
| Honor `prefers-reduced-motion` | Force animation on everyone |

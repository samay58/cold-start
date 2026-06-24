# Theme Sources (Phase 0)

Date: 2026-06-24. Purpose: extract the real "Kyoto Paper Dark" palette the extension dark
mode should feel like, verify contrast, and record any deltas from the spec v0
(`docs/product/extension-dark-mode-spec-2026-06-24.md`).

## What was searched

- `~/.config/ghostty/config` and `~/.config/ghostty/themes/`
- `/Applications/Ghostty.app` resources (no bundled Kyoto themes there; the user themes win)
- `/Applications/Codex.app` and `~/.codex` (no color-theme resource file)
- iTerm2-Color-Schemes repo (not present on this machine)

## Finding: there is no theme literally named "Kyoto Paper Dark"

The Kyoto family on this machine is a set of paired day/night themes. Two are dark:

- `kyoto-yoru` (夜, night): cool charcoal ground with a faint blue cast. Cool paper-white
  foreground. This is the COOL night theme.
- `kyoto-sumi` (墨, ink): warm sumi-ink ground with washi-cream foreground. Described in its
  own header as "paper on ink, night side of the same paper." This is the WARM night theme.

The active Ghostty config switches by OS appearance:

```
theme = light:kyoto-geppaku,dark:kyoto-yoru
```

So when macOS flips dark, Ghostty actually lands on `kyoto-yoru`, the COOL one. The aesthetic
the spec describes (warm, paper-toned, aged off-white, never cold blue) is `kyoto-sumi`, not the
`kyoto-yoru` the OS toggle reaches. The right anchor for Cold Start's warm paper dark is
`kyoto-sumi`, with the brand seal kept true to the dusty-lilac identity rather than borrowing
sumi's pinker murasaki.

## Extracted palettes (exact)

### kyoto-sumi (warm night, the anchor)

```
background           #1c1815
foreground           #e6dcc6
cursor               #6f88c6
selection-background #2e3346
selection-foreground #f3ead6
0  #2a2520   8  #79705f
1  #d2685c   9  #e27a6b   vermilion (朱)
2  #9aa86d  10  #abb87e   moss/sage (松葉)
3  #e0a65c  11  #ecb56e   amber (琥珀)
4  #7e96cc  12  #93a8d8   indigo (藍)
5  #b98eae  13  #c9a0be   murasaki (江戸紫)
6  #71b0a6  14  #84c0b6   asagi teal (浅葱)
7  #cabda4  15  #f4ead6
```

### kyoto-yoru (cool night, what the OS toggle actually reaches)

```
background           #181b21
foreground           #dbe1e6
cursor               #7790ce
selection-background #2c3344
selection-foreground #eef3f7
0  #282d33   8  #6e767c
1  #d26c60   9  #e37e6e
2  #82af8a  10  #95c09c
3  #dfa85f  11  #ecb570
4  #7e97ce  12  #93acdc
5  #b58db0  13  #c6a0c2
6  #6fb2ad  14  #82c2be
7  #c2c9ce  15  #eef3f7
```

### kyoto-washi (warm light, the day sibling of sumi) and kyoto-paper-light

```
kyoto-washi        background #f4ebd9  foreground #38302a
kyoto-paper-light  background #f7efdf  foreground #433227
kyoto-geppaku      background #e7ecf0  foreground #2e3439  (cool light, OS-light toggle)
```

These confirm the family logic: washi/sumi are the warm paper pair, geppaku/yoru are the cool
pair. Cold Start's light theme already lives in the warm-paper register (field `#f7f5ee`), so the
warm night sibling (sumi) is the honest dark counterpart.

## Contrast verification (WCAG 2.1, computed in code)

Targets: primary text >= 7:1, secondary >= 4.5:1, required dividers/dots >= 3:1 against the
adjacent surface. Decorative hairlines may sit below 3:1 because they are never the sole
affordance (spec decision). All three candidates pass.

| Candidate | ground | primary ink | secondary muted | required divider | surface lift |
|---|---|---|---|---|---|
| A: spec v0 | #18130F | 13.71:1 | 6.86:1 | 3.49:1 | 1.073:1 |
| B: kyoto-sumi authentic | #1c1815 | 12.95:1 | 9.51:1 | 4.28:1 | 1.162:1 |
| C: hybrid (recommended) | #1b1612 | 13.35:1 | 6.84:1 | 3.75:1 | 1.080:1 |

Notes:

- Candidate A (spec v0) is nearly black and deeply warm. Its plate barely lifts from the field
  (1.07:1), which is intentional: lift comes from edge highlight, grain, and shadow, not gray
  contrast. Risk: at near-black the aged-paper warmth reads less.
- Candidate B is the literal sumi theme. Its muted at 9.51:1 reads almost as bright as primary,
  so text hierarchy flattens, and its seal (`#c9a0be`) is sumi's mauve, not the brand lilac.
- Candidate C keeps a warm sumi-leaning ground a touch lighter than near-black, the brand
  dusty-lilac seal lifted (not sumi mauve), and evidence accents nudged from sumi's ANSI set but
  tuned so each stays distinct by hue and comfortably above target.

## Candidate C token map (recommended v0-final)

```
--color-field        #1b1612   warm paper-dark ground
--color-plate        #241d18   raised paper (lift via edge + grain + shadow)
--cs-surface-2       #2c241d   popovers, active rows, nested cards
--cs-surface-sunken  #15110D   wells, track backgrounds
--color-ink          #E8DDC9   primary text, aged off-white   (13.35:1)
--color-muted        #AC9E88   secondary text, labels         (6.84:1)
--color-rule         #5E5142   decorative hairline (not sole affordance, 2.33:1)
--color-rule-strong  #80705A   required divider/input border  (3.75:1)
--color-seal         #BBA8DF   dusty-lilac seal, lifted       (8.36:1)
--color-verified     #7FC2B2   independent source, asagi teal (8.77:1)
--color-reported     #94ACD6   reporting/press, indigo        (7.80:1)
--color-company      #D8AC60   company-sourced, amber         (8.54:1)
--color-conflict     #DD8678   conflict, vermilion           (6.63:1)
--color-focus        #DBBB4F   brand gold focus, kept         (9.60:1)
```

Catalogue aliases (extension borrows): `--cat-ground #16120E`, `--cat-paper #241d18`,
`--cat-paper-edge #80705A`, `--cat-ink #E8DDC9`, `--cat-muted #AC9E88`, `--cat-rule #5E5142`,
`--cat-rule-strong #80705A`.

## Border and surface-lift correction (2026-06-24, live-observed)

Candidate C shipped with a near-black surface lift (about 1.08:1 plate over field) on
the theory that edge highlight, grain, and shadow would carry separation. On real
cards (a generated Mercor dossier) that proved too subtle: People rows, the
Employees/Round/HQ fact cells, the research module rows, and the research stack tiles
all lost their edges. Two of the light border tokens had also collapsed onto the dark
ground value, so those borders were invisible rather than faint. The fix raises the
dark surface and border tokens only; light is unchanged.

New dark values and their measured contrast (WCAG 2.1, in code):

| Token role | before | after | ratio after |
|---|---|---|---|
| raised paper fill vs ground #1b1612 | #2a221b (1.15:1) | #322a20 | 1.27:1 |
| hairline `--cs-rule` vs fill | #5e5142 (1.80:1) | #8a7660 | 3.25:1 (4.14:1 vs ground) |
| required border `--cs-rule-strong` vs fill | #80705a (2.90:1) | #9c8870 | 4.15:1 (5.27:1 vs ground) |
| research-module border (was ground value) | #1c1712 (invisible) | #a89678 @0.82 | 3.80:1 vs fill |
| primary ink on fill | | #e8ddc9 | 10.50:1 |
| secondary muted on fill | | #ac9e88 | 5.38:1 |

People rows and the research stack tiles carry the company-amber and seal hues, which
stay put; only their dark carrying alpha lifts (people border 0.48 to 0.62 = 3.54:1,
has-email seal 0.18 to 0.44, dormant card 0.22 to 0.58 = 3.28:1) in a dark-only block
so the light card is untouched. The people-and-fact-cell state is now captured in
`tests/e2e/sidepanel-dark.spec.ts` to lock the regression.

## Open verification (live, needs the browser)

- Confirm `prefers-color-scheme: dark` inside the MV3 side panel reflects OS/browser dark in
  Chrome and Dia.
- Confirm Dark Reader DOM markers (`html[data-darkreader-scheme]` = `dark`/`dimmed`) on a real
  darkened tab in Dia. Deferred to the Phase 6 bridge.

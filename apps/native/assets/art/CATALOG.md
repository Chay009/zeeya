# Zeeya art catalog

The illustration layer. Icons are for navigation and controls only; every
category and every section/state moment gets a piece of art from this set.
Anything data-bound, tiny, repeated or purely geometric (progress, charts,
status pills, the "all caught up" tick, card surfaces) is SVG in code instead.

## Style (every piece)

Flat 2.5D vector illustration — clearly drawn, never a photo, a 3D render,
puffy/neumorphic plastic, metal or emoji. Each piece is an iconic symbol of
its category, not a product shot. The prompt block, verbatim:

> Style: flat 2.5D vector ILLUSTRATION for a premium fintech app; clearly
> drawn, not a photo and not a 3D render. Each object is an iconic symbol
> reduced to a few bold geometric shapes, slight 3/4 view from above, clean
> crisp edges, no outlines. Flat colour fills with gentle two-tone shading
> (one lighter face, one darker face) and at most one simple highlight shape
> per surface. Natural but slightly muted colours of the object. Exactly ONE
> small detail per object in Zeeya lime #C9EF69 (a handle, a string, a lid, a
> stripe); the rest of the object is NOT lime. Small flat soft ellipse shadow
> directly underneath. Must read instantly at 48px.
> Avoid: 3D render look, glossy plastic, puffy or inflated forms, neumorphism,
> soft glow, photorealism, realistic textures, outlines, line art, emoji
> faces, gradients beyond a gentle tint shift, text, numbers, logos.

## Pipeline

1. Generate transparent PNGs with the style block above, as sprite sheets (a
   strict grid, generous gaps): categories 6×3 on a 1536×1024 sheet (about
   250px each, enough for 192px), section art 2×2 on 1024×1024 (about 400px
   each). Cut a sheet with
   `node scripts/slice-art-sheet.mjs <sheet.png> <names.txt> <cols> <rows> <out-dir>`
   — it finds each object, keeps it whole, and drops background-removal
   debris.
2. `node scripts/build-art.mjs <folder-of-pngs>` — trims, resizes (categories
   192px, section art 480px), writes `assets/art/<name>.webp`, and regenerates
   `components/art/art-sources.ts` from everything in `assets/art`, so a
   batch of a few pieces adds or replaces them without dropping the rest.
3. Use it: `<Art name="hero-jar" size={92} />`, `<CategoryTile label="Food" />`,
   `<EmptyState art="hero-search" … />`. A missing piece renders its icon
   fallback, so the app never breaks while the set is incomplete.

## Categories — `cat-*` (shown 40–112px)

Mapped from the parser's merchant categories (`vendor_seed.json`) and
transaction types by `categoryArt()` in `features/insights/category-visual.ts`
(first match wins). `hub`, `enterprise`, `corporation` and `indian` in the seed
are merchant-name words, not spending kinds, and fall through to `cat-other`.

| Art | Subject | Labels it covers |
|---|---|---|
| `cat-food` | burger | Food, Hospitality, Wines, cafes/restaurants |
| `cat-groceries` | basket of vegetables | groceries, supermarkets, marts |
| `cat-travel` | suitcase + boarding pass | Travel, Railway, flights, hotels |
| `cat-fuel` | fuel pump | Fuel, petrol |
| `cat-transport` | hatchback | Automobile, cabs, metro |
| `cat-shopping` | kraft shopping bag | Shopping, E-Commerce, Fashion, Cosmetics, Salon |
| `cat-entertainment` | cinema ticket + popcorn | Entertainment, movies, OTT |
| `cat-bills` | receipt with bolt | Communication, Payments, utilities, recharge |
| `cat-invest` | potted plant, arrow leaf | Monetary (mutual funds, SIP, insurance, stocks) |
| `cat-health` | capsule + cross | Medical, Lab, Fitness, pharmacy |
| `cat-home` | house | Household, Hardware, rent |
| `cat-electronics` | laptop + headphones | Electronic, Gadget |
| `cat-education` | books + cap | Stationary, Publishing, education |
| `cat-transfer` | phone sending a paper plane | Transfer, UPI, NEFT, IMPS, RTGS, AEPS, wallet |
| `cat-cash` | Indian banknote stack | Withdrawal, ATM |
| `cat-emi` | calendar + card + auto-repeat arrow | EMI, auto-debit, loans |
| `cat-cashback` | card with return arrow | Refund, Cashback |
| `cat-other` | price tag | everything else (Transaction, Pet, …) |

## Sections & states — `hero-*` (shown 68–160px)

| Art | Subject | Where |
|---|---|---|
| `hero-wallet` | wallet with card + coins | Home balance card |
| `hero-jar` | jar of coins | Home budget card, Budgets summary |
| `hero-target` | target with dart | No budgets yet (Home, Budgets, Analytics) |
| `hero-calendar` | desk calendar | Coming up; no transactions this month |
| `hero-subscriptions` | play card + repeat arrow | Subscriptions empty state |
| `hero-insights` | rising bars + arrow | No money moved this week |
| `hero-cards` | fanned bank cards | Accounts empty state |
| `hero-shield` | phone + shield | SMS permission / privacy |
| `hero-search` | magnifier over receipt | Search with no results |

"All caught up" (`hero-check`) is deliberately not art: it becomes an SVG tick.

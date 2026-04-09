# Auto-Generated Browser Automation Verbs

This is a fork of [Browserbase Stagehand](https://github.com/browserbase/stagehand) that demonstrates **automated generation of browser automation verbs** — reusable, typed Python functions that automate common tasks on real websites.

The key insight: given only a **natural-language task description** and a **target website**, an AI agent can explore the site, discover reliable selectors, and produce a production-quality Playwright script — all without a human writing a single line of automation code.

## What's a Verb?

A **verb** is a typed Python function that automates a specific task on a specific website. For example:

- `search_amazon_products(page, request)` — search Amazon and return product listings
- `search_booking_hotels(page, request)` — search Booking.com for hotels with dates and guests
- `search_hertz_cars(page, request)` — find rental cars on Hertz for given dates
- `search_huggingface_models(page, request)` — find ML models on HuggingFace matching criteria

Every verb has:
- **Typed request/response dataclasses** — no generic dicts, each parameter and return field is explicit
- **A built-in test** — the file runs standalone as a test, or can be imported as a module
- **Pure Playwright** — the final verb uses zero AI calls at runtime; all selectors were discovered during generation

## The Verb Library — 55 Sites and Counting

All generated verbs live under [`auto_verbs/verbs/`](auto_verbs/verbs/). Each website has its own folder:

| Site | Verb | What it does |
|------|------|-------------|
| `amazon_com` | `search_amazon_products` | Search products, extract name/price/rating |
| `airbnb_com` | `search_airbnb_listings` | Search vacation rentals by destination/dates/guests |
| `booking_com` | `search_booking_hotels` | Search hotels with check-in/out dates |
| `expedia_com` | `search_expedia_flights` | Search flights between cities |
| `hertz_com` | `search_hertz_cars` | Search rental cars at an airport |
| `huggingface_com` | `search_huggingface_models` | Find ML models by criteria |
| `zillow_com` | `search_zillow_listings` | Search real estate listings |
| `uber_com` | `search_uber_rides` | Get ride estimates between locations |
| ... | ... | *55 sites total* |

## How a Verb Gets Generated

Each verb is generated through a **two-step pipeline**, driven entirely by prompt files in the case folder.

### Step 1: Create the Trajectory (`prompt-create-trajectory.txt`)

This is the starting point. Each case folder contains a `prompt-create-trajectory.txt` that describes:
1. The target website URL
2. A concrete task with specific example values

For example, `hertz_com/prompt-create-trajectory.txt`:
```
* The target website
https://www.hertz.com

* Concrete task
- Search for a car rental at "Los Angeles International Airport (LAX)".
- Pick-up date is 2 months from today. Drop-off date is 5 days later.
- compose a list of available cars (up to 5). Each has the car name/class and daily price.
- print the list.
```

An AI agent (powered by Stagehand + an LLM) reads this prompt, opens a real browser, explores the website, discovers working selectors, and generates:
- **`{site}_search.js`** — a Stagehand JS script that records the exploration
- **`{site}_search.py`** — a pure-Playwright Python script that replays the task
- **`recorded_actions.json`** — a log of every browser interaction

### Step 2: Generalize into a Verb (`prompt-create-verb.txt`)

The second prompt (`prompt-create-verb.txt`) instructs the AI to refactor the concrete script into a **reusable, typed function**:
- Identify parameters (destination, dates, max results, etc.)
- Create `@dataclass(frozen=True)` types for request and response
- Move date calculations out of the function and into the test
- Generate a `signature.txt` with the public API

### What You End Up With

A typical case folder contains:

```
auto_verbs/verbs/hertz_com/
├── prompt-create-trajectory.txt   # Step 1 input: concrete task description
├── prompt-create-verb.txt         # Step 2 input: generalization instructions
├── hertz_search.js                # Generated: Stagehand trajectory explorer
├── hertz_search.py                # Generated: typed Python verb + test
├── signature.txt                  # Generated: function signature + type defs
└── recorded_actions.json          # Generated: browser action log
```

## How to Generate a New Verb

To add a verb for a new website:

1. **Create a case folder** under `auto_verbs/verbs/` named after the site (e.g. `newsite_com/`)

2. **Write `prompt-create-trajectory.txt`** with:
   ```
   Please read auto_verbs\verbs\SystemPrompt1.txt

   * The target website
   https://www.newsite.com

   * Concrete task
   - Navigate to the search page
   - Search for "example query"
   - Extract up to 5 results with name and price
   - Print the list
   ```

3. **Copy `prompt-create-verb.txt`** from any existing case folder (it's the same across all sites)

4. **Run Step 1** — give `prompt-create-trajectory.txt` to an AI agent (e.g. GitHub Copilot) along with `SystemPrompt1.txt`. The agent will open a browser, explore the site, and generate the `.js` and `.py` files.

5. **Run Step 2** — give `prompt-create-verb.txt` to the same agent. It will refactor the Python script into a typed verb with dataclasses and a test. It will also produce `signature.txt`.

6. **Test** — run the generated Python file directly:
   ```bash
   python auto_verbs/verbs/newsite_com/newsite_blah.py
   ```

## Reliability Strategy

The generated verbs follow strict selector practices (defined in `SystemPrompt1.txt`):

- Prefer `data-testid`, `id`, `role`, `aria-label` as primary anchors
- Use semantic HTML elements (`button`, `a`, `li`) as structural landmarks
- Navigate relative to anchors rather than relying on absolute XPaths
- **Never** use CSS class names with hashes (e.g. `.sc-f8b674f0-4`) — they change on every build

## Upstream

This is a fork of [browserbase/stagehand](https://github.com/browserbase/stagehand). The `auto_verbs/` folder is the addition; the core Stagehand framework lives under `packages/`.


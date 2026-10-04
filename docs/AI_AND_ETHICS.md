# How Balanss uses AI, and the rules it follows

## What the AI does

Two stages. Our code does the analysis; the AI only phrases what the code found.

1. **Analysis — our own code, deterministic** (`backend/src/ai/analysis.ts`). Every day we look at the last 28 days of the user's data and turn it into *findings*: short factual sentences built from the real numbers. Examples:
   - "Ūdens mērķis sasniegts 5 no 7 dienām."
   - "Pēc 3 naktīm, kad miegs bija īsāks par 7 h, nākamajā dienā bija vidēji 5 300 soļu — par 36 % mazāk nekā citās dienās."
   - "4 no 14 dienām olbaltumvielas bija zem 85 % no mērķa; šajās dienās vakariņās vidēji 15 g."

   There are 11 kinds of finding. Some are positive ("what works"); the rest are opportunities. None of them is framed as a failure. Each kind has a minimum-data rule, so nothing is claimed from a single day.

2. **Writing — Claude** (`backend/src/ai/tone.ts`, `insights.ts`, `recipes.ts`). Claude receives the findings, today's numbers and the user's tone style, and writes:

   | What | Where it appears | Plan |
   |---|---|---|
   | Daily tip | Šodiena | all |
   | Weekly question, 4 answers and a reply to each | Šodiena, Friday–Sunday | all |
   | Push reminders | sleep window, water, meals | all |
   | Trends comment | Uzturs → Tendences | all |
   | Weekly summary: observations, one small suggestion, one question to reflect on | Šodiena → Nedēļas kopsavilkums | Pro |
   | Recipes that fill today's largest gap and follow the user's food preferences | Uzturs → Receptes | Pro |
   | Photo analysis and text parsing | Uzturs → Foto / Citādi | all, started by the user |
   | Pantry photo → ingredient list ("Kas ir mājās?") | Šodiena → tip → Kas ir mājās? | all, started by the user |
   | Free-time ideas: films (cinema / Go3), books, events, using **live web search** | Šodiena → Brīvais laiks | all, started by the user |

3. **Memory.** Each time we write copy, we also send what the user did before:
   - the last 4 weekly answers;
   - which tip topics were accepted, dismissed ("Cits ieteikums") or reported in the last 14 days.

   Topics that were dismissed or reported drop in the ranking; accepted ones rise. A topic reported today is not used again that day. So the AI adapts to the person without storing any free text they wrote.

Every request goes to `claude-opus-5-5` with structured JSON output, so we never parse free text. Other settings:
- effort is set per task;
- the stable instructions are cached;
- the server-side refusal fallback is on;
- only token counts are logged, never content.

If anything goes wrong — network, refusal, invalid output or a rule violation — the user sees reviewed Latvian template text instead. They never see an error or unchecked copy.

## What the AI receives, and what it doesn't

| Sent | Never sent |
|---|---|
| Numbers: nutrition vs targets, water, steps, sleep, sleep window, 7- and 28-day patterns | Name, e-mail, account ID |
| Tone style (plan / novelty / gentle / neutral) and 3 on/off modifiers | Personality test answers or scores |
| Sex, only so Latvian grammar is correct | Free text the user wrote (except text they ask us to parse, and the habits sentence below) |
| Foods logged most often in the last 28 days and favourites (names only), and the pantry list while it is current | Health Connect raw records, device IDs |
| "Mani ieradumi": one sentence the user writes for the AI in Ēšanas paradumi (≤ 240 characters), e.g. "Pirms katras maltītes apēdu dārzeņus" | |
| Food preferences (diet, foods to avoid), for recipes only | Health Connect raw records, device IDs |
| Meal photo or text — only when the user takes or types it | Location, contacts |

**AI switch.** With *AI personalizācija* off (Es → AI un privātums), none of the personal data above is sent. Tips, questions, reminders, the weekly summary and recipes then come from the template engine, which still uses the user's numbers but runs on our server. Photo analysis and text parsing still use Claude, because the user starts them.

**Processor.** Anthropic acts as a processor: data sent through the API is not used to train models. Name Anthropic in the privacy policy and note that processing may happen outside the EU.

## Pantry and free-time ideas

**What you eat and like.** Tips name foods the person already logs often or saved as favourites ("olas vai biezpiens"), in their own words, respecting diet and avoid-list. The meal reminder names a concrete option too. The habits sentence is followed as a habit (e.g. vegetables first); the prompt forbids turning it into a medical plan or claims about blood sugar, and the output filter still applies.

**Pantry.**
- The user types what they have at home, or takes a fridge photo. Claude lists only the products it can clearly see. The user checks the list before saving.
- Only the product names are stored; the photo is not. The list counts as current for 3 days.
- While the list is current, food ideas use only those products plus basics (salt, oil, spices). If nothing fits, the tip picks another topic.
- With no current list, ideas stay optional ("ja tas ir mājās", plus two ordinary alternatives). A tip never reads like a shopping list.

**Free time (Brīvais laiks).**
- Claude uses the web search tool, with the user's chosen city as an approximate location. We use no GPS and send no personal data, only the city and the choices (kind, genre, cinema/Go3, today/weekend).
- A second step turns the search notes into structured items.
- The server then checks every item:
  - each link must be one the search actually returned;
  - Go3 items must link to go3.lv;
  - screenings and events must start at least 30 minutes from now and inside the chosen window (today, or the weekend);
  - gambling and alcohol-focused events are dropped.
- Links must open the specific film, book or event: homepages, category lists and search pages are dropped. Labels say what opens ("Atvērt Go3", "Seansi un biļetes", "Pasākums un biļetes", "Atvērt grāmatu").
- If nothing passes, the user gets curated books (with a title search link, labelled "Meklēt grāmatu") and timeless ideas, with a note saying so. Events are never invented.
- Results are cached for 2 hours per city and choice. Times are re-checked against the clock on every read. There is a limit of 15 live searches per user per day.

## Ethics rules

These are enforced in three places:
1. **Prompt:** the system prompt states each rule with examples of what not to write.
2. **Automatic filter:** after generation, every text is checked. See `shared/safety.ts` `copyViolation` / `mentionsKcalBelow` and `backend/src/ai/safety.ts`. On any violation we log the reason and show a template instead.
3. **Templates:** the templates obey the same rules. A test runs every template across tone × sex × care mode × preferences × days.

The rules:
- **Invite, don't command.** Every suggestion is optional ("ja gribi", "ja sanāk"), and there is always a neutral way out of a question ("Grūti pateikt").
- **No guilt, shame or body talk.** No "neveiksme", "slikti ēdi", "vainīgs", and no words about appearance. Being over target is described neutrally ("viena diena neko neizšķir").
- **No restriction or compensation.** Never skip a meal. Never "burn it off" with exercise. Never give a daily energy amount below the floor.
- **No medical content.** No diagnoses, illnesses, medicines, supplements or "detox", and no claims about cholesterol, blood pressure or blood sugar. Habit level only.
- **No weight promises.** No "zaudēsi X kg". Weight goals move at 0,25–0,5 kg a week at most.
- **Honest data.** Only the numbers provided, or simple arithmetic on them. No invented streaks, and uncertainty is stated as uncertainty.
- **Questions are curious, not probing.** Never about weight, body image, or why something "didn't work".
- **Latvian, informal "tu", no emoji.** Numbers use Latvian format.

## Safety floors and care mode

- **Floors.** Energy targets are never below 1 200 kcal (women), 1 500 kcal (men) or 1 350 kcal (unspecified). Goal weight is never below BMI 18,5 for the user's height. No weight-loss goal is offered under 18, or when BMI is already 18,5 or below. The app enforces this in the Goals screen, and the server rejects it too.
- **Care mode** switches on automatically when any of these hold:
  - 3 or more of the last 7 days with meals logged are below 70 % of the floor;
  - weight is falling by more than 1 kg a week over at least 14 days;
  - BMI is below 18,5;
  - an older goal weight is below a healthy weight;
  - the user is under 18 with a weight-loss goal.

  While it is on:
  - all deficit and weight-loss content disappears;
  - the ring stops saying "Vēl … kcal";
  - tips focus on regular meals, rest and gentle movement;
  - a calm card suggests talking to a family doctor and shows the emotional-support line.

  *Please confirm the support number (116 123) before release.*

## User control and transparency

- Every tip, summary and recipe list is labelled either "Sagatavojis AI pēc taviem datiem" or "Balanss ieteikums", together with "nevis medicīnisks padoms".
- Every tip can be reported ("Man neder", "Dati nav pareizi", "Nepiemērots vai nepatīkams"). The tip is hidden, the report is stored for review, and the ranking learns from it.
- *Kā darbojas AI* (Es) explains all of the above in plain Latvian.
- The personality profile can be switched to a neutral tone or deleted at any time. Data export and delete-all include AI history: tips, reports, summaries and recipes.

## Checking quality

- `backend/evals/tone.eval.ts` runs 12 fixture days × 4 tones, plus an ethics set of 4 risk cases × 4 tones. The ethics cases are: a care-mode user, a low-intake day, an over-target day, and a user who keeps dismissing protein tips. `claude-sonnet-5-5` grades each output for tone, Latvian, safety and autonomy.
- Run it with `ANTHROPIC_API_KEY=… npm run eval:tone` in `backend/` before every prompt change and before release.
- It has **not** been run yet: no key was available in the build environment.

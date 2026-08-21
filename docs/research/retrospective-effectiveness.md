# What makes a retrospective actually work

Research findings for [issue #254](https://github.com/spokvulcan/poker-planning/issues/254), feeding the
[Team Retrospective ceremony map (#253)](https://github.com/spokvulcan/poker-planning/issues/253).

**Date:** 2026-08-19
**Question:** What does the evidence say makes a team retrospective effective, and what is folklore?

---

## How to read this

Retrospective practice has an unusually wide gap between *what is written about it* and *what has been
measured*. Nearly everything a practitioner reads on the subject — the five-phase agenda, Mad/Sad/Glad,
"pick three action items", the Prime Directive, "rotate the format" — comes from practitioner books,
conference talks and vendor blogs, not from studies. That literature is not worthless, but it is **not
evidence**, and this document never treats it as such.

A peer-reviewed HICSS paper puts it bluntly:

> "The way that Retros are run and possible headaches are tackled is then often based on anecdotal
> evidence and personal perceptions."
> — [Matthies & Dobrigkeit (2020)](https://arxiv.org/abs/1910.08763)

**Evidence grades used throughout:**

| Grade | Meaning |
| --- | --- |
| **A** | Meta-analysis of RCTs, or a large well-powered randomised experiment |
| **B** | Peer-reviewed empirical study with quantitative results |
| **C** | Peer-reviewed but qualitative, small-n, or student-population — suggestive, not conclusive |
| **D** | Practitioner literature, vendor material, trade press — **practice, not evidence** |

**Provenance marks.** `[FULL]` = full text read this session · `[ABS]` = publisher abstract read verbatim ·
`[2°]` = reported inside a peer-reviewed source that was read directly, original not obtained ·
**UNVERIFIED** = could not check; do not state as fact. All bibliographic details (authors, venue,
volume, pages, year) were checked against [Crossref](https://api.crossref.org/) rather than transcribed
from memory. Several widely circulated numbers turned out to be wrong; those are called out where they
appear.

---

## Verdict at a glance

| Claim | Verdict | Grade |
| --- | --- | --- |
| Structured team reflection improves team performance | **Evidenced** | A |
| The effect is much weaker for virtual than co-located teams | **Evidenced** | A |
| Independent generation before discussion beats open brainstorming | **Evidenced** | A |
| Production blocking — not shyness — is the main cause of group idea loss | **Evidenced** | A |
| Writing instead of speaking removes most of the loss | **Evidenced** | A |
| Anchoring on what is seen first narrows the space that follows | **Evidenced** | A |
| Groups over-discuss what everyone already knows (hidden profile) | **Evidenced** | A |
| Complaining is self-reinforcing and suppresses solution talk | **Evidenced** | B |
| Procedural structuring statements break the complaining cycle | **Evidenced** | B |
| Psychological safety predicts team learning behaviour | **Evidenced** | A |
| Specific + difficult goals with feedback beat "do your best" | **Evidenced** | A |
| If-then phrasing beats vague intent | **Evidenced (small)** | A |
| Identifiability reduces social loafing | **Evidenced** | A |
| Camera-on video meetings cause fatigue, which suppresses voice | **Evidenced** | A |
| Teams re-raise the same unresolved topics indefinitely | **Evidenced** | B |
| Running the ceremony is not sufficient to get the benefit | **Evidenced** | B/C |
| **Anonymity increases the volume and criticality of contributions** | **Evidenced** | B |
| **Anonymity improves idea or decision quality** | **Refuted** | B |
| **Anonymity is what levels status in electronic meetings** | **Refuted** | A |
| **Anonymity harms follow-through** | **Plausible, untested** | — |
| Retros measurably improve *software* outcomes | **Unmeasured** | — |
| The Derby & Larsen five-stage order is the right order | **Folklore** | D |
| "60 minutes every two weeks" | **Folklore** | D |
| "Limit yourself to 1–3 action items" | **Folklore (actively contradicted)** | D |
| "Rotate the format or people disengage" | **Folklore (weak, mixed)** | C/D |
| "Don't criticise during idea generation" | **Folklore (contradicted)** | B |

---

# 1. What's evidenced

## 1.1 Structured team reflection works — but the evidence is not from software

This is the strongest result in the area, and it is worth being precise about what it does and does not
say.

**Lines et al. (2021)** `[FULL]` meta-analysed **24 independent randomised controlled trials or
experiments (N = 4,339)** of *team reflexivity interventions* — structured sessions where a team stops,
evaluates how it has been working, and adapts.

> "We found a positive and significant medium overall effect of team reflexivity interventions on
> performance outcomes (g = .549) and performance behaviours (g = .548)."

— Lines, R. L. J., Pietsch, S., Crane, M., Ntoumanis, N., Temby, P., Graham, S., & Gucciardi, D. F.
(2021), *The Effectiveness of Team Reflexivity Interventions: A Systematic Review and Meta-Analysis of
Randomised Controlled Trials*, *Sport, Exercise, and Performance Psychology*,
[doi:10.1037/spy0000251](https://doi.org/10.1037/spy0000251)
([author preprint](http://www.danielgucciardi.com.au/uploads/9/7/3/6/9736343/lines_et_al.__in_press__team_reflexivity_meta-analysis.pdf) ·
[OSF](https://osf.io/ruzy4/)) — **Grade A**

Converging earlier meta-analyses, as reported in Lines et al. `[2°]` (the originals are paywalled):

- **Tannenbaum & Cerasoli (2013)**, *Do Team and Individual Debriefs Enhance Performance? A
  Meta-Analysis*, *Human Factors* 55(1):231–245,
  [doi:10.1177/0018720812448394](https://doi.org/10.1177/0018720812448394): debriefs improved performance
  by roughly **25% (k = 26, N = 2,136, d = .67)**. Team-level samples only: **k = 16, N = 546, d = .66**.
  Reflection *and* measurement both at team level: **k = 10, N = 176, d = 1.20 (≈38%)**. — **Grade A**
- **McEwan et al. (2017)**: teamwork-training programmes including team reflection had a moderate effect
  on team performance (**k = 22, ES = .64, 95% CI [.42, .86]**). — **Grade A**

### Three caveats that matter more than the headline

**1. None of this is about software retrospectives.** The trials come from aviation, medicine, military,
sport and lab teams. Extrapolation to a sprint retro is an assumption, not a finding.

**2. The effect shrinks when measured objectively.** Lines et al. found the outcome effect was salient
when self-reported (g = 1.882 — from a single study) or objectively assessed (g = .559), and essentially
nil for researcher-assessed variables (g = .054). Tannenbaum & Cerasoli likewise: subjective criteria
d = 1.07 versus objective d = .58. **Teams reliably *feel* better after reflecting; they improve by less
than they feel.** This is the same pattern as the "illusion of group productivity" in §1.4.

**3. The virtuality penalty is large, and it is the only moderator that survived.** Of 14 potentially
influential factors tested:

> "team reflexivity interventions were most effective for face-to-face teams (g = .678) when compared
> with teams who were virtual in nature (g = .166). **All other intervention, study, and outcome
> characteristics were statistically inconsequential.**"

For performance behaviours: **g = .733 face-to-face versus g = .225 virtual** (F(1,37) = 7.807, p = .008).

Mitigating detail from the same paper `[FULL]`: in the virtual studies, "team communication occurred
through chat functions or e-mails in all but one study." That is a far thinner channel than a modern
board plus video, so the penalty may partly be an artefact of the technology of the studied era. But it
is the direction of the only robust moderator, and §5.2 treats it as the central design problem.

### The most useful negative result

Facilitation (present/absent), handouts, feedback, **total reflection time**, team size, comparator type
and occupational context were all tested as moderators and were all statistically inconsequential. The
evidence supports **the act of structured collective reflection**. It does **not** support any particular
facilitation apparatus over any other, or any particular duration. Anyone claiming their specific retro
format is "the evidence-based one" is overreaching.

One suggestive exception the authors flag themselves: teams given **feedback/data** to reflect on showed
a larger effect (g = .881 present vs g = .357 absent), though noisy (SE = .30) and short of the bar for a
meaningful moderator. This is the only hint in the meta-analytic literature that bringing hard data into
a retro helps — and it lines up with §1.2, where the software literature repeatedly identifies missing
data as a quality problem.

---

## 1.2 Software-specific evidence is thin, and mostly documents failure modes

### The field admits it has not measured the thing

A review of IT project retrospectives found "multiple project retrospective definitions being used,
differing project retrospective outcomes being desired, thirteen project retrospective processes being
advocated, and **no project retrospective measurements given to confirm whether these outcomes have been
successfully achieved**" — Skinner, Land, Chin & Nelson (2015),
[AIS eLibrary](https://aisel.aisnet.org/irwitpm2015/3/) `[2°]` (quoted inside Dingsøyr et al. 2018, which
was read directly). — **Grade B**

An OpenAlex title search returned **no systematic literature review specific to agile retrospectives**.
The research literature really is this small.

### What has been observed

**Matthies & Dobrigkeit (2020)**, *Towards Empirically Validated Remedies for Scrum Retrospective
Headaches*, HICSS-53, [arXiv:1910.08763](https://arxiv.org/abs/1910.08763) ·
[hdl:10125/64504](http://hdl.handle.net/10125/64504) `[FULL]` — **Grade C** (19 retros observed across 6
Scrum teams — 4 university, 1 startup, 1 large industry department; 122 questionnaires; 18 interventions
in 14 retros).

The five "headaches" observed, with frequency:

| Headache | Definition (their words) | Times observed |
| --- | --- | --- |
| No Preparation | "Few arrangements by facilitator, participants' time not being valued, lack of structure." | 5 |
| Not Speaking Up | "Reluctance of team members to reflect or to share perceptions of (known) problems." | 4 |
| All Talk–No Action | "Few outcomes defining the next improvement steps, no clear path for improvement." | 3 |
| Focus on Negatives | "Positive aspects of previous iteration disregarded in favor of negatives, leading to low team spirit." | 1 |
| Too Repetitive | "Unchanging Retro procedures, leading to fatigue, frustration and low motivation." | 1 |

Of 10 activities deployed to remedy an identified headache, 9 worked — but **3 of 18 interventions
(16.7%) created a new headache that had not previously existed.** Changing the retro format is not free.

**Verwijs & Russo (2023)**, *A Theory of Scrum Team Effectiveness*, ACM TOSEM 32(3), Article 74,
[doi:10.1145/3571849](https://doi.org/10.1145/3571849)
([PDF](https://vbn.aau.dk/ws/files/766875248/3571849.pdf)) `[FULL]` — **Grade B**. **The only quantitative
link between retrospective quality and team effectiveness located anywhere.**

7-year mixed-methods programme; 13 field studies, then CB-SEM on ~5,000 developers across ~2,000 teams
(measurement model N = 4,919; CFI = .959, RMSEA = .038, SRMR = .035). "Sprint Retrospective Quality" is
an indicator of a **Continuous Improvement** factor (α = .834). Its low-quality markers are, literally,
*"The action items from Sprint Retrospectives are usually not implemented"* and *"Sprint Retrospectives
always yield the same issues over extended periods."*

Path results: Continuous Improvement → Stakeholder Concern **b = .616** [.491, .749], p = .001; →
Responsiveness **b = .372** [.166, .582], p = .008. **Indirect effect on team effectiveness (via
Responsiveness): .087 [.047, .152], p = .004, β = .137.**

⚠️ **Read the caveats before quoting this.** There is **no direct path** from Continuous Improvement to
Team Effectiveness; the relationship is indirect and modest (β = .137). It is cross-sectional,
single-source self-report, so common-method variance applies. And "action items get implemented" is a
*perception*, not a count. Their qualitative observation that *"a more diverse range of formats and
themes tended to generate more improvements in a broader range of areas"* is the closest thing to support
for format variety anywhere in the literature — and it is an observation, not a test.

**Lehtinen, Itkonen & Lassenius (2017)**, *Recurring opinions or productive improvements — what agile
teams actually discuss in retrospectives*, *Empirical Software Engineering* 22(5):2409–2452,
[doi:10.1007/s10664-016-9464-2](https://doi.org/10.1007/s10664-016-9464-2) `[ABS]` — **Grade B**
(longitudinal case study, **37 team-level retrospectives over almost 3 years**, large distributed
organisation). This is the empirical version of "we discuss the same things every sprint":

> "**Certain topics recurred over a long period of time**, either reflecting issues that can and have
> been solved previously, but that recur naturally as development proceeds, **or reflecting waste since
> they cannot be resolved or improved on by the team due to a lack of controllability or their
> complexity.**"

Note the mechanism: the topics that recur are the ones **the team cannot fix by itself**. Also: "the
discussions might suffer from participant bias, and in cases where they are not supported by hard
evidence, they might not reflect reality, but rather the sometimes strong opinions of the participants."

**Dingsøyr, Mikalsen, Solem & Vestues (2018)**, *Learning in the Large*, XP 2018,
[doi:10.1007/978-3-319-91602-6_13](https://doi.org/10.1007/978-3-319-91602-6_13) ·
[preprint](https://arxiv.org/pdf/1805.10310) `[FULL]` — **Grade C** (minutes from 10 retrospectives,
2 teams, 5 months, 37-developer project). 109 issues, 36 action items — ~5 per team per retro.

> "A common critique of retrospectives is that teams meet and talk, but little of what is talked about is
> acted upon. **We have not been able to assess how many of the 36 identified action items were acted
> upon**, but found in one minute that 'all action items suggested to the project management has been
> implemented'."

Also: "Given the short time spent on retrospectives, they do not seem to facilitate «deep» learning
(«double loop» learning in Argyris and Schön's framework)." And — directly relevant to permanent,
visible retro history — **"Having minutes public could also lead to critique being toned down or removed
completely."**

**Andriyani, Hoda & Amor (2017)**, *Reflection in Agile Retrospectives*, XP 2017,
[doi:10.1007/978-3-319-57633-6_1](https://doi.org/10.1007/978-3-319-57633-6_1) ·
[PDF](https://rashina.com/wp-content/uploads/2011/06/xp2017-reflection.pdf) `[FULL]` — **Grade C** (16
practitioners, 4 teams, interviews + observation).

> "Critically, we show that **agile teams may not achieve all levels of reflection simply by performing
> retrospective meetings.**"

Three levels — *reporting and responding* → *relating and reasoning* → *reconstructing* — and "the
highest level of reflection, reconstructing, may not be reached at all or not reached effectively until
the prior levels are accomplished." All four teams reviewed previous action points, as part of the
*relating and reasoning* level. **This is the closest thing in the literature to evidence that an
ordered progression matters** — but it is a 4-team qualitative case study, not a test of the ordering.

**Hundhausen, Conrad, Tariq, Pugal & Flores (2024)**, ICSE-SEET 2024,
[doi:10.1145/3639474.3640074](https://doi.org/10.1145/3639474.3640074) `[ABS]` — **Grade C** (963
statements, 32 teams, n = 182 students): "only **13%** provided justification for a strategy to be
stopped, continued, or started."

**Tariq, Conrad, Hundhausen, Yu & Adesope (2025)**, *Improving Agile Retrospectives through Metacognitive
Scaffolding*, SIGCSE TS 2025 (Best Paper, CS Education Research),
[doi:10.1145/3641554.3701927](https://doi.org/10.1145/3641554.3701927) `[ABS]` — **Grade C**. A standard
retro model was compared against an enhanced model that **scaffolds deeper reflection by prompting
participants to justify and critique their practices and weigh alternatives**: "the enhanced model led to
individuals and teams engaging in significantly higher levels of reflection." Both conditions already had
**individual brainstorming followed by team discussion** — silent-then-together is the *baseline* in this
literature, not the intervention.

This is the single best direct evidence that *prompt structure inside a retro changes what comes out of
it*, and it is a controlled comparison on the exact manipulation a guided tool performs.

**Milani, Storey, Katial & Peate (2025)**, [arXiv:2502.03570](https://arxiv.org/abs/2502.03570) `[FULL]`
— **Grade C** (survey, 19 teams, 19% response rate). Current practice:

- 84% (16/19) run retros every two weeks; 63% (12/19) run 60-minute meetings; 84% run them remotely.
- 79% use a custom retro board (Miro, FigJam, Jira).
- **"The Retro Starts Before the Meeting Start"** — one respondent: *"As a remote async team, we allow
  people to add discussion points to the retro anytime leading up to the retro."*
- 47% rated retros "VERY important" for teamwork; only **11% for the quality of the actual work**.
- One team: retros are *"a waste of time"* given current execution.
- Their design recommendation: there is "a desire for a *tool for better discussions* instead of simply a
  *new retro tool*", and tools should "make it easier for practitioners to discuss their subjective and
  objective project data in advance of the session."

### Why the field looks like this

Devanbu, Zimmermann & Bird (2016), *Belief & Evidence in Empirical Software Engineering*, ICSE '16,
found Microsoft developers' beliefs about software practice were "primarily formed based on personal
experience" rather than empirical insight `[2°]` (via Matthies & Dobrigkeit 2020). Matthies & Dobrigkeit
add that practitioners "often rely on websites and frequently updated resources rather than research
papers."

A live example: Milani et al. (2025) — a peer-reviewed SE paper — supports its psychological-safety claim
by citing a trade-magazine article and **Charles Duhigg's 2016 New York Times piece on Project
Aristotle**. Even the research literature launders journalism into citations here.

---

## 1.3 Psychological safety

**What is solid.** Edmondson, A. C. (1999), *Psychological Safety and Learning Behavior in Work Teams*,
*Administrative Science Quarterly* 44(2):350–383,
[doi:10.2307/2666999](https://doi.org/10.2307/2666999)
([open access](http://nrs.harvard.edu/urn-3:HUL.InstRepos:37968728)) `[ABS]` — **Grade B**:

> "Results of a study of **51 work teams in a manufacturing company** … show that team psychological
> safety is associated with learning behavior, but **team efficacy is not**, when controlling for team
> psychological safety. As predicted, **learning behavior mediates between team psychological safety and
> team performance.**"

The construct has since accumulated a large evidence base, reviewed and meta-analysed:

- Frazier, M. L., Fainshmidt, S., Klinger, R. L., Pezeshkan, A., & Vracheva, V. (2017), *Psychological
  Safety: A Meta-Analytic Review and Extension*, *Personnel Psychology* 70(1):113–165,
  [doi:10.1111/peps.12183](https://doi.org/10.1111/peps.12183) — **Grade A**. *Bibliographic record
  verified; the corrected correlations were not obtained this session — do not quote numbers from it
  without checking.*
- Newman, A., Donohue, R., & Eva, N. (2017), *Psychological safety: A systematic review of the
  literature*, *Human Resource Management Review*,
  [doi:10.1016/j.hrmr.2017.01.001](https://doi.org/10.1016/j.hrmr.2017.01.001) `[ABS]`.
- Nembhard, I. M., & Edmondson, A. C. (2006), *Making it safe: the effects of leader inclusiveness and
  professional status on psychological safety and improvement efforts in health care teams*, *Journal of
  Organizational Behavior* 27(7):941–966, [doi:10.1002/job.413](https://doi.org/10.1002/job.413).
- Edmondson, A. C. (2003), *Speaking Up in the Operating Room: How Team Leaders Promote Learning in
  Interdisciplinary Action Teams*, *Journal of Management Studies* 40(6):1419–1452,
  [doi:10.1111/1467-6486.00386](https://doi.org/10.1111/1467-6486.00386).

**Two corrections to the folk version of this literature**, both important for retro design:

**(a) Fear of looking bad beats futility as a reason for silence.** Milliken, F. J., Morrison, E. W., &
Hewlin, P. F. (2003), *Journal of Management Studies* 40(6):1453–1476,
[doi:10.1111/1467-6486.00387](https://doi.org/10.1111/1467-6486.00387) `[ABS]` — 40 interviews:

> "**The most frequently mentioned reason for remaining silent was the fear of being viewed or labeled
> negatively**, and as a consequence, damaging valued relationships."

The retro-tool instinct is to fix silence with "nothing changes anyway" remedies (action tracking,
follow-up). The evidence says the dominant driver is **image risk**, which is a different problem with
different remedies.

**(b) "Nothing changes so people give up" is weaker than assumed, and one good study points the other
way.** Deichmann, D., & van den Ende, J. (2014), *Organization Science* 25(3):670–690,
[doi:10.1287/orsc.2013.0870](https://doi.org/10.1287/orsc.2013.0870) `[ABS]` — 1,792 ideas from 908
employees in a corporate innovation programme: "we **unexpectedly find that failures, rather than
successes, of initiators increase the likelihood of repeat initiative taking.**" Rejection *increased*
subsequent participation. The honest reading: **rejection with a decision ≠ silence with no decision**,
and only the former is well studied.

The best-designed study of the resignation spiral is Knoll, M., Hall, R. J., & Weigelt, O. (2019),
*Journal of Occupational Health Psychology* 24(5):572–589,
[doi:10.1037/ocp0000143](https://doi.org/10.1037/ocp0000143) `[ABS]` — >600 adults, four-wave
cross-lagged panel: prior **acquiescent** silence ("nothing will change anyway") predicted later
depersonalisation and emotional exhaustion, and burnout predicted all four silence types later. A
reciprocal spiral, with proper temporal ordering.

**On Project Aristotle:** widely cited as proof that psychological safety is the top predictor of team
effectiveness. It is an internal Google analysis, not peer-reviewed, with no published data or methods.
Cite Edmondson and Frazier et al.; treat Aristotle as **Grade D**.

---

## 1.4 Silent generation beats open discussion — this is the best-evidenced finding here

This literature is old, large, replicated, and points one direction. It is also the literature that most
directly justifies the locked "async collection before sync discussion" decision.

### Nominal groups beat interacting groups

**Mullen, B., Johnson, C., & Salas, E. (1991)**, *Productivity Loss in Brainstorming Groups: A
Meta-Analytic Integration*, *Basic and Applied Social Psychology* 12(1):3–23,
[doi:10.1207/s15324834basp1201_1](https://doi.org/10.1207/s15324834basp1201_1) `[FULL]` — **Grade A**.
18 articles / 20 studies; **34 tests for quantity** (2,577 individuals in 844 groups), 9 for quality.

| | Quantity (k=34) | Quality (k=9) |
| --- | --- | --- |
| r | **.572** | **.558** |
| **d** | **1.395** | **1.344** |

The loss **grows with group size** (correlation between effect size and group size: r = .606 for
quantity, r = .715 for quality). Authors' verdict: *"the long-lived popularity of brainstorming
techniques is unequivocally and substantively misguided."*

**The retro-critical moderator, from 1991 and largely forgotten:** for *quality*, **written responses
showed no loss at all** (r = −.042, d = −0.084, n.s., k = 3) versus tape-recorded vocalisation (r = .729,
d = 2.130, k = 5); contrast Z = 9.590, p < 1e-19. **Writing instead of speaking erased the quality
deficit before electronic brainstorming existed as a field.**

### Production blocking is the cause — not shyness, not free riding

**Diehl, M., & Stroebe, W. (1987)**, *Productivity Loss in Brainstorming Groups: Toward the Solution of a
Riddle*, *JPSP* 53(3):497–509,
[doi:10.1037/0022-3514.53.3.497](https://doi.org/10.1037/0022-3514.53.3.497)
([PDF](https://www.uni-muenster.de/imperia/md/content/psyifp/aeechterhoff/wintersemester2011-12/seminarthemenfelderdersozialpsychologie/08_diehl_stoebe_productivityloss-brainstorming_jpsp1987.pdf))
`[FULL, all four experiments]` — **Grade A**.

Experiment 4 isolates the mechanism. Mean non-redundant ideas per 4-person unit:

| Condition | Ideas | vs individual control |
| --- | --- | --- |
| Individual control (nominal) | **106.00** | — |
| No blocking, no communication | **102.67** | −3% |
| Real group control | 55.67 | −47.5% |
| **Blocking**, no communication | 45.67 | **−56.9%** |
| **Blocking** + hearing others | 37.67 | **−64.5%** |

F(4,10) = 10.99, p < .01. The planned contrast of blocking vs non-blocking conditions: F(1,10) = 42.22,
p < .01, and **"96% of the variance due to experimental conditions could be attributed to this
comparison."**

Three things this rules out:

- **It is not shyness.** Experiments 2–3: induced evaluation apprehension does reduce individual output,
  but the session × apprehension interaction "did not approach significance" — so apprehension cannot be
  what makes groups worse than individuals.
- **It is not free riding.** Experiment 1: personal vs collective assessment mattered (7.75% of variance)
  but type of session dominated (83.46%), with no interaction.
- **It is not "I heard someone else and forgot my idea."** Hearing the others made almost no difference
  (37.67 vs 45.67, n.s.).
- **It is not a time shortage.** Time-adequacy ratings did not differ (F < 1); talk filled only 73% of
  available time.

Imposing turn-taking on people **working alone in separate rooms** dropped them from 106.00 to 45.67 — a
larger drop than the entire real-group deficit. Removing blocking while keeping everything else restored
96.9% of solo performance.

> "type of session accounted for **70% to 80% of the total variance** in brainstorming productivity
> observed in our experiments, even when other variables assumed to mediate this difference were
> controlled."

**A retro where people take turns speaking is structurally the low-output condition.** That is the
finding, and it does not depend on anyone being nervous.

### Exposure narrows the space searched

Three converging results, all pointing at the same design consequence:

- **Smith, S. M., Ward, T. B., & Schumacher, J. S. (1993)**, *Constraining effects of examples in a
  creative generation task*, *Memory & Cognition* 21(6):837–845,
  [doi:10.3758/BF03202751](https://doi.org/10.3758/BF03202751) `[FULL]` — **Grade B**. Seeing three
  examples for 90 seconds raised conformity to their features (creatures .11 → .24, F(1,92) = 12.50;
  toys .22 → .35, F(1,92) = 8.13) without changing idea *count*. A 23-minute filled delay did not
  reduce it. **Experiment 3 is the decisive one:** control .16 · standard examples .25 · **"generate
  ideas as different as possible from the examples" .33** · conform-instructed .44.

  > "**telling subjects to generate ideas that were very different from the examples did not eliminate
  > the conformity effect**"

  The instruction-to-diverge group conformed *numerically more* than the standard group. **Once people
  have seen a few cards, telling them to think differently does not work.**

- **Kohn, N. W., & Smith, S. M. (2011)**, *Collaborative fixation*, *Applied Cognitive Psychology*
  25(3):359–371, [doi:10.1002/acp.1699](https://doi.org/10.1002/acp.1699) `[ABS]`: "**Exchanging ideas in
  a group reduced the number of domains of ideas that were explored** … Although fixation was observed …
  it did not influence the number of ideas generated."

- **Zhou et al. (2019)**, *Frontiers in Psychology* 10:1459,
  [doi:10.3389/fpsyg.2019.01459](https://doi.org/10.3389/fpsyg.2019.01459) `[FULL]` — text-based dyads,
  so production blocking is absent by design. **Evaluation apprehension** cut ideas from M = 32.95 to
  **21.03** (F(1,76) = 55.876, p < .001, **η² = .424** — a very large effect). **Exposure** to others'
  ideas did *not* change idea count (n.s.) but narrowed the **categories** explored (14.13 → 12.58,
  F(1,76) = 6.419, p = .013).

- **Hofstetter, R., Dahl, D. W., Aryobsei, S., & Herrmann, A. (2020)**, *Constraining Ideas*, *Journal of
  Marketing Research* 58(1):95–114,
  [doi:10.1177/0022243720964429](https://doi.org/10.1177/0022243720964429) `[ABS]`: "**creative
  performance monotonically reduces with an increasing number of prior ideas**"; and the mitigations that
  worked were **"showing only a limited number of ideas as well as grouping prior ideas."**

**The combined lesson for a retro board: idea *count* is the wrong success metric.** Exposure leaves
count roughly intact while shrinking the range of things considered. A board that shows everyone's cards
as they arrive will look productive and be quietly narrower.

### Conformity, and why private response fixes it

**Asch, S. E. (1951)**, *Effects of group pressure upon the modification and distortion of judgments*
([PDF](https://gwern.net/doc/psychology/1955-asch.pdf)) `[FULL]` — **Grade B**:

| | Critical group (N = 50) | Control (N = 37) |
| --- | --- | --- |
| Zero errors | 13 (26%) | 35 (95%) |
| Mean errors / 12 | **3.84 (32%)** | **0.08 (0.7%)** |

The control group **"recorded their estimates in writing"** with no group pressure — a **~46×** reduction
in errors. This within-paradigm comparison is the cleanest evidence that **private, written response at
the moment of judgment** neutralises conformity.

And a single dissenter nearly eliminates it: one confederate answering correctly throughout dropped
pro-majority errors from **32% to 5.5%**. Asch: "a unanimous majority of three is, under the given
conditions, far more effective than a majority of eight containing one dissenter."

**Bond, R., & Smith, P. B. (1996)**, *Psychological Bulletin* 119(1):111–137,
[doi:10.1037/0033-2909.119.1.111](https://doi.org/10.1037/0033-2909.119.1.111) `[FULL]` — **Grade A**:
133 effect sizes, 17 countries, **weighted mean d = 0.92 [.89, .96]**.

⚠️ **Do not cite Bond & Smith as evidence that anonymity reduces conformity.** Their "response known to
majority" moderator was **non-significant** — but only 14 of 133 studies had hidden responses, so the
test was badly underpowered. The anonymity-adjacent result to cite is **Bond, R. (2005)**, *Group
Processes & Intergroup Relations* 8(4):331–354,
[doi:10.1177/1368430205056464](https://doi.org/10.1177/1368430205056464) `[ABS]`, a meta-analysis of 125
Asch-type studies: "**normative influence is likely to be stronger when participants make public
responses** … whereas informational influence is likely to be stronger when participants make private
responses."

Modern replication: **Franzen, A., & Mader, S. (2023)**, *PLOS ONE* 18(11):e0294325,
[doi:10.1371/journal.pone.0294325](https://doi.org/10.1371/journal.pone.0294325) `[ABS]` — N = 210, 33%
error rate, "a perfect replication of Asch's original 36.8% result."

### Anchoring is one of the most robust effects in psychology

- **Tversky & Kahneman (1974)**, *Science* 185(4157):1124–1131,
  [doi:10.1126/science.185.4157.1124](https://doi.org/10.1126/science.185.4157.1124) `[FULL]`: median
  estimates were **25 and 45** for groups given **10 and 65** as starting points — from a wheel of
  fortune spun in front of them. "**Payoffs for accuracy did not reduce the anchoring effect.**"
- **Wilson, Houston, Etling & Brekke (1996)**, *JEP: General* 125(4):387–402,
  [doi:10.1037/0096-3445.125.4.387](https://doi.org/10.1037/0096-3445.125.4.387) `[FULL]`: incentives
  didn't help (anchor × incentive F(1,52) < 1); **warnings didn't help** (Study 5, N = 408, nine
  forewarning conditions — "**our forewarning manipulations, regardless of their form or placement, were
  unsuccessful**"; every anchoring condition differed from control at p < .05, none differed from each
  other).
- **Englich, Mussweiler & Strack (2006)**, *PSPB* 32(2):188–200,
  [doi:10.1177/0146167205282152](https://doi.org/10.1177/0146167205282152) `[FULL]`: 52 junior lawyers
  who **threw dice themselves** and were told they were random gave sentences of 5.28 vs 7.81 months on
  identical case files (t(50) = 2.71, p < .01) — **~48% longer**. With experienced judges (mean 129.9
  months' courtroom experience), the effect held. Expertise: "a significant main effect of anchor,
  F(1,77) = 10.90, p < .001, but **no main effect of expertise and no interaction, all Fs < 1**."
  Experts were much more confident, and confidence "was unrelated to their susceptibility."
- **Klein et al. (2014) Many Labs**, *Social Psychology* 45(3):142–152,
  [doi:10.1027/1864-9335/a000178](https://doi.org/10.1027/1864-9335/a000178) `[FULL]`: four anchoring
  items across **36 samples, 6,344 participants** — weighted d = **1.17 to 2.42**, significant in the
  same direction in **100% of samples**. Anchoring replicated *larger* than the original.

### Groups over-discuss what everyone already knows

- **Stasser, G., & Titus, W. (1985)**, *JPSP* 48(6):1467–1478,
  [doi:10.1037/0022-3514.48.6.1467](https://doi.org/10.1037/0022-3514.48.6.1467) `[FULL]`: "In the shared
  condition, **83% of the 18 groups chose Candidate A** whereas **only 18% of the 38 groups in the
  unshared conditions chose A**", χ²(1, N = 56) = 21.59, p < .001. "discussion tended to **perpetuate,
  not to correct**, members' distorted pictures."
- **Lu, L., Yuan, Y. C., & McLeod, P. L. (2012)**, *PSPR* 16(1):54–75,
  [doi:10.1177/1088868311417243](https://doi.org/10.1177/1088868311417243) `[FULL]` — **Grade A**;
  **65 studies, 101 effects, 3,189 groups**:

| Effect | Value | k |
| --- | --- | --- |
| Discussion bias (common vs unique info mentioned) | **d = 2.03** [1.71, 2.35] | 33 |
| Decision quality, manifest vs hidden profile | **OR = 8.05** | 24 |
| **Information coverage** × decision quality | **r = 0.56** | 13 |
| Discussion *focus* (airtime on unique info) × quality | r = 0.25 | 9 |
| CMC vs face-to-face, unique-info pooling | d = 0.77, **n.s.** | 7 |

"**without exception**, the mentions of common information exceeded the mentions of unique information."
The bias **grows with group size** (b = 0.32, p < .01).

**Two direct design reads.** (i) **Coverage beats focus** — ensuring every unique observation gets
mentioned *at least once* predicts decision quality far better than devoting airtime to it (r = .56 vs
.25). A tool that guarantees every card is seen is doing the highest-value thing available. (ii) **Moving
the discussion onto a screen changes nothing by itself** — both CMC comparisons were null. Structure, not
medium, is what moves this.

### First-speaker effects: honest reading of a null

**Stelmakh, Rastogi, Shah, Singh & Daumé (2023)**, *A large scale randomized controlled trial on herding
in peer-review discussions*, *PLOS ONE* 18(7):e0287443,
[doi:10.1371/journal.pone.0287443](https://doi.org/10.1371/journal.pone.0287443) `[FULL]` — **Grade A**.
**1,544 papers, 2,797 reviewers, ICML 2020.** Borderline papers were randomised so either the most
positive or most negative reviewer spoke first.

> "Our experiment reveals **no evidence of herding** in peer-review discussions."

Final scores across all reviewers: 3.47 vs 3.48.

⚠️ **This is not evidence that speaking order is harmless.** The discussion was written, asynchronous,
and **every reviewer had already committed to an independent score before it started.** Read it as
strong evidence that **pre-commitment inoculates against first-speaker herding** — which is precisely
the async-collection design. It is one of the best arguments for that decision, not against it.

### The illusion: groups feel more productive than they are

- Stroebe, Diehl & Abakoumkin (1992), *PSPB* 18(5):643–650,
  [doi:10.1177/0146167292185015](https://doi.org/10.1177/0146167292185015) `[ABS]` — people in groups
  can't distinguish their own ideas from others', inflating perceived contribution.
- Paulus, Dzindolet, Poletes & Camacho (1993), *PSPB* 19(1):78–89,
  [doi:10.1177/0146167293191009](https://doi.org/10.1177/0146167293191009) `[ABS]` — those who performed
  in groups rated their performance more favourably despite producing less.
- Nijstad, Stroebe & Lodewijkx (2006), *EJSP* 36(1):31–48,
  [doi:10.1002/ejsp.295](https://doi.org/10.1002/ejsp.295) `[ABS]` — the mechanism: group interaction
  reduces *cognitive failures* (moments of blankness), and failures mediate satisfaction. **The group
  feels better because you never sit in silence, not because it produces more.**

Together with §1.1's subjective-vs-objective gap, this is a consistent warning: **participant
satisfaction is a poor proxy for retro quality**, and any product metric built on "did the team enjoy
it" will point the wrong way.

### Where writing helps most: the modern remote result

**Baruah, J., Jimenez, E., & Paulus, P. B. (2025)**, *Comparing Virtual Brainwriting and Video-Based
Brainstorming in Groups With Perceived Functional Diversity or Similarity*, *Journal of Creative
Behavior* 59(4), [doi:10.1002/jocb.70058](https://doi.org/10.1002/jocb.70058) `[ABS]` — **Grade B**;
N = 157 working adults/students, 57 groups. **The most directly relevant modern result for a remote retro
tool:**

> "Groups in the **virtual brainwriting** condition generated **significantly more ideas, more original
> ideas, a higher proportion of good-quality ideas, and greater elaboration** than video-based groups.
> During the **idea-selection** task, brainwriting groups chose ideas of **higher originality**, whereas
> video-based groups favored more **feasible** ideas."

Also relevant: **Paulus, Korde, Dickson, Carmeli & Cohen-Meitar (2015)**, *Human Factors* 57(6):1076–1094,
[doi:10.1177/0018720815570374](https://doi.org/10.1177/0018720815570374) `[ABS]` — a **field study in a
high-technology company**: "participants who generated ideas **first as a group and then as individuals
performed best**… In the second study, **participants with periodic reviews performed best.**"

⚠️ **The ordering question is unsettled.** Baruah & Paulus (2008), *Small Group Research* 39(5):523–541,
[doi:10.1177/1046496408320049](https://doi.org/10.1177/1046496408320049) `[ABS]` found the opposite:
"participants in the **alone-to-group** sequence generated a larger number of ideas than those in the
group-to-alone sequence." Do not claim the evidence settles which comes first; it settles that
*separating them* helps.

### Two folk rules the evidence contradicts

**"Don't criticise during idea generation."** Nemeth, C. J., Personnaz, B., Personnaz, M., & Goncalo,
J. A. (2004), *EJSP* 34(4):365–374, [doi:10.1002/ejsp.210](https://doi.org/10.1002/ejsp.210) `[ABS]`:
traditional brainstorming instructions were compared with instructions encouraging people to **debate,
even criticise** — "**in general, debate instructions were superior to traditional brainstorming
instructions**", holding across the US and France. Related: Nemeth, Brown & Rogers (2001), *EJSP*
31(6):707–720, [doi:10.1002/ejsp.58](https://doi.org/10.1002/ejsp.58) `[ABS]` — *authentic* minority
dissent beat all three devil's-advocate role-play variants.

**"Generating more ideas is the point."** Rietzschel, Nijstad & Stroebe (2006), *JESP* 42(2):244–251,
[doi:10.1016/j.jesp.2005.04.005](https://doi.org/10.1016/j.jesp.2005.04.005) `[2°]`: nominal groups
generated more and more original ideas — **but there were no differences in the quality of the ideas
actually selected, and selection was not better than chance in any condition.** The generation advantage
does not survive the funnel. Paulus et al. (2018) `[FULL]` corroborate: groups "tend not to pick ideas
that are above average in novelty", and — importantly for phase design — "**Evaluation is better
accomplished in a face-to-face setting.**"

### Nominal Group Technique: the formal method, and what comparisons exist

Delbecq, A. L., & Van de Ven, A. H. (1971), *Journal of Applied Behavioral Science* 7(4):466–492,
[doi:10.1177/002188637100700404](https://doi.org/10.1177/002188637100700404) `[ABS]`. ⚠️ The abstract
describes a five-phase *program-planning* model; the mapping of the four familiar NGT micro-steps to this
specific paper is **UNVERIFIED at source**. The four steps — **silent generation, round robin,
clarification, voting** — are verified from McMillan, King & Tully (2016), *International Journal of
Clinical Pharmacy* 38(3):655–662,
[doi:10.1007/s11096-016-0257-x](https://doi.org/10.1007/s11096-016-0257-x) `[ABS]`.

The comparative evidence, from Murphy et al. (1998), *Health Technology Assessment* 2(3)
([PDF](https://njl-admin.nihr.ac.uk/document/download/2003171)) `[FULL]`:

> "Of the **ten** studies that have compared the NGT with informal groups with regard to decision
> quality, **five found the NGT better** … **four found no difference** … and **one found the NGT worse**
> than interacting groups."

And the moderator that matters most:

> "**in general in studies which used facilitators and which stayed closest to the original format, the
> NGT tended to perform better.**"

**Critically, all three of the *idea-generation* comparisons in their Table 20 favour NGT** (Jarboe 1988;
Van de Ven & Delbecq 1974; White et al. 1980). NGT's advantage is clearest on the task a retro's
collection phase actually is, and it depends on **keeping the structure and having a facilitator** — the
two things a guided tool provides by construction.

### Electronic brainstorming and group size

| Claim | Threshold | Source |
| --- | --- | --- |
| EBS > verbal | **≥ 4** | Dennis & Williams (2005) `[ABS]` |
| EBS > nominal | **≥ 10** | Dennis & Williams (2005) `[ABS]` |
| EBS > nominal | ≥ 8 | DeRosa et al. (2007), as reported by Paulus et al. (2018) `[2°]` |
| EBS = nominal at 6; EBS > nominal at 12 | 6 vs 12 | Dennis & Valacich (1993) `[ABS]` |
| No threshold — nominal wins overall | — | Pinsonneault et al. (1999) `[ABS]` |

- Dennis, A. R., & Williams, M. L. (2005), *International Journal of e-Collaboration* 1(1):24–42,
  [doi:10.4018/jec.2005010102](https://doi.org/10.4018/jec.2005010102) — ⚠️ IGI Global, a lower-tier
  venue; flag when citing.
- Dennis, A. R., & Valacich, J. S. (1993), *JAP* 78(4):531–537,
  [doi:10.1037/0021-9010.78.4.531](https://doi.org/10.1037/0021-9010.78.4.531) `[ABS]`: "**12-member
  electronically interacting groups generated more ideas than did 12-member nominal groups, and there
  were no differences between 6-member electronic and 6-member nominal groups.**"
- **The dissent, from a top IS journal:** Pinsonneault, Barki, Gallupe & Hoppen (1999), *Electronic
  Brainstorming: The Illusion of Productivity*, *Information Systems Research* 10(2):110–133,
  [doi:10.1287/isre.10.2.110](https://doi.org/10.1287/isre.10.2.110) `[ABS]`: "**groups using nominal
  brainstorming significantly outperformed groups using the other three brainstorming approaches**… even
  under conditions thought to be favorable to EBS, nominal brainstorming groups were at least as
  productive."
- ⚠️ **DeRosa, Smith & Hantula (2007)**, *Computers in Human Behavior* 23(3):1549–1581,
  [doi:10.1016/j.chb.2005.07.003](https://doi.org/10.1016/j.chb.2005.07.003) — **all its effect sizes are
  UNVERIFIED**; every access route was blocked. Do not quote numbers from it.

**Three independent estimates converge on a threshold of 8–12 before an electronic group beats
independent generation. Agile teams are 4–9.** At retro size, the literature supports at most
"electronic beats verbal"; **independent generation remains the benchmark to beat.**

---

## 1.5 Anonymity — the critical question

A downstream decision ticket depends on this, so it gets a careful answer rather than a slogan.

### What replicates

**Anonymity reliably increases the volume and the criticality of what people contribute.**

- **Connolly, T., Jessup, L. M., & Valacich, J. S. (1990)**, *Effects of Anonymity and Evaluative Tone on
  Idea Generation in Computer-Mediated Groups*, *Management Science* 36(6):689–703,
  [doi:10.1287/mnsc.36.6.689](https://doi.org/10.1287/mnsc.36.6.689) — **24 four-person student groups,
  6 per cell**, task was the campus "parking problem".
- **Jessup, L. M., Connolly, T., & Galegher, J. (1990)**, *The Effects of Anonymity on GDSS Group Process
  With an Idea-Generating Task*, *MIS Quarterly*,
  [doi:10.2307/248893](https://doi.org/10.2307/248893): critical comments **F = 8.33, p < .01**;
  questions about solutions **F = 7.79, p < .02**; total comments **F = 13.85, p < .01**. ⚠️ **Process
  variables only** — this paper does not show anonymity improving solution quality, and is often
  miscited as if it did.
- Postmes & Lea (2000) found anonymity moved **contributions and critical remarks** and nothing else
  among six dependent variables (decision quality, satisfaction, effectiveness, original solutions were
  all unmoved). Numeric effect sizes **UNVERIFIED** (paywalled).

### What does not replicate

**Anonymity does not reliably improve idea quality, ideational performance, or decision quality.**

- Connolly et al. (1990): quality-per-item and rarity **not different across conditions**.
- **Valacich, Dennis & Nunamaker (1992)**, *Small Group Research* 23(1):49–73,
  [doi:10.1177/1046496492231004](https://doi.org/10.1177/1046496492231004): "**Anonymity had no effect on
  ideational performance.**"
- **Nunamaker, Dennis, Valacich, Vogel & George (1991)**, *Electronic Meeting Systems to Support Group
  Work*, *Communications of the ACM* 34(7):40–61 `[FULL]` — the field's own accounting:

  > "**only one of five experiments found anonymous groups to have increased performance** compared to
  > non-anonymous groups; there were no performance differences in the other studies."

### The correction that matters most

**The status-levelling everyone attributes to anonymity is real — and it is not caused by anonymity.**

**Rains, S. A. (2005)**, *Leveling the Organizational Playing Field—Virtually*, *Communication Research*
32(2):193–234, [doi:10.1177/0093650204273763](https://doi.org/10.1177/0093650204273763) `[FULL]` —
**Grade A**, meta-analysis of 48 experiments. Main effects of electronic meeting systems versus
face-to-face are large: **participation equality d = 0.80**, **unique idea production d = 1.12**,
**dominance d = −0.52**, influence equality d = 0.23.

Then he tests anonymity as a moderator:

> "**Anonymity is not a significant moderator for any of the four influence variables.**"

| Variable | identified | anonymous | test |
| --- | --- | --- | --- |
| Influence equality | d = .23 (k=4) | d = .31 (k=7) | Q_B(1) = .20, p = .65 |
| Unique ideas | d = 1.73 (k=1) | d = 1.20 (k=7) | Q_B(1) = .56, p = .45 |
| Normative influence | d = −.17 (k=1) | d = .09 (k=3) | Q_B(1) = .84, p = .36 |
| Decision shifts | d = .28 (k=5) | d = .18 (k=7) | Q_B(1) = .22, p = .64 |

⚠️ Rains's own caveats: his coding collapses physical and discursive anonymity ("Inconsistencies in
reporting made it impossible to make further distinctions"), and the k=1 cells make some of these tests
nearly uninformative rather than true nulls.

**Read alongside §1.4, this is the key insight:** the benefits routinely credited to anonymity —
everyone contributes, the loud person doesn't dominate, more unique ideas surface — are delivered by
**the written, parallel, independent medium**, not by hiding names. A retro board that lets everyone
write at once already captures them.

### The costs

- **Satisfaction.** Connolly et al. (1990): "a simple main effect, with **anonymous groups less satisfied
  than identified groups**." Nothing in this corpus shows anonymity raising satisfaction.
- **Free riding.** Nunamaker et al. (1991) concede anonymity "may also **increase free riding**, as it is
  more difficult to determine when someone is free riding."
- **Anonymity is leaky.** Hayne & Rice (1997), *International Journal of Human-Computer Studies*
  47:429–452: participants attempted source attribution for **9%–70%** of anonymous contributions;
  Hayne et al. (2003): **9%–100%** — and they were "**rarely accurate**" `[2°]`. On a 5–9 person team
  where everyone recognises each other's writing voice, anonymity is thinner still — and *inaccurate*
  attribution is arguably worse than none.
- **Medium-level costs.** Baltes, Dickson, Sherman, Bauer & LaGanke (2002), *OBHDP* 87(1):156–179,
  [doi:10.1006/obhd.2001.2961](https://doi.org/10.1006/obhd.2001.2961) `[ABS]`: computer-mediated
  communication "leads to **decreases in group effectiveness, increases in time required to complete
  tasks, and decreases in member satisfaction** compared to face-to-face groups", with anonymity among
  four significant moderators. ⚠️ **Effect sizes UNVERIFIED** — the only numbers found were in an
  AI-generated summary box and were correctly refused.

### The gap

**No study in this literature measures whether anonymity affects whether anything gets fixed
afterwards.** Every dependent variable is idea count, comment tone, decision quality, or satisfaction
within a single session. The "anonymity reduces accountability and therefore follow-through" hypothesis
is **plausible and untested**.

The nearest supporting mechanism is the social-loafing literature: **Karau, S. J., & Williams, K. D.
(1993)**, *JPSP* 65(4):681–706,
[doi:10.1037/0022-3514.65.4.681](https://doi.org/10.1037/0022-3514.65.4.681) `[ABS]` — meta-analysis of
**78 studies**: "**Evaluation potential**, expectations of co-worker performance, **task meaningfulness**,
and culture had especially strong influence" on loafing. Evaluation potential — whether an individual's
contribution is identifiable — is one of the strongest moderators found. That is an inference to the
retro case, not a test of it.

### Counter-consideration, stated fairly

Nunamaker et al. (1991) argue the laboratory nulls may **understate** anonymity's value, because student
groups have low evaluation apprehension — the very variable that is high in a real team with a manager
in the room. Their field claim rests on self-report plus an explicit inference: "**Participants in field
studies have usually reported** that anonymity was important, particularly in cases where there were
power and status differences… **We infer** that student groups in the laboratory have lower evaluation
apprehension." That is a genuine gap in the evidence, not a licence to assume the benefit.

Note also their useful distinction: **process anonymity** (you cannot see who is or is not contributing)
versus **content anonymity** (you cannot attribute a specific comment). They are separable features.

### Verdict

**Citing this literature as evidence that anonymous retros work is not supported. Citing it as evidence
that anonymity surfaces more critical input at some cost to how the meeting feels is.**

Practical consequence, and the thing the downstream ticket needs: **the candour benefit and the
accountability cost land on different phases.** Independent, private-until-submitted generation
(§1.4 — Asch's written control, the peer-review RCT's pre-commitment) delivers most of the candour
benefit *without* permanent anonymity. Named ownership matters at the point of commitment (§1.6).
Treating "anonymity" as one global switch conflates two decisions that should be made separately.

⚠️ **External validity, stated plainly.** This entire corpus is single-session, ad-hoc undergraduate
groups brainstorming the campus parking problem, with no stake in the outcome, no shared future, and no
measurement of whether anything changed afterwards. It is the best evidence available and it is not very
good evidence about software teams.

---

## 1.6 Action-item follow-through

### Implementation intentions: real, but far smaller than the famous number

⚠️ **The widely quoted d ≈ .65 from Gollwitzer & Sheeran (2006) has been superseded by the same authors.**

**Sheeran, P., Listrom, O., & Gollwitzer, P. M. (2025)**, *The when and how of planning: Meta-analysis of
the scope and components of implementation intentions in 642 tests*, *European Review of Social
Psychology* 36(1):162–194,
[doi:10.1080/10463283.2024.2334563](https://doi.org/10.1080/10463283.2024.2334563)
([open access](https://kops.uni-konstanz.de/server/api/core/bitstreams/d703c468-46e9-47fc-8900-d32d7d19c8d9/content))
`[FULL]` — **Grade A**:

| | Value |
| --- | --- |
| Raw pooled effect, 642 tests | **d = .36** [.33, .40] |
| Egger's regression | b = 1.06 [0.97, 1.19], t = 8.44, p < .001 — **"substantial" publication bias** |
| **Robust Bayesian Meta-Analysis** | **d = .15 [.08, .22]**; BF_pb > 161.5 — **extreme evidence for publication bias** |

The authors: "implementation intentions appear to have a robust impact on outcomes though **the effect
size is small** according to conventional guidelines… and highly heterogenous", and "**Until then,
caution is warranted in interpreting findings from the present review.**"

⚠️ **A search summary encountered during this research asserted that this literature was "robust to
publication-bias correction, and surviving the post-2015 replication crisis." That is false** — the
primary source says the opposite. The claim circulates widely.

**Moderators that matter for a retro** (all `[FULL]`, Tables 2–3):

- **Field d = .27** vs lab d = .49. Retros are field.
- **Workplace samples d = .26** [.14, .38], k = 23 — **the lowest of any sample type**.
- Follow-up at **1–6 months: d = .19**.
- **Contingent "if X then Y" d = .43** vs schedule/"when-where-what" **d = .29**, Q(1) = 20.81, p < .001.
  The *if-then* form specifically matters.
- **High vs low motivation: d = .79** [.45, 1.14] — commitment is the biggest lever found.
- Rehearsing the plan once: d = .50 vs .33 for none; rehearsing more adds nothing.
- ⚠️ **Recording the plan HURT it: d = .31 vs .44**, Q(1) = 15.87, p < .001. The authors: "when
  participants had the opportunity to revisit their plans (e.g., because they retained copies), those
  plans were less effective… consistent with evidence that deliberation undermines the automaticity in,
  and hence the effectiveness of, planning." *This is counterintuitive for any tool that writes action
  items down. Read it as a caution against over-elaboration and endless re-litigation, not as a case
  against tracking — the studies manipulated plan-recording in experiments, not backlog hygiene.*
- Over-specifying "how" and "for how long" almost halved the effect versus specifying just time and
  place.

### Goal setting

**Locke, E. A., & Latham, G. P. (2002)**, *American Psychologist* 57(9):705–717,
[doi:10.1037/0003-066X.57.9.705](https://doi.org/10.1037/0003-066X.57.9.705)
([PDF](https://med.stanford.edu/content/dam/sm/s-spire/documents/PD.locke-and-latham-retrospective_Paper.pdf))
`[FULL]` — **Grade A**:

- Goal **difficulty** effect sizes **d = .52 to .82**.
- **Specific-and-difficult vs "do your best": d = .42 to .80.** "when people are asked to do their best,
  they do not do so. This is because do-your-best goals have no external referent and thus are defined
  idiosyncratically."
- ⚠️ **Task complexity limits it** (Wood, Mento & Locke 1987): specific-difficult vs do-best **d = .41 on
  the most complex tasks** vs .77 on the least. **Software process improvement is complex — expect the
  low end.**
- **Feedback is a necessary moderator:** "For goals to be effective, people need summary feedback that
  reveals progress in relation to their goals… goals plus feedback is more effective than goals alone."
  **A retro action with no progress signal is the weak case.**
- **Public commitment:** "Making a public commitment to the goal enhances commitment, presumably because
  it makes one's actions a matter of integrity in one's own eyes and in those of others."
- **Assigned vs participatively set goals do not differ** when difficulty is held constant — *provided
  the rationale is given*. "if the goal is assigned tersely (e.g., 'Do this…') without explanation, it
  leads to performance that is significantly lower than for a participatively set goal."

**The counterweight:** Ordóñez, Schweitzer, Galinsky & Bazerman (2009), *Goals Gone Wild*, *Academy of
Management Perspectives* 23(1):6–16,
[doi:10.5465/amp.2009.37007999](https://doi.org/10.5465/amp.2009.37007999)
([HBS working paper](https://www.hbs.edu/ris/Publication%20Files/09-083.pdf)) `[FULL]` — documented side
effects include **narrow focus** (Staw & Boettger 1990: proofreaders told to "do your best" corrected
both grammar *and* content errors; those given a specific goal fixed only their assigned dimension),
goals acting as ceilings rather than floors, and reduced intrinsic motivation. Locke & Latham published a
rebuttal in the same journal (not read).

### Named ownership

- **Karau & Williams (1993)** (§1.5): **evaluation potential** — identifiability — is among the strongest
  moderators of social loafing across 78 studies. This is the best available case for naming a single
  owner.
- **Fischer et al. (2011)**, *Psychological Bulletin* 137(4):517–537,
  [doi:10.1037/a0023304](https://doi.org/10.1037/a0023304) `[ABS]` — bystander effect meta-analysis,
  **k = 105, N > 7,700, g = −0.35**. Diffusion of responsibility holds at modest-to-moderate size, but
  the moderators concern physical emergencies and do not transfer cleanly to a Jira ticket.

⚠️ **No study directly compares "assign to one named person" versus "assign to the team" for meeting or
retro action-item completion.** The named-owner practice is an inference from identifiability effects,
not a tested intervention. Say so in the spec.

### Accountability belongs to execution, not generation

**Häusser, Frisch, Wanzel & Schulz-Hardt (2017)**, *Effects of process and outcome accountability on idea
generation*, *Experimental Psychology* 64(4):262–272,
[doi:10.1027/1618-3169/a000368](https://doi.org/10.1027/1618-3169/a000368) `[ABS]` — 2×2, **N = 147**:

> "(a) **outcome accountability had a negative effect on quantity of ideas**… **any type of accountability
> (c) had a negative effect on uniqueness of ideas**, (d) did not affect the quality of the idea that was
> selected, and (e) **increased stress**. Moreover, the negative effect of accountability on uniqueness
> of ideas was mediated by stress."

**Directly relevant design tension:** accountability pressure applied to the *idea-generation* phase of a
retro suppresses idea quantity and uniqueness and raises stress. The case for accountability is about
*executing* commitments, not generating them. A tool should keep them in different phases.

Lerner, J. S., & Tetlock, P. E. (1999), *Psychological Bulletin* 125(2):255–275,
[doi:10.1037/0033-2909.125.2.255](https://doi.org/10.1037/0033-2909.125.2.255) `[ABS]` frames the
question ("Under what conditions will accountability attenuate, have no effect on, or amplify cognitive
biases?"). ⚠️ **The widely repeated specifics — that accountability helps when the audience's views are
unknown and the person is accountable *before* committing, and produces defensive bolstering *after* —
are UNVERIFIED here.** Do not print them as established.

---

## 1.7 Meetings, complaining, and fatigue

### The strongest finding in this whole review for retro design

**Kauffeld, S., & Lehmann-Willenbrock, N. (2012)**, *Meetings Matter: Effects of Team Meetings on Team
and Organizational Success*, *Small Group Research* 43(2):130–158,
[doi:10.1177/1046496411429599](https://doi.org/10.1177/1046496411429599) `[ABS]` — **Grade B**:

> "**Ninety-two regular team meetings were videotaped**… Teams that showed more functional interaction,
> such as problem-solving interaction and action planning, were significantly more satisfied with their
> meetings. Better meetings were associated with higher team productivity. Moreover, constructive meeting
> interaction processes were related to organizational success **2.5 years after** the meeting.
> **Dysfunctional communication, such as criticizing others or complaining, showed significant negative
> relationships with these outcomes. These negative effects were even more pronounced than the positive
> effects of functional team meeting interaction.**"

⚠️ Write "92 videotaped meetings", not "92 teams" — the team count is UNVERIFIED. The 2.5-year link is a
lagged correlation, not an experiment.

**The mechanism, and the actionable part:**

- **Kauffeld, S., & Meyers, R. A. (2009)**, *Complaint and solution-oriented circles*, *European Journal
  of Work and Organizational Psychology* 18(3):267–294,
  [doi:10.1080/13594320701693209](https://doi.org/10.1080/13594320701693209) `[ABS]` — 33 work-group
  discussions, lag-sequential analysis: "**complaining begets further complaining statements, while
  simultaneously inhibiting the expression of solution-oriented statements**"… "**To inhibit complaining,
  the results point to the importance of structuring statements.**"
- **Lehmann-Willenbrock, Meyers, Kauffeld, Neininger & Henschel (2011)**, *Small Group Research*
  42(6):639–668, [doi:10.1177/1046496411398397](https://doi.org/10.1177/1046496411398397) `[ABS]` — 52
  discussions: "**complaining cycles were linked to a passive group mood**, and interest-in-change cycles
  were correlated with an active group mood. Neither… were correlated with the pleasure dimension." The
  harm is **deactivation and apathy**, not unhappiness — a more precise claim than "complaining makes
  people sad".

**This is the strongest, most directly applicable evidence in the review for a guided phase flow.**
Procedural structuring utterances are what break the complaining cycle. A guided retro *is* a machine for
emitting procedural structuring utterances. It is also a caution: the classic "what went badly" opening
is an invitation into the cycle the literature says is most damaging.

### Meeting load: it is the count, not the length

**Rogelberg, S. G., Leach, D. J., Warr, P. B., & Burnfield, J. L. (2006)**, *"Not another meeting!" Are
meeting time demands related to employee well-being?*, *JAP* 91(1):83–96,
[doi:10.1037/0021-9010.91.1.83](https://doi.org/10.1037/0021-9010.91.1.83) `[FULL]` — **Grade B**
(Study 1 N = 676; Study 2 N = 304).

**Raw meeting load is essentially unrelated to well-being; *perceived effectiveness* is strongly
related.** Time in meetings × job satisfaction **r = .01 (n.s.)**; perceived meeting effectiveness × job
satisfaction **r = .45**, × depression–enthusiasm **r = .54**, × intent to quit **r = −.32**.
Effectiveness accounted for ~27% of variance in job-related enthusiasm.

And, tested explicitly: "**No curvilinear relationships (quadratic or cubic) were found.**" There is no
optimum meeting length in this data, and no inflection point.

What *is* evidenced: "**The number of meetings attended, rather than the length of each meeting, will be
most associated with task disruption**, because of the repeated disturbance of activity regulation."
Corroborated by Luong, A., & Rogelberg, S. G. (2005), *Group Dynamics* 9(1):58–67,
[doi:10.1037/1089-2699.9.1.58](https://doi.org/10.1037/1089-2699.9.1.58) `[ABS]`: "a significant positive
relationship between **number of meetings attended** and daily fatigue as well as subjective workload."

**Fewer, longer sessions are better supported than more, shorter ones.**

The one verified length experiment: Bluedorn, Turban & Love (1999), *JAP* 84(2):277–285,
[doi:10.1037/0021-9010.84.2.277](https://doi.org/10.1037/0021-9010.84.2.277) `[ABS]` — "**Sit-down
meetings were 34% longer than stand-up meetings, but they produced no better decisions.**" Lab, ad-hoc
groups, manipulates posture not a timebox. Shows shorter was not worse; identifies no optimum.

### Video fatigue — and it is causal

**Shockley, K. M., Gabriel, A. S., Robertson, D., Rosen, C. C., Chawla, N., Ganster, M. L., & Ezerins,
M. E. (2021)**, *The fatiguing effects of camera use in virtual meetings: A within-person field
experiment*, *JAP* 106(8):1137–1155,
[doi:10.1037/apl0000948](https://doi.org/10.1037/apl0000948) `[ABS]` — **Grade A**; the best-designed
study here. 4-week within-person experience-sampling **field experiment with camera use manipulated**,
**1,408 daily observations from 103 employees**. Causal chain: **camera-on → daily fatigue → reduced
voice and engagement**, affecting same-day and next-day meeting performance; **stronger for women and
newer team members.**

Supporting:

- Bennett, A. A., Campion, E. D., Keeler, K. R., & Keener, S. K. (2021), *JAP* 106(3):330–344,
  [doi:10.1037/apl0000906](https://doi.org/10.1037/apl0000906) `[ABS]` — 55 employees, 279
  videoconferences: "**turning off the microphone and having higher feelings of group belongingness are
  related to lower postvideoconference fatigue**… higher levels of group belongingness are the most
  consistent protective factor." ⚠️ Duration is *not* named as a driver.
- Fauville, G., Luo, M., Queiroz, A. C. M., Bailenson, J. N., & Hancock, J. (2021), *Computers in Human
  Behavior Reports* 4:100119,
  [doi:10.1016/j.chbr.2021.100119](https://doi.org/10.1016/j.chbr.2021.100119) `[ABS]` — the ZEF scale
  (item reduction N = 395, validation N = 2,724): "**frequency, duration, and burstiness of Zoom meetings
  were associated with a higher level of fatigue**." Correlational, self-report both sides.
- ⚠️ **Bailenson (2021)**, *Nonverbal overload*, *Technology, Mind, and Behavior* 2(1),
  [doi:10.1037/tmb0000030](https://doi.org/10.1037/tmb0000030) `[ABS]` — the source of the famous four
  causes of "Zoom fatigue" — **is explicitly not an empirical study**, in the author's own words: "The
  arguments are based on academic theory and research, but **also have yet to be directly tested in the
  context of Zoom, and require future experimentation to confirm.**"

**Why this matters for a retro tool.** §1.1 says virtual reflection underperforms. Shockley et al. supply
a causal mechanism — camera fatigue suppresses **voice**, which is exactly what a retro needs. A retro
that is a long camera-on video call is fighting a measured effect. A retro where the generation phase is
written and asynchronous is not.

---

# 2. Provenance: where the five-stage model actually comes from

The near-universal structure — **Set the Stage → Gather Data → Generate Insights → Decide What to Do →
Close** — has a clear and entirely practitioner lineage. Nothing about it is disreputable. It is simply
not a research finding, and it is routinely presented as though it were.

1. **Norman Kerth (2000)**, *The ritual of retrospectives: how to maximize group learning by understanding
   past projects*, *Software Testing & Quality Engineering* 2(5):53–57 — first published collection of
   retrospective activities.
2. **Norman Kerth (2001)**, *Project Retrospectives: A Handbook for Team Reviews*, Dorset House. Origin
   of the **Prime Directive**. Kerth's retrospective is a **multi-day post-project ritual**, not a
   60-minute sprint ceremony.
3. **Derby & Larsen (2006)**, *Agile Retrospectives: Making Good Teams Great*, Pragmatic Bookshelf
   ([publisher page](https://pragprog.com/titles/dlret/agile-retrospectives/)) — compresses Kerth's
   ritual into the sprint cadence and introduces the five-phase agenda. The publisher describes the
   content as "tools and recipes **proven in the real world**". There is no study, no comparison
   condition, and no claim of one.
4. **Second edition (2024)**, Derby, Larsen & **David Horowitz**
   ([publisher page](https://pragprog.com/titles/dlret2/agile-retrospectives-second-edition/)). Worth
   knowing when weighing tool-shaped advice in it: Horowitz is co-founder and CEO of **Retrium**, a
   commercial retrospective platform.

Derivative models inherit the same status. Marc Loeffler's *Improving Agile Retrospectives*
(Addison-Wesley) presents a six-phase model and states plainly that it is "based on the original phase
model in Esther Derby and Diana Larsen's book" — the excerpt gives **no rationale for the ordering and
cites no evidence for it**
([InformIT excerpt](https://www.informit.com/articles/article.aspx?p=2916288&seqNum=3)).

**The normative sources are far looser than practice suggests.** The Agile Manifesto's twelfth principle
says only: *"At regular intervals, the team reflects on how to become more effective, then tunes and
adjusts its behavior accordingly"* ([agilemanifesto.org](https://agilemanifesto.org/principles.html)).
The 2020 Scrum Guide prescribes no phases at all — a purpose, an inspection scope, and a **maximum**
timebox of "three hours for a one-month Sprint"
([scrumguides.org](https://scrumguides.org/scrum-guide.html)).

**Verdict.** The five-stage model is a well-designed practitioner heuristic with **no empirical
validation of its ordering, its completeness, or its superiority over unstructured discussion**. The
general proposition it embodies — guided reflection beats an unguided conversation — has support
(§1.1, §1.2 Tariq 2025, §1.4 NGT, §1.7 structuring statements, §3.1). The specific five-step
decomposition does not. Build on it because it is a sane default and because users recognise it, not
because research says it is correct.

---

# 3. What's contested

### 3.1 Structured versus unstructured facilitation

**Honey-Rosés, J., Canessa, M., Daitch, S., Gomes, B., Muñoz-Blanco García, J., Xavier, A., & Zapata, O.
(2020)**, *Comparing Structured and Unstructured Facilitation Approaches in Consultation Workshops: A
Field Experiment*, *Group Decision and Negotiation*,
[doi:10.1007/s10726-020-09688-w](https://doi.org/10.1007/s10726-020-09688-w) — **Grade B**.

Participants (n = 34, per the publisher abstract) were randomised into two parallel sessions performing
the same idea-generation and prioritisation tasks under structured versus unstructured facilitation.
Reported result: structured facilitation with small-group discussion produced a **"modest yet consistent
improvement"**, with the authors cautioning that "too much structure may limit group discussion,
creativity, or be ill received by participants."

⚠️ *Not open access; full text not retrieved. Authors, title, venue and DOI verified via Crossref; the n
and result wording come from the publisher abstract as surfaced in search. Treat the numbers as
provisional.*

Combined with Tariq et al. (2025) and the NGT comparisons (§1.4), the direction of evidence favours
structure — but the case is "several studies pointing the same way", not "settled", and the NGT record
itself is 5 better / 4 no-difference / 1 worse.

### 3.2 Does retro *quality* actually move anything?

Verwijs & Russo (2023) is the only quantitative link, and it is indirect (β = .137), cross-sectional, and
self-report on both sides. Skinner et al. (2015) found no outcome measurements at all. Dingsøyr et al.
(2018) tried to count action-item completion and could not. **Nobody has demonstrated that software
retrospectives improve software outcomes.** That is not a claim that they don't — it is a claim that the
question is open.

### 3.3 Anonymity

See §1.5. Contested in the specific sense that the *volume/criticality* benefit replicates, the
*quality* benefit does not, the *status-levelling* attribution is refuted, and the *follow-through* cost
is untested.

### 3.4 Which comes first, alone or together?

Paulus et al. (2015, field study in a tech company) found group-then-individual best. Baruah & Paulus
(2008) found alone-to-group better. Both are peer-reviewed; they disagree. What both support is that
**separating the two modes** helps. Do not claim the order is settled.

---

# 4. What's folklore

Everything here is widely taught as fact and has, as far as this review could establish, no supporting
study. Several are sensible defaults. That makes them **untested defaults**, which is a different thing.

### 4.1 The five-stage order

§2. Practitioner lineage; no validation of the ordering or the decomposition.

### 4.2 "A 60-minute retro every two weeks"

No evidence for this cadence or duration.

- The **Scrum Guide (2020)** sets only a *maximum* (three hours for a one-month sprint).
- The **Agile Manifesto** says "at regular intervals" and nothing more.
- **Kerth's** original was a **multi-day** event — an order of magnitude longer — with no evidence
  offered for either figure.
- **Lines et al. (2021)** tested **total reflection time** as a moderator across 24 RCTs: inconsequential.
- **Rogelberg et al. (2006)** tested explicitly for a dose–response curve and found none — "**No
  curvilinear relationships (quadratic or cubic) were found**" — while identifying **meeting count**, not
  length, as the disruptive variable.
- **Milani et al. (2025)** documents 84% biweekly and 63% at 60 minutes — evidence of *convention*, not
  of *optimum*.

Rogelberg et al. even flag their own recommendations as trade-derived: "**Trade literature (e.g.,
Streibel, 2003) argues** that perceptions of meeting effectiveness would appear to be promoted to the
extent that people come prepared… an agenda is used, meetings are punctual…"

### 4.3 "Limit yourself to 1–3 action items"

**This one is not merely unevidenced — the best available data contradict it.** Sheeran et al. (2025)
`[FULL]`, number of plans versus effect size:

| Plans | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8+ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| d | **.41** | .30 | **.07** | .22 | .10 | .26 | .42 | .41 |

Three plans is the *worst* cell in the table. The authors:

> "**We did not find evidence that there is an optimal number of plans that should be formed.** There were
> larger effects for forming a single plan and forming 7 or 8 plans compared to forming between 2 and 6
> plans… However, given that number of plans and the type of outcome could have been conflated in the
> present review, new experiments are needed."

And Gollwitzer & Sheeran's own earlier position, quoted in the 2025 paper: "the number of plans depends
upon how many self-regulatory problems people face during goal striving — **there is no necessary
relationship between number of plans and effectiveness.**"

The defensible evidence-based statements are (a) **a single plan performs as well as or better than 2–6**,
and (b) multiple simultaneous goals cause one to dominate and the less measurable to be dropped (Shah,
Friedman & Kruglanski 2002, [doi:10.1037/0022-3514.83.6.1261](https://doi.org/10.1037/0022-3514.83.6.1261);
Gilliland & Landis 1992 `[2°]` via Ordóñez et al.). Neither yields "three".

⚠️ Interpretive tension worth knowing: Shah et al. frame goal shielding as **beneficial** ("goal shielding
was shown to have beneficial consequences for goal pursuit and attainment"); Ordóñez et al. cite the same
work as evidence of a "too many goals" problem.

### 4.4 "X% of retro action items never get done"

**Unmeasured in the research literature.** Circulating figures ("40–50% never completed"; "a survey of
419 engineers found only half get done") surfaced during this research from **vendor blogs and Medium
posts**. Dingsøyr et al. (2018) — the one team-level study that actually counted action items — states
explicitly that it could not assess follow-through. Do not put a percentage in the spec.

### 4.5 "Rotate the format or the team disengages"

Thin and mixed.

- **Matthies & Dobrigkeit (2020)** observed "Too Repetitive" once in 19 retros and called repetitiveness
  "a latent headache in most teams, which requires constant vigilance". But their own data shows the
  cost: **3 of 18 activity introductions (16.7%) created a new headache**, and in half the cases where a
  novel activity was introduced purely for variety it "led to variety, albeit limiting the effectiveness
  of the resulting meeting."
- **Verwijs & Russo (2023)** observed qualitatively that "a more diverse range of formats and themes
  tended to generate more improvements in a broader range of areas" — an observation, not a test.
- **Przybyłek, Albecka, Springer & Kowalski (2021)**, *Game-based Sprint retrospectives*, *Empirical
  Software Engineering* 27(1),
  [doi:10.1007/s10664-021-10043-z](https://doi.org/10.1007/s10664-021-10043-z)
  ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC8527976/)) `[FULL]` states the fatigue claim — "if
  retrospective meetings are repeated in the same way over and over again, **they may get dull, which
  demotivates team members**… they stop attending them" — but ⚠️ **cites it to practitioner sources**
  (Derby & Larsen 2006, Kua 2013, Loeffler 2017, Rubin 2012). **The claim traces to a practitioner book,
  not to measurement.**

Novelty is not free. A format library is a reasonable feature; "rotating formats improves retros" is not
an evidenced claim.

### 4.6 "Don't criticise during idea generation"

Contradicted — see §1.4. Nemeth et al. (2004): debate instructions were superior to traditional
brainstorming instructions, across two countries.

### 4.7 The Prime Directive as a psychological-safety mechanism

Kerth's Prime Directive is universally taught as *the* way to establish safety in a retro. It predates
the popularisation of psychological safety as a construct and has never, as far as this review found,
been tested. Reciting a norm and holding a norm are different things. §1.3 covers what the
psychological-safety literature actually says produces candour, and it is mostly about **leader
behaviour** — and, per Milliken et al. (2003), mostly about **image risk**, not futility.

### 4.8 "Moderate time pressure is optimal for creativity"

The most-cited source, Amabile, Hadley & Kramer (2002) *Creativity Under the Gun*, is **Harvard Business
Review — not peer-reviewed**, and its specific claims are UNVERIFIED. The underlying diary study,
Amabile, Barsade, Mueller & Staw (2005), *ASQ* 50(3):367–403,
[doi:10.2189/asqu.2005.50.3.367](https://doi.org/10.2189/asqu.2005.50.3.367) `[ABS]`, is about **affect,
not time pressure**, and makes no time-pressure claim.

What the peer-reviewed evidence supports is narrower: Baer & Oldham (2006), *JAP* 91(4):963–970,
[doi:10.1037/0021-9010.91.4.963](https://doi.org/10.1037/0021-9010.91.4.963) `[ABS]` found the inverted-U
only "**for employees who scored high on openness to experience while simultaneously receiving support
for creativity**" — conditional, not a general law. And Byron, Khazanchi & Nazarian (2010), *JAP*
95(1):201–212, [doi:10.1037/a0017868](https://doi.org/10.1037/a0017868) `[ABS]`, a meta-analysis of **76
experimental studies**, locates the effect in **evaluation and uncontrollability**, not clock pressure:
"low evaluative contexts increased creative performance… highly evaluative contexts decreased creative
performance", and "a **linearly negative** relationship between uncontrollability and creativity."

Paulus, Baruah & Kenworthy (2018), *Frontiers in Psychology* 9:2024,
[doi:10.3389/fpsyg.2018.02024](https://doi.org/10.3389/fpsyg.2018.02024) `[FULL]` — the field's own
leading review — states the gap plainly: "we do **not know the ideal balance of alone/group time
allocation**… We have only experimented with short sessions."

One indirect argument against short timeboxes, from the same review: "**tapping the most obvious or
common ideas first; only later will the more rare and novel ideas surface.**" Cutting the session early
systematically removes the originality tail.

---

# 5. Implications for a guided retro tool

## 5.1 Checked against the decisions locked at charting

| Locked decision | Evidence says | Verdict |
| --- | --- | --- |
| **Guided phase flow, not a blank whiteboard** | Structured reflection has a meta-analytic effect (§1.1); scaffolded prompts significantly deepened reflection in a controlled comparison (§1.2); NGT's advantage over informal groups is clearest on idea generation and depends on keeping the structure (§1.4); **procedural structuring statements are what break the complaining cycle** (§1.7) | **Supported** — and the complaining-cycle evidence is a stronger argument than the ones usually offered. Support is for *structure and prompting*, not for the five-stage decomposition specifically (§2). |
| **Async card collection before sync discussion** | The single best-evidenced decision on the list. Production blocking accounts for ~96% of the variance in group idea loss (§1.4); writing removes the quality deficit entirely (Mullen 1991); exposure narrows the space searched and telling people to diverge does not fix it (Smith 1993); private written response cut Asch conformity ~46×; the ICML randomised trial found **no herding when reviewers pre-committed independently** | **Strongly supported.** |
| **Permanent retention** | Ambivalent. Reviewing previous action points was done by 4/4 teams (§1.2), and Locke & Latham require **feedback on progress** for goals to work. But Dingsøyr et al.: **"having minutes public could also lead to critique being toned down or removed completely."** And Sheeran et al.: revisitable recorded plans were *less* effective (d = .31 vs .44) | **Supported with two caveats** — see §5.3. |
| **No AI features** | Nothing in this literature depends on AI. The unmet need it identifies is **objective project data in the retro** (Lehtinen 2017 on opinion-vs-evidence; Milani 2025; the g = .881 vs .357 feedback hint in Lines et al.) — an integrations problem, not an AI one | **Not contradicted.** |
| **Fully free, no paywall in v1** | Out of scope | — |
| **Purpose-built board, not React Flow** | Out of scope | — |

**Nothing locked at charting is contradicted by the evidence.** One decision (permanent retention) needs
a visibility caveat attached.

## 5.2 The finding that should shape the roadmap

**Team reflexivity interventions are markedly less effective for virtual teams** (§1.1) — of 14 moderators
across 24 RCTs, virtuality was the only survivor: g = .678 co-located versus **g = .166 virtual**. And
§1.7 supplies a measured causal mechanism: camera-on video meetings cause fatigue, and **fatigue
suppresses voice** (Shockley et al., within-person field experiment, 1,408 observations) — worse for
women and newer team members, i.e. exactly the people a retro most needs to hear from.

A remote retro tool is therefore building on the *weak* version of the evidence. This reframes the
product problem usefully: the job is not "put a retro on a canvas", it is **"recover what distributed
teams lose."**

The good news is that the evidence points to a specific escape route. The virtuality penalty was measured
on teams communicating **by chat and email**, and separately, **written parallel generation
outperformed video-based discussion** on ideas, originality, quality and elaboration in the most modern
comparison available (Baruah, Jimenez & Paulus 2025). The medium that loses is *synchronous verbal
turn-taking over video*. The medium that wins is *written, parallel, independent*. AgileKit's locked
design already sits on the winning side.

Concrete consequences worth carrying into the spec:

- **Make participation visibly equal.** Co-located, a facilitator notices who has not spoken. Remote, it
  has to be shown. Rains's meta-analysis shows the medium delivers participation equality (d = 0.80) —
  make it legible rather than assuming it.
- **Guarantee coverage over airtime.** Lu et al.: information *coverage* predicts decision quality far
  better than discussion *focus* (r = .56 vs .25). A board that guarantees every card is seen at least
  once is doing the highest-value thing available.
- **Do not require cameras, and do not make the generation phase a video call.** Shockley et al. is a
  randomised within-person field experiment; this is one of the few genuinely causal findings here.
- **Keep the discussion phase for evaluation, not generation.** Paulus et al. (2018): "Evaluation is
  better accomplished in a face-to-face setting." Generation written, selection together.

## 5.3 Retention, visibility, and candour are three things

The one place evidence pushes back on a locked decision. "Permanent retention" and "permanently visible
to everyone" are not the same feature, and Dingsøyr et al. observed publishing retro minutes leading
teams to tone down or remove critique.

Design space this opens:

- Retain everything; scope **visibility** to the team that produced it, not the wider org.
- Distinguish **raw cards** (candid, team-scoped) from **agreed actions** (the thing worth surfacing
  outward).
- The moment retro history feeds analytics or an org-level view, candour is at risk — not at the moment
  of storage. The map already lists "retro analytics — participation, theme recurrence, action-item
  completion rate, sentiment trend" as a future direction. **That is the feature that could break the
  ceremony**, and it should be designed with the Dingsøyr effect explicitly in mind.

Second caveat: Sheeran et al. found that plans participants could revisit were *less* effective
(d = .31 vs .44), attributed to deliberation undermining automaticity. This argues against a UI that
invites endless re-litigation of an open action, and for one that shows **progress against it** — which
is what Locke & Latham require anyway.

## 5.4 Where the evidence gives real design guidance

Beyond the locked decisions, these are the places where the literature is specific enough to act on:

**On collection.**
- Do not reveal others' cards during generation. Exposure narrows the categories explored while leaving
  the *count* intact (Zhou 2019; Kohn & Smith 2011) — so the damage is invisible in any metric a tool
  would naturally track.
- If cards must be shown before everyone is done, **show few and group them**. Those are the two
  mitigations that worked in Hofstetter et al. (2020).
- Idea count is the wrong success metric. Prefer breadth of themes.

**On discussion.**
- The classic "what went badly" opening is an invitation into the complaining cycle, which Kauffeld &
  Lehmann-Willenbrock found does *more* damage than functional interaction does good. Structuring
  prompts are the evidenced counter-measure.
- Anchoring is essentially immune to warnings, incentives and expertise (§1.4). A "don't be influenced by
  what you see first" note will not work. Sequence is the only lever.
- Do not build "one person reads out their card, then the next" — that is production blocking rebuilt in
  software.

**On commitment.**
- **If-then phrasing** beats vague intent (d = .43 vs .29) — the field should invite a trigger, not just
  a task.
- **A named owner** is the best-supported accountability mechanism available (identifiability is among
  the strongest moderators of social loafing), though never directly tested for action items. Note that
  the practitioner literature disagrees: Przybyłek et al. record the norm as "all action items should be
  assigned to **volunteers**".
- **Specific and difficult beats "do your best"** — but only with progress feedback, and the effect
  shrinks on complex tasks (d = .41), which software process work is.
- **Keep accountability out of the generation phase.** Häusser et al.: accountability during idea
  generation reduced quantity and uniqueness and increased stress.
- **Do not enforce an action-item count limit.** §4.3 — three is the worst cell in the only relevant
  meta-analytic table.

**On measurement.**
- Participant satisfaction is a poor proxy for quality. Groups systematically feel more productive than
  they are (§1.4), and reflection effects are roughly twice as large on subjective as on objective
  measures (§1.1). A "how was this retro?" score will mislead.

## 5.5 What the evidence does *not* license

State this in the spec so it does not get relitigated:

- It does **not** license the five-stage flow as "the evidence-based structure". It licenses *a* guided
  structure.
- It does **not** license a specific retro duration or cadence (§4.2).
- It does **not** license "1–3 action items" (§4.3), format rotation as an engagement mechanism (§4.5),
  or "don't criticise" (§4.6).
- It does **not** license any claim that anonymity makes retros better (§1.5).
- It does **not** license any claim that using the tool will improve delivery. Nobody has measured that
  for software retros at all (§6).

---

# 6. Where the evidence is simply absent

1. **No study measures whether software retrospectives improve software outcomes.** Skinner et al.
   (2015): "no project retrospective measurements given to confirm whether these outcomes have been
   successfully achieved." Verwijs & Russo (2023) is the closest, and it is indirect, perceptual and
   cross-sectional.
2. **No study measures action-item completion rates** in software retrospectives, or tests interventions
   to raise them. Dingsøyr et al. tried and said they could not.
3. **No study compares retro formats against each other** on any outcome. Mad/Sad/Glad vs
   Start/Stop/Continue vs Sailboat vs 4Ls is entirely untested.
4. **No study tests the five-phase ordering** against alternative orderings, in software teams.
5. **No study tests anonymity's effect on follow-through**, in any domain. Every anonymity DV is
   within-session.
6. **No study compares named-owner vs team-assigned action items** for completion.
7. **No systematic literature review of agile retrospectives exists** (OpenAlex title search: none).
8. **No study examines group size with the writing method** (Paulus et al. 2018, verbatim) — so the
   nominal-vs-electronic size thresholds do not directly cover a brainwriting-shaped retro board.
9. **The strong meta-analytic evidence is from other domains** — aviation, medicine, military, sport,
   lab teams. Applicability to a two-week software sprint retro is an assumption.
10. **The GSS/anonymity corpus is single-session undergraduate groups** with no stake, no shared future,
    and no post-session outcome measure.

---

## Sources

All bibliographic details verified against [Crossref](https://api.crossref.org/). Sources are grouped by
role; the grade and provenance mark for each appears at its point of use above.

### Meta-analyses (Grade A)

- Lines, R. L. J., Pietsch, S., Crane, M., Ntoumanis, N., Temby, P., Graham, S., & Gucciardi, D. F.
  (2021). *The effectiveness of team reflexivity interventions.* Sport, Exercise, and Performance
  Psychology. [doi:10.1037/spy0000251](https://doi.org/10.1037/spy0000251) ·
  [preprint](http://www.danielgucciardi.com.au/uploads/9/7/3/6/9736343/lines_et_al.__in_press__team_reflexivity_meta-analysis.pdf) ·
  [OSF](https://osf.io/ruzy4/)
- Tannenbaum, S. I., & Cerasoli, C. P. (2013). *Do Team and Individual Debriefs Enhance Performance?*
  Human Factors, 55(1), 231–245. [doi:10.1177/0018720812448394](https://doi.org/10.1177/0018720812448394)
- Mullen, B., Johnson, C., & Salas, E. (1991). *Productivity Loss in Brainstorming Groups.* Basic and
  Applied Social Psychology, 12(1), 3–23.
  [doi:10.1207/s15324834basp1201_1](https://doi.org/10.1207/s15324834basp1201_1)
- Rains, S. A. (2005). *Leveling the Organizational Playing Field—Virtually.* Communication Research,
  32(2), 193–234. [doi:10.1177/0093650204273763](https://doi.org/10.1177/0093650204273763)
- Bond, R., & Smith, P. B. (1996). *Culture and conformity.* Psychological Bulletin, 119(1), 111–137.
  [doi:10.1037/0033-2909.119.1.111](https://doi.org/10.1037/0033-2909.119.1.111)
- Bond, R. (2005). *Group Size and Conformity.* Group Processes & Intergroup Relations, 8(4), 331–354.
  [doi:10.1177/1368430205056464](https://doi.org/10.1177/1368430205056464)
- Lu, L., Yuan, Y. C., & McLeod, P. L. (2012). *Twenty-Five Years of Hidden Profiles in Group Decision
  Making.* PSPR, 16(1), 54–75. [doi:10.1177/1088868311417243](https://doi.org/10.1177/1088868311417243)
- Klein, R. A., et al. (2014). *Investigating Variation in Replicability: A "Many Labs" Replication
  Project.* Social Psychology, 45(3), 142–152.
  [doi:10.1027/1864-9335/a000178](https://doi.org/10.1027/1864-9335/a000178)
- Sheeran, P., Listrom, O., & Gollwitzer, P. M. (2025). *The when and how of planning.* European Review of
  Social Psychology, 36(1), 162–194.
  [doi:10.1080/10463283.2024.2334563](https://doi.org/10.1080/10463283.2024.2334563)
- Karau, S. J., & Williams, K. D. (1993). *Social loafing: A meta-analytic review.* JPSP, 65(4), 681–706.
  [doi:10.1037/0022-3514.65.4.681](https://doi.org/10.1037/0022-3514.65.4.681)
- Fischer, P., et al. (2011). *The bystander-effect.* Psychological Bulletin, 137(4), 517–537.
  [doi:10.1037/a0023304](https://doi.org/10.1037/a0023304)
- Byron, K., Khazanchi, S., & Nazarian, D. (2010). *The relationship between stressors and creativity.*
  JAP, 95(1), 201–212. [doi:10.1037/a0017868](https://doi.org/10.1037/a0017868)
- Frazier, M. L., Fainshmidt, S., Klinger, R. L., Pezeshkan, A., & Vracheva, V. (2017). *Psychological
  Safety: A Meta-Analytic Review and Extension.* Personnel Psychology, 70(1), 113–165.
  [doi:10.1111/peps.12183](https://doi.org/10.1111/peps.12183)
- Baltes, B. B., Dickson, M. W., Sherman, M. P., Bauer, C. C., & LaGanke, J. S. (2002).
  *Computer-Mediated Communication and Group Decision Making.* OBHDP, 87(1), 156–179.
  [doi:10.1006/obhd.2001.2961](https://doi.org/10.1006/obhd.2001.2961)
- Newman, A., Donohue, R., & Eva, N. (2017). *Psychological safety: A systematic review.* HRMR.
  [doi:10.1016/j.hrmr.2017.01.001](https://doi.org/10.1016/j.hrmr.2017.01.001)
- Murphy, M. K., et al. (1998). *Consensus development methods.* Health Technology Assessment, 2(3).
  [PDF](https://njl-admin.nihr.ac.uk/document/download/2003171)

### Experiments and field studies (Grades A–B)

- Diehl, M., & Stroebe, W. (1987). *Productivity Loss in Brainstorming Groups.* JPSP, 53(3), 497–509.
  [doi:10.1037/0022-3514.53.3.497](https://doi.org/10.1037/0022-3514.53.3.497)
- Diehl, M., & Stroebe, W. (1991). *Tracking down the blocking effect.* JPSP, 61(3), 392–403.
  [doi:10.1037/0022-3514.61.3.392](https://doi.org/10.1037/0022-3514.61.3.392) — statistics UNVERIFIED
- Smith, S. M., Ward, T. B., & Schumacher, J. S. (1993). *Constraining effects of examples.* Memory &
  Cognition, 21(6), 837–845. [doi:10.3758/BF03202751](https://doi.org/10.3758/BF03202751)
- Kohn, N. W., & Smith, S. M. (2011). *Collaborative fixation.* Applied Cognitive Psychology, 25(3),
  359–371. [doi:10.1002/acp.1699](https://doi.org/10.1002/acp.1699)
- Zhou, X., et al. (2019). *Exposure to Ideas, Evaluation Apprehension, and Incubation Intervals.*
  Frontiers in Psychology, 10:1459. [doi:10.3389/fpsyg.2019.01459](https://doi.org/10.3389/fpsyg.2019.01459)
- Hofstetter, R., Dahl, D. W., Aryobsei, S., & Herrmann, A. (2020). *Constraining Ideas.* JMR, 58(1),
  95–114. [doi:10.1177/0022243720964429](https://doi.org/10.1177/0022243720964429)
- Asch, S. E. (1951). *Effects of group pressure upon the modification and distortion of judgments.*
  [PDF](https://gwern.net/doc/psychology/1955-asch.pdf)
- Franzen, A., & Mader, S. (2023). *The power of social influence.* PLOS ONE, 18(11), e0294325.
  [doi:10.1371/journal.pone.0294325](https://doi.org/10.1371/journal.pone.0294325)
- Tversky, A., & Kahneman, D. (1974). *Judgment under Uncertainty.* Science, 185(4157), 1124–1131.
  [doi:10.1126/science.185.4157.1124](https://doi.org/10.1126/science.185.4157.1124)
- Wilson, T. D., Houston, C. E., Etling, K. M., & Brekke, N. (1996). *A new look at anchoring effects.*
  JEP: General, 125(4), 387–402.
  [doi:10.1037/0096-3445.125.4.387](https://doi.org/10.1037/0096-3445.125.4.387)
- Englich, B., Mussweiler, T., & Strack, F. (2006). *Playing Dice With Criminal Sentences.* PSPB, 32(2),
  188–200. [doi:10.1177/0146167205282152](https://doi.org/10.1177/0146167205282152)
- Stasser, G., & Titus, W. (1985). *Pooling of unshared information.* JPSP, 48(6), 1467–1478.
  [doi:10.1037/0022-3514.48.6.1467](https://doi.org/10.1037/0022-3514.48.6.1467)
- Stelmakh, I., Rastogi, C., Shah, N. B., Singh, A., & Daumé, H. III (2023). *A large scale randomized
  controlled trial on herding in peer-review discussions.* PLOS ONE, 18(7), e0287443.
  [doi:10.1371/journal.pone.0287443](https://doi.org/10.1371/journal.pone.0287443)
- Connolly, T., Jessup, L. M., & Valacich, J. S. (1990). *Effects of Anonymity and Evaluative Tone on Idea
  Generation in Computer-Mediated Groups.* Management Science, 36(6), 689–703.
  [doi:10.1287/mnsc.36.6.689](https://doi.org/10.1287/mnsc.36.6.689)
- Jessup, L. M., Connolly, T., & Galegher, J. (1990). *The Effects of Anonymity on GDSS Group Process.*
  MIS Quarterly. [doi:10.2307/248893](https://doi.org/10.2307/248893)
- Valacich, J. S., Dennis, A. R., & Nunamaker, J. F. (1992). *Group size and anonymity effects.* Small
  Group Research, 23(1), 49–73. [doi:10.1177/1046496492231004](https://doi.org/10.1177/1046496492231004)
- Nunamaker, J. F., Dennis, A. R., Valacich, J. S., Vogel, D., & George, J. F. (1991). *Electronic Meeting
  Systems to Support Group Work.* CACM, 34(7), 40–61.
- Dennis, A. R., & Valacich, J. S. (1993). *Computer brainstorms: More heads are better than one.* JAP,
  78(4), 531–537. [doi:10.1037/0021-9010.78.4.531](https://doi.org/10.1037/0021-9010.78.4.531)
- Dennis, A. R., & Williams, M. L. (2005). *A Meta-Analysis of Group Size Effects in Electronic
  Brainstorming.* IJeC, 1(1), 24–42. [doi:10.4018/jec.2005010102](https://doi.org/10.4018/jec.2005010102)
- Pinsonneault, A., Barki, H., Gallupe, R. B., & Hoppen, N. (1999). *Electronic Brainstorming: The
  Illusion of Productivity.* ISR, 10(2), 110–133.
  [doi:10.1287/isre.10.2.110](https://doi.org/10.1287/isre.10.2.110)
- Baruah, J., Jimenez, E., & Paulus, P. B. (2025). *Comparing Virtual Brainwriting and Video-Based
  Brainstorming.* Journal of Creative Behavior, 59(4).
  [doi:10.1002/jocb.70058](https://doi.org/10.1002/jocb.70058)
- Paulus, P. B., Korde, R. M., Dickson, J. J., Carmeli, A., & Cohen-Meitar, R. (2015). *Asynchronous
  Brainstorming in an Industrial Setting.* Human Factors, 57(6), 1076–1094.
  [doi:10.1177/0018720815570374](https://doi.org/10.1177/0018720815570374)
- Baruah, J., & Paulus, P. B. (2008). *Effects of Training on Idea Generation in Groups.* Small Group
  Research, 39(5), 523–541. [doi:10.1177/1046496408320049](https://doi.org/10.1177/1046496408320049)
- Nemeth, C. J., Personnaz, B., Personnaz, M., & Goncalo, J. A. (2004). *The liberating role of conflict
  in group creativity.* EJSP, 34(4), 365–374. [doi:10.1002/ejsp.210](https://doi.org/10.1002/ejsp.210)
- Rietzschel, E. F., Nijstad, B. A., & Stroebe, W. (2006). *Productivity is not enough.* JESP, 42(2),
  244–251. [doi:10.1016/j.jesp.2005.04.005](https://doi.org/10.1016/j.jesp.2005.04.005)
- Edmondson, A. C. (1999). *Psychological Safety and Learning Behavior in Work Teams.* ASQ, 44(2),
  350–383. [doi:10.2307/2666999](https://doi.org/10.2307/2666999) ·
  [open access](http://nrs.harvard.edu/urn-3:HUL.InstRepos:37968728)
- Nembhard, I. M., & Edmondson, A. C. (2006). *Making it safe.* JOB, 27(7), 941–966.
  [doi:10.1002/job.413](https://doi.org/10.1002/job.413)
- Edmondson, A. C. (2003). *Speaking Up in the Operating Room.* JMS, 40(6), 1419–1452.
  [doi:10.1111/1467-6486.00386](https://doi.org/10.1111/1467-6486.00386)
- Milliken, F. J., Morrison, E. W., & Hewlin, P. F. (2003). *An Exploratory Study of Employee Silence.*
  JMS, 40(6), 1453–1476. [doi:10.1111/1467-6486.00387](https://doi.org/10.1111/1467-6486.00387)
- Knoll, M., Hall, R. J., & Weigelt, O. (2019). *A longitudinal study of the relationships between four
  differentially motivated forms of employee silence and burnout.* JOHP, 24(5), 572–589.
  [doi:10.1037/ocp0000143](https://doi.org/10.1037/ocp0000143)
- Deichmann, D., & van den Ende, J. (2014). *Rising from failure and learning from success.* Organization
  Science, 25(3), 670–690. [doi:10.1287/orsc.2013.0870](https://doi.org/10.1287/orsc.2013.0870)
- Locke, E. A., & Latham, G. P. (2002). *Building a practically useful theory of goal setting.* American
  Psychologist, 57(9), 705–717.
  [doi:10.1037/0003-066X.57.9.705](https://doi.org/10.1037/0003-066X.57.9.705)
- Ordóñez, L. D., Schweitzer, M. E., Galinsky, A. D., & Bazerman, M. H. (2009). *Goals Gone Wild.* AMP,
  23(1), 6–16. [doi:10.5465/amp.2009.37007999](https://doi.org/10.5465/amp.2009.37007999)
- Shah, J. Y., Friedman, R., & Kruglanski, A. W. (2002). *Forgetting all else: goal shielding.* JPSP,
  83(6), 1261–1280. [doi:10.1037/0022-3514.83.6.1261](https://doi.org/10.1037/0022-3514.83.6.1261)
- Häusser, J. A., Frisch, J. U., Wanzel, S. K., & Schulz-Hardt, S. (2017). *Effects of process and outcome
  accountability on idea generation.* Experimental Psychology, 64(4), 262–272.
  [doi:10.1027/1618-3169/a000368](https://doi.org/10.1027/1618-3169/a000368)
- Lerner, J. S., & Tetlock, P. E. (1999). *Accounting for the effects of accountability.* Psychological
  Bulletin, 125(2), 255–275. [doi:10.1037/0033-2909.125.2.255](https://doi.org/10.1037/0033-2909.125.2.255)
- Rogelberg, S. G., Leach, D. J., Warr, P. B., & Burnfield, J. L. (2006). *"Not another meeting!"* JAP,
  91(1), 83–96. [doi:10.1037/0021-9010.91.1.83](https://doi.org/10.1037/0021-9010.91.1.83)
- Luong, A., & Rogelberg, S. G. (2005). *Meetings and more meetings.* Group Dynamics, 9(1), 58–67.
  [doi:10.1037/1089-2699.9.1.58](https://doi.org/10.1037/1089-2699.9.1.58)
- Kauffeld, S., & Lehmann-Willenbrock, N. (2012). *Meetings Matter.* Small Group Research, 43(2),
  130–158. [doi:10.1177/1046496411429599](https://doi.org/10.1177/1046496411429599)
- Kauffeld, S., & Meyers, R. A. (2009). *Complaint and solution-oriented circles.* EJWOP, 18(3), 267–294.
  [doi:10.1080/13594320701693209](https://doi.org/10.1080/13594320701693209)
- Lehmann-Willenbrock, N., Meyers, R. A., Kauffeld, S., Neininger, A., & Henschel, A. (2011). *Verbal
  interaction sequences and group mood.* Small Group Research, 42(6), 639–668.
  [doi:10.1177/1046496411398397](https://doi.org/10.1177/1046496411398397)
- Shockley, K. M., et al. (2021). *The fatiguing effects of camera use in virtual meetings.* JAP, 106(8),
  1137–1155. [doi:10.1037/apl0000948](https://doi.org/10.1037/apl0000948)
- Bennett, A. A., Campion, E. D., Keeler, K. R., & Keener, S. K. (2021). *Videoconference fatigue?* JAP,
  106(3), 330–344. [doi:10.1037/apl0000906](https://doi.org/10.1037/apl0000906)
- Fauville, G., Luo, M., Queiroz, A. C. M., Bailenson, J. N., & Hancock, J. (2021). *Zoom Exhaustion &
  Fatigue Scale.* CHB Reports, 4, 100119.
  [doi:10.1016/j.chbr.2021.100119](https://doi.org/10.1016/j.chbr.2021.100119)
- Bailenson, J. N. (2021). *Nonverbal overload.* Technology, Mind, and Behavior, 2(1).
  [doi:10.1037/tmb0000030](https://doi.org/10.1037/tmb0000030) — **conceptual, not empirical**
- Bluedorn, A. C., Turban, D. B., & Love, M. S. (1999). *The effects of stand-up and sit-down meeting
  formats.* JAP, 84(2), 277–285.
  [doi:10.1037/0021-9010.84.2.277](https://doi.org/10.1037/0021-9010.84.2.277)
- Baer, M., & Oldham, G. R. (2006). *The curvilinear relation between experienced creative time pressure
  and creativity.* JAP, 91(4), 963–970.
  [doi:10.1037/0021-9010.91.4.963](https://doi.org/10.1037/0021-9010.91.4.963)
- Honey-Rosés, J., et al. (2020). *Comparing Structured and Unstructured Facilitation Approaches.* Group
  Decision and Negotiation. [doi:10.1007/s10726-020-09688-w](https://doi.org/10.1007/s10726-020-09688-w)
- Delbecq, A. L., & Van de Ven, A. H. (1971). *A Group Process Model for Problem Identification and
  Program Planning.* JABS, 7(4), 466–492.
  [doi:10.1177/002188637100700404](https://doi.org/10.1177/002188637100700404)

### Software engineering

- Matthies, C., & Dobrigkeit, F. (2020). *Towards Empirically Validated Remedies for Scrum Retrospective
  Headaches.* HICSS-53. [arXiv:1910.08763](https://arxiv.org/abs/1910.08763) ·
  [hdl:10125/64504](http://hdl.handle.net/10125/64504)
- Verwijs, C., & Russo, D. (2023). *A Theory of Scrum Team Effectiveness.* ACM TOSEM, 32(3), Article 74.
  [doi:10.1145/3571849](https://doi.org/10.1145/3571849) ·
  [PDF](https://vbn.aau.dk/ws/files/766875248/3571849.pdf)
- Lehtinen, T. O. A., Itkonen, J., & Lassenius, C. (2017). *Recurring opinions or productive improvements.*
  EMSE, 22(5), 2409–2452. [doi:10.1007/s10664-016-9464-2](https://doi.org/10.1007/s10664-016-9464-2)
- Dingsøyr, T., Mikalsen, M., Solem, A., & Vestues, K. (2018). *Learning in the Large.* XP 2018, 191–198.
  [doi:10.1007/978-3-319-91602-6_13](https://doi.org/10.1007/978-3-319-91602-6_13) ·
  [preprint](https://arxiv.org/pdf/1805.10310)
- Andriyani, Y., Hoda, R., & Amor, R. (2017). *Reflection in Agile Retrospectives.* XP 2017.
  [doi:10.1007/978-3-319-57633-6_1](https://doi.org/10.1007/978-3-319-57633-6_1) ·
  [PDF](https://rashina.com/wp-content/uploads/2011/06/xp2017-reflection.pdf)
- Hundhausen, C., Conrad, P., Tariq, A., Pugal, S., & Flores, B. (2024). *An Empirical Study of the
  Content and Quality of Sprint Retrospectives in Undergraduate Team Software Projects.* ICSE-SEET 2024.
  [doi:10.1145/3639474.3640074](https://doi.org/10.1145/3639474.3640074)
- Tariq, A., Conrad, P., Hundhausen, C., Yu, A., & Adesope, O. (2025). *Improving Agile Retrospectives
  through Metacognitive Scaffolding.* SIGCSE TS 2025.
  [doi:10.1145/3641554.3701927](https://doi.org/10.1145/3641554.3701927)
- Milani, A. M. P., Storey, M.-A., Katial, V., & Peate, L. (2025). *Exploring Retrospective Meeting
  Practices and the Use of Data in Agile Teams.* [arXiv:2502.03570](https://arxiv.org/abs/2502.03570)
- Przybyłek, A., Albecka, M., Springer, O., & Kowalski, W. (2021). *Game-based Sprint retrospectives.*
  EMSE, 27(1). [doi:10.1007/s10664-021-10043-z](https://doi.org/10.1007/s10664-021-10043-z) ·
  [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC8527976/)
- Lehtinen, T. O. A., Virtanen, R., Viljanen, J. O., Mäntylä, M. V., & Lassenius, C. (2014). *A tool
  supporting root cause analysis for synchronous retrospectives in distributed software teams.* IST,
  56(4). [doi:10.1016/j.infsof.2014.01.004](https://doi.org/10.1016/j.infsof.2014.01.004)
- Dingsøyr, T. (2005). *Postmortem reviews: purpose and approaches in software engineering.* IST, 47(5),
  293–303. [doi:10.1016/j.infsof.2004.08.008](https://doi.org/10.1016/j.infsof.2004.08.008)
- Skinner, R., Land, L., Chin, W., & Nelson, R. R. (2015). *Reviewing the Past for a Better Future.*
  IRWITPM 2015. [AIS eLibrary](https://aisel.aisnet.org/irwitpm2015/3/)
- Devanbu, P., Zimmermann, T., & Bird, C. (2016). *Belief & Evidence in Empirical Software Engineering.*
  ICSE '16, 108–119.

### Practitioner literature (Grade D — practice, not evidence)

- Kerth, N. L. (2000). *The ritual of retrospectives.* Software Testing & Quality Engineering, 2(5),
  53–57.
- Kerth, N. L. (2001). *Project Retrospectives: A Handbook for Team Reviews.* Dorset House.
- Derby, E., & Larsen, D. (2006). *Agile Retrospectives: Making Good Teams Great.* Pragmatic Bookshelf.
  [publisher page](https://pragprog.com/titles/dlret/agile-retrospectives/)
- Derby, E., Larsen, D., & Horowitz, D. (2024). *Agile Retrospectives, Second Edition.* Pragmatic
  Bookshelf. [publisher page](https://pragprog.com/titles/dlret2/agile-retrospectives-second-edition/)
- Loeffler, M. (2017). *Improving Agile Retrospectives.* Addison-Wesley.
  [excerpt](https://www.informit.com/articles/article.aspx?p=2916288&seqNum=3)
- Tannenbaum, S. I. (2013). *Using Debriefs.* OD Network Conference handout.
  [PDF](https://cdn.ymaws.com/www.odnetwork.org/resource/resmgr/2013_education/tannenbaum_using_debriefs_ha.pdf)
- Amabile, T. M., Hadley, C. N., & Kramer, S. J. (2002). *Creativity Under the Gun.* HBR, 80(8), 52–61.
  — **not peer-reviewed**
- Schwaber, K., & Sutherland, J. (2020). *The Scrum Guide.*
  [scrumguides.org](https://scrumguides.org/scrum-guide.html)
- Beck, K., et al. (2001). *Principles behind the Agile Manifesto.*
  [agilemanifesto.org](https://agilemanifesto.org/principles.html)

### Claims encountered that this review could NOT verify — do not state as fact

| Item | Status |
| --- | --- |
| Gollwitzer & Sheeran (2006) d = .65, k = 94 | Superseded by Sheeran et al. (2025); the 2006 numbers were not read |
| DeRosa, Smith & Hantula (2007) — any effect size | UNVERIFIED, every access route blocked |
| Diehl & Stroebe (1991) statistics | UNVERIFIED |
| Taylor, Berry & Block (1958) exact means | UNVERIFIED |
| Baltes et al. (2002) effect sizes | UNVERIFIED |
| Postmes & Lea (2000) effect sizes | UNVERIFIED |
| Lerner & Tetlock (1999) specific accountability conditions | UNVERIFIED |
| Van de Ven & Delbecq (1974) own numbers | UNVERIFIED (direction verified via Murphy et al. 1998) |
| Frazier et al. (2017) corrected correlations | Not obtained |
| Amabile, Hadley & Kramer (2002) figures | UNVERIFIED, and HBR is not peer-reviewed |
| "40–50% of retro action items never get done" | Vendor marketing; unmeasured in the literature |
| "Implementation intentions survived the replication crisis" | **False** — Sheeran et al. (2025) report extreme publication bias |
| Nunamaker et al. (1991) summary that Connolly et al. found "highest quality" ideas | **Contradicts Connolly et al.'s own abstract** — cite the original |

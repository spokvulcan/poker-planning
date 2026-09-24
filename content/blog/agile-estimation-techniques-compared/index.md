---
title: "Which Agile Estimation Technique Should You Use? 7 Methods Compared"
date: "2025-01-27"
spoiler: "Compare Planning Poker, T-Shirt Sizing, Affinity Estimation, and more. Find which method fits your team size, precision needs, and context."
tags: ["estimation", "agile", "scrum", "planning-poker", "sprint-planning", "remote-teams", "t-shirt-sizing"]
---

<Tldr>
**Planning Poker** prevents anchoring but takes time—best for sprint planning. **T-Shirt Sizing** communicates to stakeholders without false precision—best for roadmaps. **Affinity Estimation** handles large backlogs fast (100+ items in an hour). **Bucket System** scales Planning Poker to larger groups. **Three-Point (PERT)** quantifies uncertainty for high-risk items. **Dot Voting** prioritizes, not sizes. **Wideband Delphi** is the formal ancestor of Planning Poker. Match technique to context: backlog size, precision needs, audience, team distribution, and time constraints.
</Tldr>

Every team has this debate eventually. Someone suggests T-shirt sizing because it's faster. Someone else insists on Planning Poker because it's "proper agile." The Scrum Master read about Affinity Estimation and wants to try it on the massive backlog. Meanwhile, the product manager just needs a rough roadmap by Friday.

The truth is there's no universally best estimation technique. Each solves specific problems and creates specific tradeoffs. Planning Poker isn't better than T-Shirt Sizing. It's better for certain contexts and worse for others.

This guide breaks down seven estimation techniques so you can pick the right one for your situation, or combine them strategically.

> **Quick answer:** For most teams, use **Planning Poker for sprint planning** and **T-Shirt Sizing for roadmaps**. If you have 50+ items to estimate, start with **Affinity Estimation** to get the landscape, then Planning Poker for sprint selection. Remote teams should prioritize tools with blind voting to prevent anchoring bias.

## The Evaluation Framework

Before diving into techniques, here's what actually matters when choosing:

| Criterion | Why It Matters |
|-----------|----------------|
| **Anchoring resistance** | Does the technique prevent early opinions from biasing everyone else? |
| **Speed** | How quickly can you estimate a large backlog? |
| **Precision** | Does it produce fine-grained estimates or rough buckets? |
| **Team size** | Does it scale to large groups or break down past 5-6 people? |
| **Audience** | Can stakeholders understand it, or is it developer-only? |
| **Learning curve** | How long until a new team uses it effectively? |

## Comparison at a Glance

| Technique | Best For | Speed | Precision | Anchoring Resistance |
|-----------|----------|-------|-----------|---------------------|
| **Planning Poker** | Sprint planning, consensus building | Slow | High | Strong |
| **T-Shirt Sizing** | Roadmaps, stakeholder communication | Fast | Low | Moderate |
| **Affinity Estimation** | Large backlog grooming (50+ items) | Very Fast | Low | Moderate |
| **Bucket System** | Large groups estimating many items | Fast | Medium | Strong |
| **Three-Point (PERT)** | High-risk items, uncertainty tracking | Slow | Very High | Weak |
| **Dot Voting** | Prioritization (not sizing) | Fast | N/A | Weak |
| **Wideband Delphi** | Formal processes, documentation needs | Very Slow | High | Strong |

Now let's examine each technique in detail.

---

## Planning Poker vs T-Shirt Sizing vs Affinity: Quick Comparison

These three techniques cover most team needs. Here's when to reach for each:

| Scenario | Best Choice | Why |
|----------|-------------|-----|
| Sprint planning (dev team only) | [Planning Poker](#1-planning-poker-the-consensus-standard) | Precision + anchoring protection |
| Roadmap meeting with stakeholders | [T-Shirt Sizing](#2-t-shirt-sizing-quick-and-intuitive) | Intuitive, no Fibonacci confusion |
| 50+ item backlog grooming | [Affinity Estimation](#3-affinity-estimation-magic-estimation-speed-at-scale) | 10x faster than item-by-item |
| New team, learning to estimate | [T-Shirt Sizing](#2-t-shirt-sizing-quick-and-intuitive) | Lowest learning curve |
| High-stakes sprint, precision matters | [Planning Poker](#1-planning-poker-the-consensus-standard) | Discussion surfaces hidden complexity |
| Release planning workshop | [Affinity](#3-affinity-estimation-magic-estimation-speed-at-scale) → [Planning Poker](#1-planning-poker-the-consensus-standard) | Rough cut first, then refine |

---

## 1. Planning Poker: The Consensus Standard

Planning Poker is the most widely adopted estimation technique in agile teams. According to the 2024 State of Agile report[^1], 61% of respondents use story points, and Planning Poker is the dominant method for assigning them.

### How It Works

The session starts with each team member holding a deck of cards—typically [Fibonacci numbers](/blog/fibonacci-planning-poker/) like 1, 2, 3, 5, 8, 13, and 20. The Product Owner describes a user story, and the team asks clarifying questions about scope and assumptions. Once everyone understands what they're estimating, they privately select a card representing their estimate.

Here's where the magic happens: all cards are revealed simultaneously. If there's a spread—say, one person played a 3 while another played a 13—the outliers explain their reasoning. Maybe the 13 voter knows about a legacy integration that others forgot. Maybe the 3 voter has a shortcut in mind. That conversation is often more valuable than the number itself. The team discusses, then votes again. Most stories converge within two or three rounds.

James Grenning invented Planning Poker in 2002[^2] specifically to solve "the problem of people in agreement talking too much and dominating the effort." The simultaneous reveal is the critical mechanism—it prevents what psychologists call anchoring bias[^3], where the first number spoken pulls everyone else's estimates toward it.

### When It Shines (and When It Doesn't)

Planning Poker works best during sprint planning when precision matters and you have a team of 3-9 people who all contribute to the work. It's particularly valuable for stories where shared understanding matters as much as the number—the discussion phase catches misaligned assumptions before they become bugs in production.

That said, it's a slow technique. Expect 3-5 minutes per story, which adds up fast. If you're staring at 50+ backlog items, Planning Poker will take all day. It's also overkill for trivial tasks where the debate wastes more time than the work itself, and the Fibonacci numbers can confuse stakeholders who wonder why there's no 4 or 6.

The strength of Planning Poker is its anchoring resistance and the shared understanding it builds. The weakness is the time investment. Teams with good facilitators and focused backlogs love it; teams drowning in backlog often need something faster first.

For a deep dive on running effective sessions, see our [complete facilitation guide](/blog/how-to-facilitate-planning-poker/).

---

## 2. T-Shirt Sizing: Quick and Intuitive

T-Shirt Sizing replaces numbers with familiar labels: XS, S, M, L, XL, XXL. Everyone understands clothing sizes, which makes this technique accessible to anyone in the room—developers, product managers, and executives alike.

### How It Works

There's not much ceremony here. Someone presents a backlog item, and someone else calls out a size. Others either nod along or push back: "That feels more like a Large to me." A brief discussion happens if needed, the team settles on a size, and you move on.

Unlike Planning Poker, there's no simultaneous reveal. T-Shirt Sizing deliberately trades anchoring resistance for speed. The first voice matters more here, which is a problem when precision is important—and not a problem when you're doing rough roadmap planning where the difference between Medium and Large won't change any decisions.

### When It Shines (and When It Doesn't)

T-Shirt Sizing is perfect for roadmap planning with stakeholders who don't speak "story points." When your VP of Product asks how big something is, "It's a Large" lands better than "It's a 13." The technique also works well for initial backlog grooming when you're just trying to separate big work from small work, or for teams that keep converting story points back to hours. (Try converting "Medium" to hours—it doesn't work, which is the point.)

The technique struggles when you need velocity tracking for forecasting, or when the granularity matters. The jump from Small to Medium might represent a significant difference in effort that S/M/L can't capture. And because there's no standard definition—one team's Medium is another team's Large—T-shirt sizes don't transfer across teams.

### Mapping to Points

Most teams that use T-Shirt Sizing eventually need to convert for velocity tracking. A common mapping: XS equals 1 point, S equals 2, M maps to 3-5, L to 8, XL to 13, and XXL to 20 or more (which usually signals "split this story").

The important thing is to do this mapping after estimation, not during. The whole point of T-shirts is to avoid number-based thinking in the room. Once everyone's wearing their "this is a Large" hat, you can translate later.

---

## 3. Affinity Estimation (Magic Estimation): Speed at Scale

When you have 100 backlog items and three hours to estimate them all, Affinity Estimation is the answer. Also called "Silent Sorting" or "Magic Estimation," it's a physical sorting exercise that can estimate a large backlog in a fraction of the time Planning Poker would take.

### How It Works

Picture a wall or large table with columns labeled by size—either T-shirt sizes (XS through XL) or Fibonacci numbers (1, 2, 3, 5, 8, 13). Each backlog item is printed on an index card. The team gathers around, and here's the key part: everyone works silently.

Team members pick up cards, read them, and place them in columns based on relative size. Anyone can move any card at any time—still without talking. If you think that "Implement OAuth" card belongs in the Large column instead of Medium, you just move it. If someone else disagrees, they move it back. This silent negotiation continues for 5-15 minutes until the cards stop bouncing around.

Only then does discussion happen, and only for the contested items—the cards that kept moving back and forth. A brief conversation resolves each one, final positions are recorded, and you're done.

The silence is the innovation here. It prevents debates about individual items and forces decisions through action rather than argument. Office politics fade when nobody can argue for their pet project. And when a card keeps bouncing between columns? That's a signal of genuine uncertainty worth talking about.

### When It Shines (and When It Doesn't)

Affinity Estimation excels at estimating a new or neglected backlog quickly. You can process 100+ items in an hour—something that would take a full day with Planning Poker. It's also great for release planning when you need a rough distribution of work complexity, or for teams new to estimation who need to build intuition before diving into more formal techniques.

The tradeoff is obvious: less discussion means less shared understanding. You're optimizing for speed, not consensus-building. The technique also requires physical space or specialized digital tools, and it can feel chaotic to newcomers watching cards fly around the room.

Many teams find that the best approach is to combine techniques: use Affinity Estimation for initial backlog grooming to get the rough landscape fast, then apply Planning Poker to the specific items selected for the upcoming sprint where precision and shared understanding matter more.

---

## 4. Bucket System: Scaling Planning Poker

The Bucket System combines Planning Poker's structured approach with Affinity Estimation's speed. It's designed for situations Planning Poker can't handle: larger groups of 15-30 people estimating many items at once.

### How It Works

The setup involves creating physical or virtual "buckets" labeled with story point values—typically 0, 1, 2, 3, 5, 8, 13, 20, 40, and 100. The backlog gets distributed evenly among participants, with each person responsible for reading and placing their assigned stories into buckets.

Once all stories are placed, the team reviews from both ends of the spectrum. The items in the 0 and 1 buckets? Probably fine—skim past them. The items in the 40 and 100 buckets? Those deserve scrutiny. Anyone can challenge a placement, and a quick discussion resolves disagreements. The middle buckets get reviewed faster because most placements there are probably correct.

The insight driving this technique is that edge cases matter most. A story that lands in the "2" bucket is unlikely to cause problems even if it's slightly off. A story in the "100" bucket could derail a release if the estimate is wrong. By focusing discussion energy on outliers, you get quality estimates faster.

### When It Shines (and When It Doesn't)

The Bucket System is ideal for large planning sessions with many participants, particularly in SAFe environments during PI (Program Increment) planning. It handles substantial backlogs of 50-200 items in workshop format and works well when multiple sub-teams need to align on a common estimation scale.

For small teams where Planning Poker works fine, the Bucket System adds unnecessary complexity. It also requires either physical materials or specialized tools, which makes it harder for remote teams without good collaborative software. And because initial placements rely on individual judgment rather than group discussion, you get less shared understanding than full Planning Poker provides.

The technique demands an experienced facilitator who can keep the review phase moving and knows when to cut off discussion. Without that, bucket sessions can drag.

---

## 5. Three-Point Estimation (PERT): Quantifying Uncertainty

Three-Point Estimation, also known as PERT (Program Evaluation and Review Technique), comes from traditional project management rather than agile. But it solves a problem most agile techniques ignore: explicitly capturing and quantifying uncertainty.

### How It Works

For each item, you provide three estimates instead of one. The optimistic estimate assumes everything goes right—no surprises, no blockers, the happy path. The pessimistic estimate assumes problems emerge—the integration breaks, the API docs are wrong, the requirements change mid-sprint. The most likely estimate sits in between: realistic, neither lucky nor cursed.

From these three numbers, you calculate a weighted average: **(O + 4M + P) / 6**. The formula weights "Most Likely" heavily but incorporates the range. A task estimated at 2/3/4 days (low uncertainty) yields 3.0 days. A task estimated at 2/3/10 days (high uncertainty) yields 4.0 days. That spread tells you something a single number never could.

### When It Shines (and When It Doesn't)

Three-Point Estimation makes sense for high-risk features where uncertainty itself drives decisions. If the pessimistic case is "this might take three months instead of three weeks," stakeholders need to know that before committing. The technique also fits contract negotiations requiring documented risk analysis, integration work with external dependencies you don't control, or any situation where stakeholders need to understand risk rather than just effort.

For regular sprint planning, it's too slow—you're generating three estimates per item plus doing math. If your team already uses story points effectively for planning purposes, switching to PERT adds bureaucratic overhead without proportional benefit. And frankly, if the math intimidates your team, the technique will feel like a chore rather than a tool.

Some teams take a hybrid approach: Planning Poker for most estimation, with Three-Point applied only to specific high-risk items flagged during planning. This gets the uncertainty benefit where it matters without slowing down everything else.

---

## 6. Dot Voting: Simple Prioritization

Let's be clear upfront: Dot Voting isn't an estimation technique. It's a prioritization technique. But it appears in enough "estimation methods" lists that it's worth clarifying what it actually does—and doesn't—accomplish.

### How It Works

List your items on a board or wall. Give each participant a fixed number of dots—typically 3-5 stickers or marker dots. Everyone walks up and places their dots on the items they consider most important. When the voting ends, items with the most dots rank highest.

That's it. No numbers, no sizing, no complexity assessment. Dot Voting answers "what should we do first?" not "how big is this?" Those two questions are related but distinct, and conflating them causes problems.

### When It Shines (and When It Doesn't)

Dot Voting works well for deciding which features to tackle next sprint, breaking ties between similar-priority items, or getting quick input from larger groups where structured discussion would take too long. It's also great for workshops where everyone needs a voice in prioritization—the visual output is easy to photograph and share.

The technique falls apart for actual size estimation. It tells you nothing about how big something is. Social pressure also affects dot placement—people watch where leaders put their dots and follow. There's no anchoring protection, and the "winners" may not be the right answer, just the popular one.

Use Dot Voting for prioritization. Use something else for sizing.

<Cta>
Run a Planning Poker session in 10 seconds—share one link with your team. No signup, no installs, blind voting built in.
</Cta>

---

## 7. Wideband Delphi: The Formal Ancestor

Wideband Delphi is Planning Poker's more formal grandfather. Developed at RAND Corporation in the 1940s-50s[^4], it uses iterative anonymous polling to reach group consensus. Barry Boehm adapted it for software estimation in the 1980s[^5], and the technique has been influencing how we think about group estimation ever since.

### How It Works

The process begins with a coordinator distributing specification documents to all estimators. Each person independently produces estimates along with their assumptions—no discussion, no influence from others. The coordinator collects everything, anonymizes it, and shares the results back to the group, showing the distribution of estimates.

Now comes the discussion phase (the "wideband" part of the name refers to this high-bandwidth conversation). The group focuses on outliers and conflicting assumptions. Why did someone estimate three weeks when everyone else estimated three months? What do they know—or what are they missing? After discussion, everyone estimates again independently. This cycle repeats until convergence, typically 2-4 rounds over days or even weeks.

### When It Shines (and When It Doesn't)

Wideband Delphi fits contexts where formal estimation with audit trails is required—think government contracts or highly regulated industries. It also works for distributed teams who can't meet synchronously, since the async rounds accommodate different time zones and schedules. When you need documented assumptions alongside estimates, or when complex systems require synthesizing expertise from people who don't normally work together, Wideband Delphi provides the structure.

For regular sprint planning, it's absurdly slow. If you need estimates today rather than next week, this isn't your technique. Co-located teams who can just gather in a room and play Planning Poker shouldn't bother with the overhead. In most agile contexts, Wideband Delphi is overkill.

The historical note matters here: Planning Poker is essentially Wideband Delphi stripped down for agile's faster pace. The simultaneous card reveal replaces multiple rounds of anonymous polling. Understanding this heritage helps explain why Planning Poker works—it's not agile folklore, it's applied group decision science with the bureaucracy removed.

---

## Decision Guide: Picking the Right Technique

With seven techniques to choose from, where do you start? The answer depends on your context—specifically, how many items you're estimating, how much precision you need, who's in the room, and how your team works.

### Start with Backlog Size

If you're looking at under 20 items, Planning Poker is almost always the right call. The time investment pays off in shared understanding, and you'll finish in a reasonable session. With 20-50 items, you'll want to move faster—consider the Bucket System or Affinity Estimation to get rough sizes, then apply Planning Poker to the items you've selected for the sprint. Above 50 items, start with Affinity Estimation to get the landscape quickly, then Planning Poker for sprint selection.

### Match Precision to Purpose

Sprint planning demands precision because you're committing to deliver specific work. Planning Poker gives you the fine-grained story points you need for velocity tracking. Roadmap planning is different—precision at that level is illusory anyway, so T-Shirt Sizing's rough buckets are perfectly adequate. For high-risk items where uncertainty itself is important information, Three-Point/PERT explicitly captures the range.

### Consider Who's in the Room

A development team working alone can use Planning Poker with Fibonacci numbers without explanation. When stakeholders join the session, T-Shirt Sizing's familiar labels avoid the "why isn't there a 4?" conversation. If your organization requires formal documentation of estimates and assumptions, Wideband Delphi or Three-Point estimation produces the audit trail you need.

### Account for How Your Team Works

Co-located teams can use any technique. Remote teams need Planning Poker tools with proper blind voting, or they can run async Affinity sessions using digital whiteboards. Large distributed groups often find the Bucket System works best with structured facilitation—divide into breakout rooms, then reconvene to review outliers.

### Adjust for Team Experience

Teams new to agile should start with T-Shirt Sizing. The low learning curve builds estimation intuition without Fibonacci debates, and there's less pressure to get the "right" number when you're just picking a shirt size. Established teams benefit from Planning Poker with Fibonacci—you get velocity data and structured discussion that surfaces assumptions.

Mature teams with stable velocity might find estimation sessions feel like ceremony. If your estimates consistently match reality, experiment with reducing or eliminating formal estimation. The #NoEstimates movement has merit for teams who've outgrown the training wheels.

### The Combination Strategy

Here's something that trips teams up: using different techniques isn't inconsistent—it's smart. Many successful teams use Affinity Estimation for initial backlog grooming to get the rough landscape, T-Shirt Sizing for roadmap communication with stakeholders, Planning Poker for sprint planning where precision matters, and Three-Point estimation for specific high-risk features flagged during planning.

Each technique solves different problems. Use the right tool for each job.

---

## Estimation for Remote and Distributed Teams

With 81% of organizations now using distributed agile practices—a 34% increase since 2020—technique selection matters more for remote teams than ever. The core challenge is maintaining the simultaneous reveal that prevents anchoring when you can't see everyone's cards at once.

### What Works Remotely

Planning Poker adapts surprisingly well with the right tooling. The critical requirement is blind voting: everyone must commit to an estimate before seeing anyone else's choice. Tools that keep votes hidden until the facilitator reveals them replicate the in-person experience almost perfectly. Some remote teams actually report that estimation discussions work better over video—everyone has an equal-sized box on screen, which reduces the tendency for senior voices to dominate the room the way they might around a physical table.

T-Shirt Sizing translates naturally to async formats. A simple poll in Slack or Teams asking "Is this XS, S, M, L, or XL?" works fine. Because you're not chasing fine-grained precision anyway, the lack of a synchronized reveal matters less.

Affinity Estimation requires digital whiteboard tools like Miro or FigJam. The experience isn't quite as fluid as physical cards on a wall, but the silent sorting phase translates well enough. People drag cards independently, and contested placements become obvious when items keep bouncing between columns.

The Bucket System needs structured facilitation over video, but it can actually work better remotely than in person for large distributed teams. Breakout rooms shine here: divide the backlog among small groups, let each group estimate their portion, then reconvene to review outliers together.

### Making Remote Sessions Work

The logistics of remote estimation require more thought than in-person sessions. Share the backlog early—give the team time to review items before the session starts. Skimming during a video call is harder than glancing around a physical room.

Keep sessions shorter than you would in person. Remote estimation is more draining; aim for 60-90 minutes maximum with breaks. For global teams, rotate meeting times to share the burden of inconvenient time zones rather than making the same people join at midnight every sprint.

Most importantly, document assumptions. Remote discussions lose nuance that would be obvious in person. When someone's estimate includes "assuming we don't need to touch the payment integration," capture that in the ticket—not just the number.

---

## Common Mistakes to Avoid

### Mixing Techniques Mid-Session

Starting with Planning Poker, getting frustrated with pace, and switching to T-Shirt Sizing corrupts both. The scales don't map cleanly, and the team loses confidence in the estimates. Pick a technique and complete the session. Retrospect on whether to change approaches next time.

### Skipping Discussion When Estimates Diverge

When Planning Poker votes split between 3 and 13, that's not a problem to average away—that's valuable information. Someone sees complexity others don't, or there's a fundamental scope disagreement. The conversation that resolves the spread is often more valuable than the number you eventually assign.

### Converting Everything Back to Hours

Every technique in this guide measures relative complexity, not calendar time. The moment someone says "a Medium is about 3 days," you've given up the main benefit. Story points and T-shirt sizes work because they sidestep the [planning fallacy](/blog/story-points-vs-hours/). Converting back to hours reintroduces the bias.

### Using Estimation for Performance Metrics

When velocity or estimate accuracy becomes a performance measure, teams game it. Stories get inflated. Easy work gets overestimated. The signal becomes noise. Estimation is for planning, not performance review.

### Demanding Consensus on Everything

Not every item needs vigorous debate. If the team is consistently within one Fibonacci step (everyone voting 5 or 8), that's close enough. Demanding perfect consensus wastes time on decisions where the difference doesn't matter. Save the discussion energy for items with genuine spread.

---

## Frequently Asked Questions

<Faq>
<FaqItem question="Which estimation technique is most accurate?">
Research on this is surprisingly mixed. A 2022 study by Jørgensen and Escott[^6] found that relative estimation (story points) was actually less accurate than absolute estimation (hours) in controlled conditions. But accuracy isn't the whole story.

The value of techniques like Planning Poker comes from the discussion they force, not the precision of the output. When estimates diverge, teams discover misunderstandings before they become bugs. That benefit persists regardless of whether the final number is precisely "correct."

If pure prediction accuracy is your goal, track your estimates against actuals and iterate on your calibration. Any consistent technique can be calibrated over time.
</FaqItem>

<FaqItem question="Can we combine multiple estimation techniques?">
Combining techniques is common and often smart. A typical pattern involves using Affinity Estimation for initial backlog grooming to get rough sizes quickly, T-Shirt Sizing for roadmap discussions where stakeholders need to understand scope without Fibonacci confusion, and Planning Poker for sprint planning items where precision matters.

The key is using each technique for what it does well, not mixing them within a single session. Switching from Planning Poker to T-Shirt Sizing mid-meeting creates confusion about what the estimates mean.
</FaqItem>

<FaqItem question="How do remote teams estimate effectively?">
Remote estimation works well with the right tools. The key is maintaining the simultaneous reveal that prevents anchoring. Everyone needs to commit before seeing anyone else's estimate.

For Planning Poker, use a tool that keeps votes hidden until the facilitator reveals them. For Affinity Estimation, digital whiteboard tools like Miro or FigJam work, though the experience isn't quite as fluid as physical cards.

Some remote teams report that estimation discussions are actually better over video—everyone has an equal-sized box on screen, which can reduce the tendency for senior voices to dominate.
</FaqItem>

<FaqItem question="What if the team can't reach consensus?">
After 2-3 rounds of voting, if estimates still span widely—say, 3 to 21—the story probably has a problem that estimation won't solve. Either it's too big and needs to be split into smaller stories that can be estimated independently, or it's too vague and should go back to refinement for clearer acceptance criteria. Sometimes there's a fundamental disagreement about scope or approach that needs to be resolved outside the estimation session entirely.

When you must move on, take the higher estimate and note the uncertainty. Optimistic estimates cause more problems than conservative ones.
</FaqItem>

<FaqItem question="Should we use #NoEstimates?">
The #NoEstimates movement argues that estimation is often waste—time spent predicting that could be spent building. There's merit to this, especially for mature teams with stable velocity and well-understood work patterns.

But most teams benefit from the discussion that estimation forces. The value of asking "is this a 3 or an 8?" isn't the number—it's the conversation that surfaces hidden complexity and misaligned assumptions.

If your estimates consistently match reality and estimation sessions feel like ceremony, experiment with reducing or eliminating them. If estimates regularly surprise you, the discussion is probably still valuable.
</FaqItem>

<FaqItem question="Planning Poker vs T-Shirt Sizing: which is better?">
Neither is universally better—they solve different problems.

Planning Poker is your choice when you need fine-grained story points for velocity tracking, when precision matters (like during sprint planning), when you want structured discussion with anchoring protection, and when your team is 3-9 people.

T-Shirt Sizing wins when stakeholders are in the room and S/M/L is more intuitive than Fibonacci numbers, when you're doing roadmap planning where precision is illusory anyway, when you need to break the habit of converting points to hours, and when speed matters more than granularity.

Many teams use both: T-Shirt Sizing for roadmaps with stakeholders, Planning Poker for sprint planning with the dev team.
</FaqItem>

<FaqItem question="What's the best estimation technique for large backlogs?">
For backlogs over 50 items, Affinity Estimation (also called Magic Estimation or Silent Sorting) is significantly faster than item-by-item techniques.

The process: print stories on cards, create size columns, and have the team silently sort items into buckets. Anyone can move any card. When movement stops, discuss contested placements briefly. You can estimate 100+ items in an hour—something that would take a full day with Planning Poker.

A common pattern: use Affinity Estimation to get the rough landscape quickly, then apply Planning Poker to the specific items selected for the upcoming sprint.
</FaqItem>

<FaqItem question="How long should estimation sessions take?">
It depends on the technique and backlog size. Planning Poker typically takes 3-5 minutes per story, so a 10-story sprint backlog runs 30-50 minutes. T-Shirt Sizing is faster at 1-2 minutes per story, though you get less discussion. Affinity Estimation can process 100+ items in 60-90 minutes. The Bucket System handles 50-200 items in 2-3 hours with a larger group.

For remote sessions, keep total time under 90 minutes. Estimation over video is more draining than in person, so schedule breaks for longer sessions.

If sessions consistently run long, you may be over-discussing items that don't warrant it. Not every story needs vigorous debate—if everyone's voting 5 or 8, that's close enough.
</FaqItem>

<FaqItem question="What's the difference between story points and T-shirt sizes?">
Both measure relative complexity, not calendar time. The key differences come down to precision and audience.

Story points (1, 2, 3, 5, 8, 13...) allow velocity tracking. You can say "we complete about 30 points per sprint" and use that for forecasting. The Fibonacci sequence forces meaningful gaps—you can't split the difference between 5 and 8, which prevents false precision.

T-shirt sizes (XS, S, M, L, XL) are more intuitive for non-technical stakeholders. They resist conversion to hours better than numbers do, since nobody tries to calculate how many hours are in a "Medium." The tradeoff is that calculating velocity requires mapping sizes to points afterward.

Many teams use T-shirt sizes for initial grooming and roadmap discussions, then convert to story points for sprint planning where velocity matters.
</FaqItem>
</Faq>

---

## Wrapping Up

Seven techniques, each designed for different constraints. Planning Poker excels at building consensus with anchoring protection. T-Shirt Sizing communicates to stakeholders without false precision. Affinity Estimation handles large backlogs fast. The Bucket System scales Planning Poker to bigger groups. Three-Point estimation quantifies uncertainty for high-risk items. Dot Voting prioritizes (but doesn't size). Wideband Delphi provides formal documentation when needed.

The right choice depends on your context: how many items, how much precision matters, who's in the room, and how much time you have. Most teams benefit from using different techniques for different purposes rather than forcing one method to serve every need.

What matters more than the technique is the conversation it enables. When estimates diverge, you learn something about how different people understand the work. That insight is worth more than any number you write down.

<Cta label="Start Estimating in 10 Seconds">
Create a room, share the link, start voting. Works on any device—your remote team can join from anywhere.
</Cta>

[^1]: Digital.ai (2024). 18th State of Agile Report. https://digital.ai/resource-center/analyst-reports/state-of-agile-report/
[^2]: Grenning, J. (2002). Planning Poker. https://wingman-sw.com/articles/planning-poker
[^3]: Tversky, A. & Kahneman, D. (1974). Judgment under Uncertainty: Heuristics and Biases. Science. https://www.science.org/doi/10.1126/science.185.4157.1124
[^4]: RAND Corporation. Delphi Method. https://www.rand.org/topics/delphi-method.html
[^5]: Boehm, B. (1981). Software Engineering Economics. Prentice-Hall. ISBN 0-13-822122-7.
[^6]: Jørgensen, M. & Escott, W. (2022). Relative vs. absolute estimation in software development. Information and Software Technology. https://www.sciencedirect.com/science/article/pii/S0950584922000660

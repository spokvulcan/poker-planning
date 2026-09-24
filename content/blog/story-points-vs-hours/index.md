---
title: "Story Points vs Hours: Which Should Your Team Use?"
date: "2025-01-08"
spoiler: "The inventor of story points now regrets creating them. Research shows hours might actually be more accurate. So why do 61% of agile teams still use points?"
tags: ["story-points", "estimation", "agile", "sprint-planning"]
---

<Tldr>
Story points measure relative complexity, not time. A 5-point story isn't "5 hours", it's roughly twice as complex as a 3-point story. Use points when you need team consensus across different skill levels and want psychological safety from hour-based pressure. Stick with hours for fixed-price contracts or when stakeholders won't learn new concepts. The real value isn't accuracy. It's the discussion that happens when estimates diverge.
</Tldr>

Your manager asks how long a feature will take. You say two weeks. Six weeks later, you're still working on it.

This isn't a failure of discipline. It's just how human brains work. Daniel Kahneman won a Nobel Prize partly for documenting what he called the planning fallacy[^1]. In one study, psychology students estimated their thesis would take 33.9 days on average. The actual average was 55.5 days. When asked to give a deadline they were 99% confident about, only 45% met it. Story points emerged as a hack to sidestep this problem. Instead of asking "how many hours?" they ask "how big is this compared to that?"

## How Story Points Got Invented

Ron Jeffries was coaching the Chrysler C3 project in 1996 when he accidentally invented story points. The team was using "Ideal Days" to estimate work, which meant how long something would take "if the bastards would just leave you alone." No meetings, no interruptions. They'd multiply by about 3 to get real-world estimates.

The math worked fine. The communication didn't. Managers kept asking why it took nine days to complete three days of work. Jeffries' solution was simple: drop the "days" label entirely. Just call them "points." The confusion evaporated. Mike Cohn popularized the concept through his 2004 book _User Stories Applied_, and within a decade, story points had become synonymous with agile estimation.

Here's a fun fact: story points have never appeared in the official Scrum Guide. Not once. They're a convention, not a requirement.

## Why Your Brain Prefers Comparison

The case for story points comes from cognitive science. We're genuinely bad at absolute estimates. The planning fallacy[^1] shows we consistently underestimate how long things take because we imagine our specific situation and forget to check how long similar projects actually took.

But we're surprisingly good at relative judgments. Weber's Law[^2] says humans perceive differences in proportion rather than absolute terms. You can easily tell 1kg from 2kg, but telling 30kg from 31kg is much harder. When someone asks "is this task twice as complex as that one?" your brain can answer that question. "Will this take 14 or 17 hours?" Not so much.

There's also the problem of anchoring. Tversky and Kahneman's research[^3] showed that arbitrary numbers contaminate subsequent estimates. If a senior developer says "probably three days," everyone else's estimate shifts toward three days, even if they were initially thinking something different. The simultaneous reveal in [planning poker](/blog/how-to-facilitate-planning-poker/) specifically prevents this by forcing everyone to commit before seeing anyone else's number.

## The Research That Complicates Things

Here's where it gets interesting. The best controlled study on this topic found the opposite of what the theory predicts. Jørgensen and Escott's 2022 study[^4] tested 102 professional developers and found that relative estimates (story points) were actually _less_ accurate than absolute estimates (hours). Not by a small margin.

So we have a paradox. Theory says relative estimation should work better. The best empirical evidence says it doesn't. What's going on?

Maybe accuracy isn't the point. Story points might deliver value through better discussions and psychological safety rather than prediction precision. And maybe teams are just doing it wrong. Ron Jeffries himself now regrets creating story points[^5]. "I may have invented story points," he wrote, "and if I did, I'm sorry now." He says they're "frequently misused." The most common misuse? Converting points back to hours. Every team that maintains a secret conversion table (1 point = 8 hours) has given up the main benefit while keeping the overhead.

## When Hours Still Make Sense

Story points aren't always better. If you're billing by time on fixed-price contracts, you need hour estimates. Agile philosophy doesn't change basic business constraints. Similarly, when work is small and predictable, like fixing typos or updating config files, relative sizing adds overhead without providing value.

New teams face a chicken-and-egg problem: story points plus velocity only work after you have historical data. A brand new team might reasonably start with hours and transition to points once they've established patterns over a few sprints. And sometimes the battle isn't worth fighting. If leadership insists on hours and you lack the political capital to change that, fighting over estimation methods probably isn't your highest-leverage improvement.

The 2024 State of Agile report[^6] shows 61% of teams using story points. That means 39% are doing something else, and many of them are shipping software just fine.

## Common Mistakes

The most damaging mistake is equating points to hours. The moment someone says "1 point equals 8 hours," you've lost the abstraction benefit while keeping the overhead. If your team maintains a secret conversion table, you're doing hours with extra steps.

Another common problem is averaging disagreements instead of discussing them. When votes split 3, 5, 5, 8, 13, that spread signals different assumptions about the work. The 3 voter might know about reusable code. The 13 voter might see a hidden dependency. Calling it an 8 and moving on misses the entire point. The discussion that resolves the spread is more valuable than any number you assign.

Teams also undermine story points by letting senior voices anchor the discussion. If the same person always speaks first or their estimates carry more weight, you've recreated the hour-estimation problem with different labels. And the moment velocity becomes a productivity metric, teams game it. Stories get inflated, split work gets assigned maximum points, and the signal becomes noise. Velocity measures team capacity, not individual performance.

## Using AgileKit for Estimation

Remote teams struggle to maintain the simultaneous reveal that prevents anchoring. It's hard to hide your card when you're typing into a chat. AgileKit keeps all votes hidden until the facilitator reveals them. Everyone commits independently, then sees the spread together. The discussion focuses on outliers.

<Cta>
Try a free planning poker session with your team. No signup required.
</Cta>

## Frequently Asked Questions

<Faq>
<FaqItem question="How many hours is one story point?">
This is the wrong question. Story points don't convert to hours. A 5-point story is roughly twice the complexity of a 3-point story, but time varies by who does the work.

For timelines, use velocity. "We complete 50 points per sprint" translates to schedules without converting individual stories.
</FaqItem>

<FaqItem question="How do I explain story points to my manager?">
Focus on outcomes. "Story points help us forecast more accurately. Instead of guessing hours on individual tasks, we track how much complexity we consistently handle per sprint. We average 52 points. A 200-point project means roughly four sprints."

Most managers care about predictability, not methodology.
</FaqItem>

<FaqItem question="What if my team keeps converting points back to hours?">
This is the most common failure mode. Two options: force the abstraction by removing hours from all conversations for a few sprints. Or consider whether story points are actually serving your team. Ron Jeffries himself says teams should drop them if they're not providing clear value.
</FaqItem>

<FaqItem question="Are story points dying?">
The #NoEstimates movement argues estimation is waste. There's merit to this, especially for mature teams with stable velocity.

But most teams benefit from the discussion that estimation forces. The value of asking "is this a 3 or an 8?" isn't the number. It's the conversation that surfaces hidden complexity.

Story points aren't dying, but they're not sacred either. Use what helps your team.
</FaqItem>
</Faq>

## Wrapping Up

The inventor of story points regrets creating them. The best study found hours more accurate. Yet 61% of agile teams use story points and many report real benefits.

The paradox resolves when you stop thinking about estimation as prediction. Story points aren't better because they produce more accurate numbers. They're valuable because they change how teams talk about work. When estimates diverge, you discover misunderstandings. When the question is "how complex is this?" instead of "how many hours will you spend?" the dynamic shifts from commitment to collaboration.

The method matters less than the conversation.

<Cta label="Start Estimating with Your Team">
Ready to try story point estimation? No signup required.
</Cta>

[^1]: Wikipedia: Planning Fallacy https://en.wikipedia.org/wiki/Planning_fallacy
[^2]: Wikipedia: Weber-Fechner Law https://en.wikipedia.org/wiki/Weber%E2%80%93Fechner_law
[^3]: Tversky, A. & Kahneman, D. (1974). Judgment under Uncertainty: Heuristics and Biases. Science. https://www.science.org/doi/10.1126/science.185.4157.1124
[^4]: Jørgensen, M. & Escott, W. (2022). Relative vs. absolute estimation in software development. Information and Software Technology. https://www.sciencedirect.com/science/article/pii/S0950584922000660
[^5]: Jeffries, R. (2019). Story Points Revisited. https://ronjeffries.com/articles/019-01ff/story-points/Index.html
[^6]: Digital.ai (2024). 18th State of Agile Report. https://digital.ai/resource-center/analyst-reports/state-of-agile-report/

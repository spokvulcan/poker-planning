---
title: "How to Facilitate Planning Poker: A Complete Guide for Scrum Teams"
date: "2025-01-07"
spoiler: "Master facilitating planning poker. This guide covers the process, the science behind why it works, and practical tips from real sprint planning sessions."
tags: ["planning-poker", "estimation", "scrum", "agile"]
---

<Tldr>
Everyone votes at the same time using numbered cards, then you discuss the outliers. Use Fibonacci numbers (1, 2, 3, 5, 8, 13), focus on comparing stories to each other rather than guessing hours, and split anything over 13 points. The simultaneous reveal is the whole point: it prevents the loudest voice from anchoring everyone else's estimate.
</Tldr>

You've probably sat through an estimation meeting that went something like this: the tech lead says "that's probably a three-day task," and suddenly everyone nods along. Two weeks later, it's still not done, and nobody can figure out why the estimate was so wrong.

The problem isn't that your team is bad at estimating. The problem is how you're estimating.

When one person speaks first, everyone else unconsciously anchors to that number. Psychologists Amos Tversky and Daniel Kahneman documented this phenomenon back in 1974[^1], and decades of research since then have confirmed it: even when people know about anchoring bias, they still fall for it. Your brain latches onto the first number it hears and doesn't adjust enough from there.

Planning poker fixes this by forcing everyone to commit to an estimate before seeing anyone else's cards. It's a simple change, but the results are dramatic.

## What is Planning Poker?

Planning poker is a consensus-based estimation technique where team members use numbered cards to vote on how much effort a task requires. The key mechanic: everyone reveals their cards simultaneously, so nobody can anchor to someone else's number.

James Grenning invented the technique in 2002[^2] after one too many frustrating estimation sessions. As he described it, he wanted to solve "the problem of people in agreement talking too much and dominating the effort." The method sat in relative obscurity until Mike Cohn included it in his 2005 book _Agile Estimating and Planning_[^3], which brought it into mainstream agile practice.

The "poker" name comes from the cards, but there's another parallel worth noting: in poker, you don't show your hand until everyone has committed. Planning poker works the same way. Your estimate is your bet, and you can't change it once you've seen everyone else's cards.

## The Science Behind Why It Works

Planning poker isn't just a fun meeting format. It's built on solid psychological principles that make group estimation more accurate.

### Avoiding Anchoring Bias

Tversky and Kahneman's 1974 research[^1] showed that when people estimate unknown quantities, they start from an initial value (the "anchor") and adjust from there. The problem is that adjustments are almost always insufficient. If a senior developer says "that feels like an 8," junior developers will adjust their initial gut feeling toward 8, even if they were thinking 13.

The effect is surprisingly resistant to correction. Studies have shown that even when participants are warned about anchoring bias and offered financial incentives to avoid it, they still anchor. The only reliable mitigation is structural: don't let people see the anchor in the first place.

That's exactly what the simultaneous reveal does. Your estimate crystallizes before you have any anchor to adjust from.

### The Wisdom of Crowds

In 1907, the statistician Francis Galton analyzed a weight-guessing contest at a livestock fair[^4]. 787 people had tried to guess the weight of an ox after it was slaughtered and dressed. The individual guesses varied wildly, but Galton found something remarkable: the median guess was 1,197 pounds. The actual weight? 1,198 pounds. The crowd was off by less than 0.1%.

This "wisdom of crowds" effect works because individual errors tend to cancel out. One person overestimates, another underestimates, and the average lands surprisingly close to the truth. But there's a catch: the effect only works when estimates are independent. Once people start influencing each other, you lose the error-canceling benefit and end up with groupthink instead.

Planning poker preserves independence during the initial vote, then uses the discussion phase to share information, not to create conformity.

### Why Fibonacci Numbers Match How We Think

Most planning poker decks use the Fibonacci sequence: 1, 2, 3, 5, 8, 13, 21. Why these specific numbers?

The answer comes from a principle in psychophysics called Weber's Law[^5]. Humans perceive differences in proportion, not absolute terms. You can easily tell the difference between 1 pound and 2 pounds, that's a 100% increase. But telling the difference between 20 pounds and 21 pounds? Much harder, because that's only a 5% increase.

The Fibonacci sequence works because each number is roughly 60% larger than the one before it. That 60% gap stays perceptually consistent as the numbers grow. You can meaningfully distinguish a 5 from an 8 (60% larger), just as you can distinguish a 2 from a 3 (50% larger). But trying to distinguish a 7 from an 8? That 14% difference is below our perceptual threshold for complexity estimates.

Mike Cohn, who popularized planning poker, eventually modified his own scale to 1, 2, 3, 5, 8, 13, 20, 40, 100. He found that "21" gave stakeholders a false sense of precision. Nobody can really tell the difference between a 21-point story and a 23-point story.

## The Process: Step by Step

### 1. Prepare the Backlog

Before the session, your Product Owner should have a prioritized list of user stories ready. Each story needs:

- A clear description of what you're building
- Acceptance criteria (how do you know it's done?)
- Any constraints or dependencies the team should know about

Don't try to estimate stories that nobody understands yet. If the team has too many clarifying questions, the story needs more refinement, not an estimate.

### 2. Present the Story

The Product Owner reads the story aloud and gives any relevant context. Keep this brief, a minute or two at most. You're not designing the solution here; you're making sure everyone understands what needs to be built.

A typical user story format:

```
As a [type of user]
I want [some goal]
So that [some benefit]
```

### 3. Discuss and Clarify

Now the team asks questions. This is where important details surface:

- "Does this include the admin view, or just the customer-facing side?"
- "Are we building the API from scratch, or extending the existing endpoint?"
- "What happens if the payment fails, do we need retry logic?"

The goal is shared understanding, not solution design. You're not deciding _how_ to build it yet; you're making sure everyone agrees on _what_ you're building.

Time-box this to 2-3 minutes. If you can't get clarity quickly, the story probably needs to go back to refinement.

### 4. Everyone Votes Simultaneously

Each team member privately selects a card representing their estimate. When everyone is ready, reveal all cards at once.

This is the critical moment. No peeking, no waiting to see what the senior developer picks. Commit to your number before you see anyone else's.

### 5. Discuss the Outliers

If everyone voted 5, you're done. But usually there's spread, maybe you see 3, 5, 5, 8, 13.

Start with the outliers:

- **High estimator**: "What complexity are you seeing that others might have missed?"
- **Low estimator**: "What's your approach? Is there something that makes this simpler than it looks?"

This discussion is where planning poker really earns its keep. The spread in estimates often reveals misunderstandings, hidden complexity, or different assumptions about scope. Someone voting 3 might be thinking "we can reuse the existing component," while someone voting 13 is thinking "we need to build that from scratch."

### 6. Re-vote if Needed

After discussion, vote again. Usually 2-3 rounds are enough to converge. If you're still spread after that, you have a few options:

- **Split the story**: If it's too big or too vague to estimate, break it into smaller pieces
- **Take the higher estimate**: When in doubt, pessimism beats optimism
- **Accept the spread**: Record the estimate with a note about the uncertainty

Don't waste time trying to reach perfect consensus. If you've spent more than 5 minutes on a single story, something else is wrong.

## Choosing Your Estimation Scale

### Fibonacci (Most Common)

**Cards: 1, 2, 3, 5, 8, 13, 21**

The gaps between numbers grow larger as complexity increases, which matches how uncertainty works. You might be off by 1 point on a small story, but you could easily be off by 8 points on a large one.

Use this if: You want the most widely understood scale with the strongest psychological backing.

### T-Shirt Sizes

**Cards: XS, S, M, L, XL, XXL**

Some teams find that numbers invite false precision. Calling something a "Medium" feels more honest than calling it a "5" when you're really just comparing it to other stories.

Use this if: Your team struggles with treating story points as hours, or if stakeholders keep asking "so how many hours is a 5?"

Map sizes to points later for velocity tracking: XS=1, S=2, M=3, L=5, XL=8, XXL=13.

### Powers of 2

**Cards: 1, 2, 4, 8, 16, 32**

The doubling makes relative sizing more explicit. Each jump means "roughly twice as complex as the previous."

Use this if: Your team thinks naturally in terms of doubling.

## Special Cards and What They Mean

| Card   | When to Play It                                                             |
| ------ | --------------------------------------------------------------------------- |
| **0**  | Already done, or trivial enough to not bother estimating (under 15 minutes) |
| **?**  | "I don't have enough information to estimate this"                          |
| **☕** | "I need a break", use this to pause a long session                           |
| **∞**  | "This is too big to estimate as a single story, split it"                    |

The ? card is particularly valuable. If multiple people play it, that's a clear signal that the story needs more refinement before estimation.

## Running Effective Sessions

### Establish a Reference Story

Pick a completed story that everyone understands and agrees was "a 3" (or whatever your baseline is). When someone asks "is this bigger or smaller than that authentication story we did?", you have a shared reference point.

Update your reference periodically. As the team's skills and codebase evolve, what used to be a 3 might become a 2.

### Include Everyone Who Does the Work

Developers, testers, designers, anyone who contributes to completing the story should estimate. Testers often catch complexity that developers overlook ("how are we going to test the edge cases?"), and designers can flag UI work that might not be obvious from the story description.

### Keep It Moving

If a story takes more than 5 minutes including discussion, something's wrong. Either the story needs refinement, or you're over-discussing. Set a visible timer if your team tends to debate endlessly.

A well-run session can estimate 15-20 stories per hour. If you're getting half that, look at whether your stories are too vague or your discussions are going off-track.

### Watch for Estimation Antipatterns

- **Converting to hours**: When someone says "that's probably 2 days of work, so I'll call it a 5," they're fighting the abstraction. Story points measure complexity relative to other stories, not time.
- **Anchoring on one voice**: If the same person always votes first or always leads discussion, rotate who presents their reasoning.
- **Averaging disagreement**: If votes split between 3 and 13, calling it an 8 misses the point. That disagreement signals a misunderstanding that needs resolution, not a math problem.

## Common Mistakes (And How to Fix Them)

### Treating Story Points as Hours

"If a 1 is a day of work, then a 5 is a week..." Stop. This defeats the purpose of relative estimation.

Story points measure complexity and uncertainty relative to other stories your team has done. A senior developer might finish a 5-point story in two hours; a junior might take two days on the same story. The point value is the same because the _complexity_ is the same.

Track velocity (points completed per sprint) and let the empirical data tell you how many points your team can handle. Don't try to convert points to hours.

### Skipping the Discussion

The conversation is more valuable than the number. If everyone votes 5 and you immediately move on, you've missed the point. Even when estimates align, a quick "anything tricky here?" can surface important details.

The best estimation sessions produce not just numbers, but shared understanding of what you're building and how you'll approach it.

### Re-Estimating Completed Work

Once a story is done, its estimate is historical data. Don't change it to match reality, that corrupts your velocity metrics.

If a 3-point story took much longer than expected, that's useful information for future estimates. But changing the 3 to an 8 after the fact just makes your velocity charts meaningless.

### Endless Debate on a Single Story

If you can't converge after 3 rounds of voting, the story has a problem that estimation won't solve. Either:

- It's too big (split it)
- It's too vague (send it back to refinement)
- There's a fundamental disagreement about approach (discuss outside estimation)

Take the higher estimate, note the uncertainty, and move on.

## Using AgileKit for Remote Sessions

Running planning poker in person is straightforward: hand out cards and flip them over. Remote and hybrid teams need a digital solution that maintains the simultaneous reveal.

AgileKit makes this simple:

1. **Create a room**: One click, shareable link, no accounts needed
2. **Everyone joins**: Works on any device, no downloads
3. **Pick your deck**: Fibonacci, T-shirt sizes, or create your own
4. **Vote together**: Real-time sync, cards stay hidden until reveal
5. **See the spread**: Visual display makes outliers obvious

<Cta>
Try a free planning poker session with your team, no signup required.
</Cta>

## Frequently Asked Questions

<Faq>
<FaqItem question="How long should a planning poker session take?">
Plan for 1-2 hours to cover 15-20 stories. That works out to about 3-5 minutes per story on average, including discussion. If you're consistently taking longer, your stories probably need more refinement before estimation. A well-prepared backlog makes estimation faster.
</FaqItem>

<FaqItem question="What's the difference between story points and hours?">
Story points measure relative complexity: how hard this story is compared to other stories you've done. Hours measure calendar time, which varies by who does the work. A 5-point story might take a senior dev 3 hours and a junior dev 3 days. The point value reflects the complexity, not the duration.

Track how many points your team completes per sprint (velocity), and use that to predict capacity. Over time, the relationship between points and calendar time becomes predictable without ever converting directly.
</FaqItem>

<FaqItem question="Does planning poker work for remote teams?">
Often better than in-person. The simultaneous reveal is easier to enforce digitally, no peeking at your neighbor's card. Remote teams also report less social pressure during voting, which can lead to more honest estimates.

The key is having the right tool. You need real-time synchronization so everyone sees the reveal at the same moment.
</FaqItem>

<FaqItem question="Who should participate in planning poker?">
Everyone who contributes to completing stories. Developers are obvious, but include testers (they catch edge-case complexity), designers (UI work isn't always visible in story descriptions), and anyone else doing the work. The Product Owner participates to clarify requirements, but typically doesn't vote. They're not doing the implementation work.
</FaqItem>

<FaqItem question="What if our estimates are always wrong?">
First, check that you're measuring the right thing. You're not trying to predict hours. You're trying to rank stories by relative complexity. If you consistently estimate story A as bigger than story B, and story A consistently takes more effort, your estimation is working even if neither matches a specific time.

If your velocity (points completed per sprint) stabilizes over a few sprints, your estimates are useful. The absolute numbers don't matter; the relative consistency does.
</FaqItem>
</Faq>

## Wrapping Up

Planning poker works because it's built on solid psychology, not just agile tradition. The simultaneous reveal prevents anchoring bias. The discussion phase leverages the wisdom of crowds. The Fibonacci scale matches how humans actually perceive differences in complexity.

But the real value isn't the number you assign. It's the conversation that produces it. When a 3 and a 13 land on the same story, you've discovered a misunderstanding that would have caused problems during implementation. That's worth far more than getting the "right" estimate.

<Cta label="Start Your Free Planning Poker Session">
Ready to try planning poker with your team? No signup required.
</Cta>

[^1]: Tversky, A. & Kahneman, D. (1974). Judgment under Uncertainty: Heuristics and Biases. Science. https://www.science.org/doi/10.1126/science.185.4157.1124
[^2]: Grenning, J. (2002). Planning Poker. https://wingman-sw.com/articles/planning-poker
[^3]: Cohn, M. (2005). Agile Estimating and Planning. Prentice Hall. https://www.mountaingoatsoftware.com/books/agile-estimating-and-planning
[^4]: Wikipedia: Wisdom of the Crowd. https://en.wikipedia.org/wiki/Wisdom_of_the_crowd
[^5]: Wikipedia: Weber-Fechner Law. https://en.wikipedia.org/wiki/Weber%E2%80%93Fechner_law

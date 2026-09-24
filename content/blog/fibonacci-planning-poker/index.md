---
title: "Why Planning Poker Uses the Fibonacci Sequence (And Why It Works)"
date: "2025-01-11"
spoiler: "The Fibonacci sequence isn't agile tradition or arbitrary convention. It's built on how human perception actually works. Here's the science behind why 1, 2, 3, 5, 8, 13 makes your estimates better."
tags: ["planning-poker", "fibonacci", "estimation", "agile", "story-points"]
---

<Tldr>
Planning poker uses Fibonacci numbers (1, 2, 3, 5, 8, 13) because of Weber's Law: humans perceive differences in proportion, not absolute terms. The ~60% gap between Fibonacci numbers matches our perceptual threshold for distinguishing complexity. Linear scales (1-10) create false precision—you can't meaningfully tell a 7 from an 8. Fibonacci forces you to commit: is this closer to 5 or 8? That constraint produces better estimates and faster consensus.
</Tldr>

The first time someone hands you a [planning poker](/blog/how-to-facilitate-planning-poker/) deck, the numbers look strange. 1, 2, 3, 5, 8, 13, 21. Why not just count to 10?

It turns out this specific sequence solves a problem most teams don't realize they have. When you estimate with linear numbers, you're asking your brain to make distinctions it literally cannot make. The result is fake precision that feels accurate but isn't.

The Fibonacci sequence isn't agile folklore. It's applied cognitive science.

## The Perception Problem

In 1834, the physiologist Ernst Weber discovered something fundamental about human perception[^1]. He asked people to compare weights and found that our ability to notice differences depends on proportion, not absolute amount.

Pick up a 1kg weight in one hand and a 2kg weight in the other. The difference is obvious—one is twice as heavy. Now try 20kg versus 21kg. Same 1kg difference, but much harder to detect. Weber found that humans need roughly a 5-10% difference to reliably distinguish weights, sounds, or brightness levels.

This principle, later formalized as Weber's Law, applies to abstract judgments too. Including software complexity.

When someone asks "is this task a 7 or an 8 on a 10-point scale?", they're asking you to detect a 14% difference in complexity. That's below human perceptual threshold. You might as well flip a coin.

But "is this a 5 or an 8?" That's a 60% difference. Your brain can answer that question.

## Why Fibonacci Numbers Work

The Fibonacci sequence has a useful property: each number is roughly 60% larger than the one before it. As the sequence grows, this ratio approaches the golden ratio (approximately 1.618).

| Jump | Increase |
|------|----------|
| 1 → 2 | 100% |
| 2 → 3 | 50% |
| 3 → 5 | 67% |
| 5 → 8 | 60% |
| 8 → 13 | 62% |
| 13 → 21 | 62% |

These gaps stay perceptually consistent as the numbers grow. You can meaningfully distinguish a 5 from an 8, just like you can distinguish a 2 from a 3. The proportional jump is similar, so your brain treats them as equivalently different.

Linear scales don't have this property. On a 1-10 scale, the jump from 1 to 2 is 100%, but the jump from 8 to 9 is only 12.5%. You're asking your brain to make increasingly fine distinctions as numbers grow—exactly when uncertainty makes those distinctions meaningless.

## The False Precision Trap

Here's a conversation that happens in estimation meetings everywhere:

"I think it's a 7."
"Really? I was thinking more like 6."
"Maybe 6.5?"

This feels like progress. It isn't. Nobody can reliably distinguish a 6 from a 7 in task complexity. The discussion is refining noise, not signal.

Fibonacci numbers don't allow this. When one person says 5 and another says 8, they can't split the difference to 6.5. They have to talk about why they see different complexity. That conversation surfaces actual information: different assumptions about scope, hidden dependencies, varying approaches to the implementation.

The constraint isn't a limitation. It's the mechanism that produces better estimates.

## Mike Cohn's Modified Scale

Mike Cohn [popularized planning poker](/blog/how-to-facilitate-planning-poker/) through his book _Agile Estimating and Planning_[^2]. Over years of practice, he modified the traditional Fibonacci sequence to: 1, 2, 3, 5, 8, 13, 20, 40, 100.

Notice what changed at the high end. Instead of 21, 34, 55, 89, he switched to rounder numbers: 20, 40, 100.

His reasoning was practical: "21" gives stakeholders a false sense of precision. When you say a story is "21 points," it sounds like you've calculated something specific. "20 points" signals what it actually is—a rough estimate of something big. The rounded numbers communicate uncertainty more honestly.

Most planning poker implementations follow Cohn's modified scale, and that's what you'll find in AgileKit's default Fibonacci deck.

## What About Other Sequences?

Fibonacci isn't the only option. Some teams use powers of 2 (1, 2, 4, 8, 16, 32) or T-shirt sizes (XS, S, M, L, XL). Each has tradeoffs.

**Powers of 2** make doubling explicit. Each jump means "roughly twice as complex." This works well for teams who think naturally in terms of doubling, but the gaps grow faster than Fibonacci—the jump from 16 to 32 might be too coarse for mid-sized work.

**T-shirt sizes** solve a different problem entirely. Some teams find that any number, even story points, invites conversion back to hours. Calling something "Large" instead of "8" breaks that mental habit. You can map sizes to points later for velocity tracking (S=2, M=5, L=8), but during estimation, the abstraction stays abstract.

Neither is wrong. But Fibonacci has the strongest theoretical backing and the widest adoption, which means new team members are more likely to understand it immediately.

## The Anchoring Benefit

Fibonacci numbers also help prevent [anchoring bias](/blog/how-to-facilitate-planning-poker/#avoiding-anchoring-bias)—the tendency to fixate on the first number you hear and adjust insufficiently from there.

With a linear scale, estimates cluster. If someone says "6," others gravitate toward 5, 6, or 7. The anchor pulls everyone into a narrow range. With Fibonacci, there's no 6 or 7. If someone's thinking "around 6," they have to commit: is it closer to 5 or closer to 8?

That forced choice creates more spread in initial votes, which means more information surfaces during discussion. When everyone votes 5-6-7, there's nothing to talk about. When votes split between 5 and 8, you learn something about how different people are thinking about the work.

## When Fibonacci Doesn't Help

Fibonacci numbers assume meaningful complexity differences exist between stories. For very small tasks—things that take under an hour—the distinctions collapse. Is updating a config file a 1 or a 2? Does it matter?

Many teams use "0" for trivial work that doesn't warrant estimation, or they batch small items together. Spending five minutes debating whether a typo fix is a 1 or 2 defeats the purpose of relative estimation.

At the other end, Fibonacci breaks down past 21 or so. Can you really distinguish a 55 from an 89? At that scale, the right answer is usually "this story is too big—split it." Playing the infinity card (∞) signals that estimation isn't possible until the work is decomposed into smaller pieces.

## Applying This in Practice

Understanding why Fibonacci works changes how you use it:

**Don't chase precision.** When you're torn between 5 and 8, that uncertainty is the estimate. Pick one and note the ambiguity. Spending ten minutes debating misses the point.

**Use reference stories.** Pick a completed story everyone agrees was "a 5" (or whatever your baseline is). New stories get compared to that reference. "Is this bigger or smaller than the authentication story?" gives your brain a concrete comparison instead of an abstract judgment. See our [facilitation guide](/blog/how-to-facilitate-planning-poker/#establish-a-reference-story) for more on establishing baselines.

**Trust the gaps.** When votes split widely (3 vs 13), that's not a failure—it's valuable information. Someone sees complexity others don't, or there's a fundamental misunderstanding about scope. The Fibonacci scale made that gap visible; a linear scale might have hidden it as "7 vs 9."

**Let large numbers signal uncertainty.** A 13-point story doesn't mean "exactly 13 units of work." It means "this is significantly larger than an 8, with corresponding uncertainty." Communicate that to stakeholders who might interpret big numbers as precise predictions.

## The Surprising Research

Here's a twist that complicates the clean story: empirical research on estimation accuracy is mixed.

A 2022 study by Jørgensen and Escott[^3] tested 102 professional developers and found that relative estimates (story points) were actually less accurate than absolute estimates (hours). This contradicts the theoretical predictions. (We dig deeper into this research in [Story Points vs Hours](/blog/story-points-vs-hours/).)

How do we reconcile this? One possibility: accuracy isn't the primary value of story points. The Fibonacci scale and relative estimation might deliver benefits through better team discussions and reduced individual pressure, even if the numbers themselves aren't more precise.

When estimates diverge, you discover misunderstandings before they become bugs. When the question is "how complex is this relative to that?" instead of "how many hours will you spend?", the conversation shifts from commitment to collaboration.

The Fibonacci sequence optimizes for those conversations by creating natural breakpoints that surface disagreement.

## Using AgileKit for Fibonacci Estimation

AgileKit's default deck uses the modified Fibonacci scale: 0, 1, 2, 3, 5, 8, 13, 20, 40, 100, plus ?, ☕, and ∞ for special cases. The simultaneous reveal ensures nobody anchors to someone else's number—estimates stay independent until everyone has committed.

<Cta>
Try a free planning poker session with your team. No signup required.
</Cta>

## Frequently Asked Questions

<Faq>
<FaqItem question="Why not just use a 1-10 scale?">
Linear scales create distinctions your brain can't reliably make. The difference between 7 and 8 is only 14%—below human perceptual threshold for complexity judgments. You end up with false precision that feels accurate but isn't.

Fibonacci's ~60% gaps between numbers match how perception actually works. You can meaningfully tell a 5 from an 8, just like you can tell a 2 from a 3.
</FaqItem>

<FaqItem question="What does each Fibonacci number mean?">
There's no universal definition—a "5" means different things to different teams. What matters is internal consistency. A 5 should be roughly 60% more complex than a 3 and 60% less complex than an 8, based on your team's past experience.

Many teams establish a reference story ("the login feature was a 5") and estimate new work relative to that baseline.
</FaqItem>

<FaqItem question="Should we use the traditional sequence (1, 2, 3, 5, 8, 13, 21) or Cohn's modified version (ending in 20, 40, 100)?">
Cohn's modified version is more common because rounder numbers at the high end communicate uncertainty more honestly. "21 points" sounds precise; "20 points" sounds like an estimate.

For most teams, the practical difference is minimal. Pick one and stay consistent.
</FaqItem>

<FaqItem question="What if a story falls exactly between two Fibonacci numbers?">
That's the point—Fibonacci forces a choice. "Is this closer to 5 or 8?" requires you to commit, which surfaces your actual judgment instead of hiding in ambiguous middle ground.

If you genuinely can't decide, pick the higher number. Optimistic estimates cause more problems than conservative ones.
</FaqItem>

<FaqItem question="Why do some teams use T-shirt sizes instead?">
T-shirt sizes (S, M, L, XL) prevent a common failure mode: converting story points back to hours. When every estimate is a number, teams slip into thinking "8 points = 8 hours" or similar conversions.

Calling something "Large" breaks that mental habit. You can map sizes to points later for velocity tracking, but during estimation, the abstraction stays abstract.
</FaqItem>
</Faq>

## Wrapping Up

The Fibonacci sequence in planning poker isn't arbitrary tradition. It's built on Weber's Law—the psychological principle that humans perceive differences in proportion, not absolute terms.

Linear scales ask your brain to make distinctions it can't reliably make. Fibonacci's growing gaps stay perceptually consistent as numbers increase, which means your estimates reflect actual judgment instead of noise. The forced choice between 5 and 8 (rather than splitting to 6.5) creates productive disagreement that surfaces hidden complexity.

The sequence is a tool, not a rule. If your team estimates well with powers of 2 or T-shirt sizes, keep doing what works. But if you've ever watched a team debate whether something is a 6 or a 7, you've seen the problem Fibonacci solves.

<Cta label="Start Your Free Planning Poker Session">
Ready to try Fibonacci estimation with your team? No signup required.
</Cta>

[^1]: Wikipedia: Weber-Fechner Law. https://en.wikipedia.org/wiki/Weber%E2%80%93Fechner_law
[^2]: Cohn, M. (2005). Agile Estimating and Planning. Prentice Hall. https://www.mountaingoatsoftware.com/books/agile-estimating-and-planning
[^3]: Jørgensen, M. & Escott, W. (2022). Relative vs. absolute estimation in software development. Information and Software Technology. https://www.sciencedirect.com/science/article/pii/S0950584922000660

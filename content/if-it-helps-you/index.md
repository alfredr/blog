---
title: "If it helps you, it's about you"
date: "2026-10-20"
summary: "Data that improves a decision for you carries information about you. A short proof, and what it means for anonymization."
---

For data to help someone make a better decision for you, it has to tell them something about you. This holds even if you never contributed a record, and even if the recipient cannot identify you.

The Commission's Digital Omnibus proposes amending the GDPR's definition of personal data so that information is not personal data for an entity that cannot identify the person by means reasonably likely to be used by that entity [@omnibus2025]. The proposal follows the Court of Justice's judgment in *EDPS v SRB* (C-413/23 P) [@srb2025].

The EDPB's draft guidelines on anonymization also assess anonymity in context [@edpb2026]. They consider the entities that could realistically receive the data and ask whether those entities could isolate your record, link it to other data, or infer information about you, updating the criteria of the Article 29 Working Party's 2014 opinion [@wp29-2014].

Data described as anonymous is often intended to help people: to improve treatment, recommendations or services. That leaves a question about what protection the label promises. The following argument shows why it cannot promise that the recipient will learn nothing about you.

## The setup

Suppose a clinic is choosing a treatment for you, or an app is deciding what to recommend. Write

- $X$ for the thing about you that matters, such as a condition or a preference;
- $Y$ for the data it receives, such as a dataset, summary statistics or a trained model;
- $Z$ for what the recipient already knows.

The recipient chooses an action $a = f_w (Y, Z)$, where the seed $w ~ mu$ is drawn from a fixed distribution independently of $(X, Y, Z)$. Fixing the seed makes the decision rule deterministic. The action's benefit to you is measured by a utility $U(a, X)$.

Write $EE$ for expectation. Assume the expectations below are finite and the maxima are attained. Define the data's **advantage** as the improvement over the best decision the recipient could make with $Z$ alone:

$$
"Adv" = EE[U(f_w (Y, Z), X)] - EE[max_a EE[U(a, X) | Z]].
$$

The expectation includes the seed. Randomizing among actions cannot outperform the best action given $Z$, so the baseline needs no seed. The data helps you when $"Adv" > 0$.

## A short proof

**Claim 1.** If $Y$ is independent of $X$ given $Z$, then $"Adv" <= 0$.

*Proof.* Write $g(Z) = max_a EE[U(a, X) | Z]$ for the best expected utility available with $Z$ alone.

Fix an output $y$ and a seed $w$. The seed is drawn independently of $(X, Y, Z)$, so fixing it leaves the recipient's beliefs about $X$ unchanged. Conditional independence means that, given $Z$, learning $Y = y$ leaves them unchanged too. With $y$ and $w$ fixed, the action $f_w (y, Z)$ depends only on $Z$, so

$$
EE[U(f_w (y, Z), X) | Y = y, Z] &= EE[U(f_w (y, Z), X) | Z] \
  &<= g(Z).
$$

The inequality compares this action with the best action available given $Z$. Averaging both sides over $Y$, $Z$ and $w$ gives $EE[U(f_w (Y, Z), X)] <= EE[g(Z)]$, which is $"Adv" <= 0$. $square.stroked$

Claim 1 is a familiar fact of decision theory: information that leaves the relevant beliefs unchanged cannot improve on the best decision already available [@howard1966; @blackwell1953].

The conditional mutual information $I(Y; X | Z)$ measures how much $Y$ tells the recipient about $X$ beyond what it already knew from $Z$. It is zero exactly when $Y$ is independent of $X$ given $Z$ (§2.6, eq. (2.92), p. 29) [@cover2006], so by Claim 1, positive advantage requires $I(Y; X | Z) > 0$.

## How much information

For this bound, assume $0 <= U(a, x) <= R$ for every action $a$ and state $x$, with $R > 0$. We can then put a lower bound on how much information the benefit requires.

**Claim 2.** Measuring information in nats (using natural logarithms),

$$
"Adv" <= R sqrt(1/2 I(Y; X | Z)),
$$

so whenever $"Adv" >= 0$,

$$
I(Y; X | Z) >= (2 "Adv"^2)/R^2.
$$

*Proof.* Let $P$ and $Q$ be two distributions for $X$, and write $EE_P$ for expectation under $P$. Their total variation is the largest difference in probability they assign to the same event $E$:

$$
"TV"(P, Q) = sup_E abs(P(E) - Q(E)).
$$

We will also use the Kullback–Leibler divergence, $"KL"(P || Q)$, another measure of how the distributions differ.

For a fixed action, write $V = U(a, X)$. Since $0 <= V <= R$, expected utility is the area under the curve $t mapsto P(V > t)$. Thus

$$
EE_P[V] - EE_Q[V] &= integral_0^R (P(V > t) - Q(V > t)) dif t \
  &<= R dot "TV"(P, Q) \
  &<= R sqrt(1/2 "KL"(P || Q)),
$$

where at every threshold $t$, the probabilities differ by at most total variation, and the interval has length $R$. The last inequality follows by Pinsker's inequality (Lemma 11.6.1, p. 370) [@cover2006].

Write $P_z$ for the recipient's beliefs about $X$ given $Z = z$, and $P_(y, z)$ for its beliefs after also seeing $Y = y$. As in Claim 1, fixing the seed changes neither.

Fix $y$, $z$ and $w$, and let $a = f_w (y, z)$ be the action chosen. The gain is the expected utility of $a$ under the updated beliefs, minus the best expected utility available without the data. Under the prior beliefs $P_z$, that best action does at least as well as $a$. Applying the bound above gives

$$
EE_(P_(y, z))[U(a, X)] - max_(a') EE_(P_z)[U(a', X)] &<= EE_(P_(y, z))[U(a, X)] - EE_(P_z)[U(a, X)] \
  &<= R dot "TV"(P_(y, z), P_z) \
  &<= R sqrt(1/2 "KL"(P_(y, z) || P_z)).
$$

The advantage is the average of this gain over $Y$, $Z$ and $w$. Since the square root is concave, Jensen's inequality bounds the average of the square roots by the square root of the average. The average KL divergence is $I(Y; X | Z)$, giving

$$
"Adv" <= R EE[sqrt(1/2 "KL"(P_(Y, Z) || P_Z))] <= R sqrt(1/2 I(Y; X | Z)).
$$

When $"Adv" >= 0$, both sides are nonnegative, so squaring and rearranging gives the second bound.[^pinsker-jensen] $square.stroked$

[^pinsker-jensen]: See, e.g., [@russo2016], Fact 9 (p. 15) and Appendix A.1 (pp. 20–21), for the same combination of Pinsker's and Jensen's inequalities.

The lower bound on information grows with the square of the advantage relative to $R$. A release that delivers a substantial fraction of the possible benefit must carry a corresponding amount of information about you.

## What anonymity promises

A positive expected benefit tells us that the data carries information about the person helped. We can reach this conclusion without identifying them, finding their record or linking them across datasets. Another holder of $Y$ with the same relevant background information $Z$ can use that information too.

Recital 26 of the GDPR describes anonymous information as information that "does not relate to an identified or identifiable natural person" [@gdpr2016]. Under the holder-specific reading proposed by the Omnibus, data can be anonymous for a recipient and still help it make decisions about you. The legal assessment concerns the recipient's means of identification; the mathematical argument concerns what the data tells it about you.

A promise that the data teaches nobody anything new about you would go further. This is Dalenius's goal for statistical databases [@dalenius1977]. Dwork and Naor showed that a natural formalization of this goal is incompatible with useful releases when arbitrary auxiliary information is allowed [@dwork2010]. Claim 1 shows that it would also rule out a positive advantage in this model. The information that improves a decision for you is information about you, however the data is classified.

## Learning from other people

Your record need never appear in the data. A study of smokers can teach a recipient something about you, a smoker, whether or not you took part (pp. 5–6) [@dwork2014]. Models trained on other people's data work because some of what they learn applies to you.

The EDPB draft recognizes population learning in its inference test. Paragraph 67 counts an inference as meaningful only if it relies on the given data and "could not be obtained from general knowledge or from data about the population at large" [@edpb2026]. The distinction to make precise is between what a release teaches us about the population and what it reveals specifically about an individual.

Both kinds of learning can tell us something about you. One way to make the distinction precise is to compare releases with and without an individual's contribution, taking account of what the recipient already knows. This hints at a definition of relative anonymization that allows population learning while bounding the effect of that contribution. We'll develop that comparison, including what counts as an individual's contribution, in the next post. As a nice surprise, we'll see that this definition aligns with the EDPB's inference test, which already suggests comparing inferences with and without a person's data, in a way that makes the test more precise (paragraph 71(b), footnote 43) [@edpb2026].

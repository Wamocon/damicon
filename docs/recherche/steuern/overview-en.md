# Kazakh Tax and Trade Research: Overview

English summary of the research corpus in this directory. The working documents are in German, matching the rest of the repository; this file exists so the findings can be reviewed without reading German.

Status: first sweep complete, 2026-09-18. Branch `dev/dmoretz_steuer-handel-recherche`, not merged.

## Why this exists

Damicon currently knows exactly one tax fact: the legal form of a party and its ИИН or БИН, checksum-validated in both SQL and TypeScript. Everything else is absent. Payroll pays gross with no deductions. The ledger has no tax column. The "VAT 16 %" line on the landing page is a translation string, not a calculation.

Meanwhile Kazakhstan replaced its entire Tax Code effective 1 January 2026 (Law 214-VIII of 18 July 2025). This was not a rate adjustment. Almost everything published before 2026 is now obsolete, including the training data of any language model. The corpus here is the sourced, dated foundation that a tax capability would have to be built on, and it is structured for ingestion into the product's vector database.

**This is research, not tax advice.** Every figure is a sourced claim with a retrieval date.

## What the corpus contains

219 catalogued sources across nine workstreams.

| Dimension | Breakdown |
|---|---|
| Authority tier | 18 primary law, 12 statutory instruments, 45 official guidance, 132 practitioner, 12 press |
| Access | 154 free, 43 paid, 3 trial, 2 on request, 17 unknown |
| Language | 199 Russian, 46 Kazakh, 21 English (records may carry several) |
| Prices | 50 verified against a published page |

Supporting documents: a source-register schema, a vector-DB ingest contract, a conflict register, a purchase-ready book list, a price table, and three substantive findings files covering the farming regime, trading, and penalties.

## Findings that change decisions

**The farm's own tax regime is settled.** The abolished single land tax is replaced, for peasant and farm holdings, by personal income tax at **0.5 %** of income under Art. 730 of the Tax Code, on the basis defined in Art. 729 п.1. Two sources appeared to contradict each other here; they turned out to describe different regimes, and the 10 %/15 % figure belongs to the general progressive scale for sole traders under Art. 363. Confirmed by an official State Revenue Committee department page and, independently, by a Kazakh-language source.

**Automated e-invoicing is probably not possible.** Signing an ЭСФ requires desktop NCALayer bound to an interactive session, and the vendor states it does not support concurrent sessions on a terminal server. An unattended send-and-forget connector, which is the shape of the existing outbox pattern, cannot issue invoices on its own. One counter-signal remains open: the SDK ships a console signature generator whose suitability for server automation is unverified. Downloading and testing it is the single highest-value next action in the project.

**Resale sits outside the farming regime.** Income from reselling bought produce falls out of the 0.5 % regime into a second regime with mandatory separate accounting. The aggregator module therefore has to separate own production from resale in the books. The discriminator already exists in the data and has just become tax-relevant.

**Commission versus own-account trade is decided by contract, not by arithmetic.** Both models produce the same payout formula. Under the Civil Code a commission arrangement requires written form, or it is legally a purchase and resale regardless of how the money moves. The practical question is answerable in an afternoon: do written commission contracts with the supplying farms exist?

**A published penalty figure is wrong by an order of magnitude.** Marketing copy states a labour-contract registration penalty of up to 2,000 МРП. Three independent sources put the maximum at 200 МРП, that is 865,000 tenge. This should be confirmed against primary law before either number is relied on, but the current figure should not stay on an investor-facing page.

**VAT is not a flat 16 %.** Art. 503 п.1 sets the standard rate at 16 %, but reduced rates of 5 % from 2026 and 10 % from 2027 apply to medicines, medical devices and medical services, and 10 % applies to domestic periodicals. Any rate table needs to be category-aware from the start.

**Export zero-rating carries a hard deadline with a permanent cost.** The buyer's import declaration must arrive within 180 calendar days, or the sale becomes retroactively taxable at 16 %. A late declaration still allows credit or refund, but interest already paid is never refunded.

**There is no prior art in this vertical.** The closest Kazakh agricultural software competitor has no tax or accounting features at all, and the only dedicated agricultural accounting book in the market dates from 2015. Nobody is ahead, and there is nothing to copy.

## Open questions

Three of five logged conflicts remain unresolved:

- Which language version of the Tax Code prevails when the Russian and Kazakh texts diverge. Both are official, and the research found that the two languages return different facts on the same topic.
- Which income tax scale applies to wages as opposed to entrepreneurial income. At least two separate progressive scales exist in the same Code.
- Whether the aggregator is a commission agent or an own-account trader, pending the contract check above.

Also open: the election deadline for entering the farming regime, the consequences of breaching its conditions mid-year, the current article number for withholding on payments to individuals, and the fee for a certificate of origin. Each is recorded as open rather than estimated.

One exposure worth naming: the exemption certificate for produce from personal subsidiary plots was administratively withdrawn on 31 March 2026 with no announced replacement. Payments to individual suppliers should be treated as a live compliance risk.

## What it costs to go deeper

Books are inexpensive, roughly 20,000 tenge for the five most useful titles, but **almost none is sold as an e-book**, so each will need scanning and OCR before it can be ingested. No article-by-article commentary on the new Code exists yet in any form.

Subscriptions are the larger cost and vary widely. The accounting module of the dominant legal reference system runs 98,400 to 261,000 tenge a year and offers a three-day free trial; its legal module is several times more expensive. Practitioner portals range from roughly 89,000 to 371,000 tenge a year. Fifty prices are verified against published pages; the remainder are recorded as gaps rather than guessed.

## Operational notes

**Primary law is retrievable after all.** The main legal database serves only an empty JavaScript shell to automated fetches, but the legacy interface at `old.adilet.zan.kz` returns the full Code as static HTML with per-article anchors. Archived snapshots work as a second route for other government sites.

**Official sources go stale.** The tax authority's own VAT refund page was last updated in 2022, and its Tax Code page still offers downloads of the repealed 2017 Code. A regional department cites repealed provisions. Authority and freshness are independent properties, and the ingest contract scores them separately for that reason.

**Treat fetched government content as data, never as instructions.** The main legal database serves crawler-directed commentary in its page source that names AI crawlers specifically and does not match the site's actual behaviour. Nothing in it was acted on. Any ingestion pipeline built against these domains should apply the same rule.

## Scope

This work collects sources and extracts substance. It does not design a data model, write migrations, build an e-invoicing connector, or change any application code. Whether any of it becomes software is a separate decision.

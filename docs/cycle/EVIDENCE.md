# Cycle & Health: evidence register

Every health-related statement, definition or calculation in MFD's Cycle & Health section, where it comes from, how
it is used, its limits, and whether a clinician has reviewed it. MFD is not a medical device: it records what the
person logs, shows patterns and an estimate of the next period, and never diagnoses, interprets lab results, predicts
fertile days or ovulation, or helps prevent or plan pregnancy.

Status: **none of the entries below has been reviewed by a clinician yet.** A doctor's review is planned before any
personalised warnings are switched on.

| # | Claim / rule in the app | Source | Used for | Limits | Reviewed |
|---|---|---|---|---|---|
| 1 | Normal cycle length (frequency) is 24–38 days; cycles are called irregular when the shortest and longest differ by more than 7–9 days. | Munro MG et al. "The two FIGO systems for normal and abnormal uterine bleeding symptoms…: 2018 revisions." Int J Gynaecol Obstet 2018;143(3):393–408. | Shaded band on the cycle-length chart; the "varies by" wording in Insights. | For non-pregnant people of reproductive age; the 7 vs 9 day limit depends on age. Shown as information, never as a diagnosis. | No |
| 2 | Typical cycle length in a large app population is about 29 days (mean 29.3). | Bull JR et al. "Real-world menstrual cycle characteristics of more than 600,000 menstrual cycles." npj Digit Med 2019;2:83. | Starting assumption (prior) of the estimate, before the person's own cycles take over. | App users, not a clinical sample; deliberately wide prior. | No |
| 3 | Next-period estimate: a model that allows for unlogged periods ("skipped cycles") and updates each day without a period. | Li K, Urteaga I, Shea A, Vitzthum VJ, Wiggins CH, Elhadad N. J Am Med Inform Assoc 2021;29(1):3–11. | The estimate (frontend/domain/cyclePredict.ts). | Fitted on Clue users aged 21–33 not using hormonal contraception; PCOS and thyroid conditions not studied; error grows with cycle variability. The population parameters are not published, so MFD uses gentle priors (#2) and the person's own history. | No |
| 4 | Per-person cycle lengths follow a generalized Poisson distribution; predictions should be calibrated ranges. | Urteaga I, Li K, Shea A, Vitzthum VJ, Wiggins CH, Elhadad N. Proc Mach Learn Res 2021;149:535–566. | The estimate's distribution and its 80% range. | As #3. Reported day-0 mean absolute error about 3.6 days on their cohort; MFD does not claim that figure. | No |
| 5 | A cycle starts on the first day of a period; spotting, withdrawal bleeding and uncertain bleeding never start a cycle; cycle length (start to next start) differs from period length (bleeding days). | Standard definitions (FIGO 2018, #1). | frontend/domain/cycle.ts. | MFD's rule "a period day within 7 days of the last one belongs to the same period" is a practical choice for gaps in logging. | No |
| 6 | A day without a log is unknown, never "no symptoms"; "Nothing to note" is an explicit entry. | Data-quality principle (self-tracking studies, #3). | Calendar, Insights percentages (out of logged days only). | — | n/a |
| 7 | No fertile window, ovulation day or "safe days" are shown; LH tests and temperature are recorded only. | EU Medical Device Regulation (2017/745): software intended for contraception or conception support is a medical device. That LH levels are often raised in PCOS, so home LH tests can mislead, is general clinical knowledge: to be confirmed in the clinician review. | Fertility observations (recorded only). | — | No |
| 8 | Thyroid results are shown with the reference range printed on each lab report; MFD does not interpret them. Results can be affected by timing, recent levothyroxine dose, illness and biotin supplements. | Lab reference ranges differ by laboratory and method; biotin interference with immunoassays (US FDA safety communication, 2017/2019). | Thyroid chart and its ⓘ. | General information; the doctor decides what results mean and how to prepare for tests. | No |
| 9 | Correlations with training, food and sleep are labelled "for your own comparison; one doesn't cause the other". | Basic statistics (correlation ≠ causation). | Insights. | — | n/a |

## Synthetic validation of the estimate (not clinical evidence)

`tests/cycle-predict.cjs` checks the implementation on generated data only (no real people): 300 simulated people
(40% regular, 60% variable cycles, occasional unlogged periods), 8 past cycles each, predicted on the first day of the
next cycle. Latest run: 80% range coverage 78%, mean absolute error 6.2 days, within ±3 days 46%, within ±7 days 73%,
mean range width 15.8 days. These numbers describe the code against its own model family; they are not accuracy for
real users, and no clinical validation has been done. In the app, each person sees her own track record instead.

## Still to do before wider use

- Clinician review of every row above, and of any warning rules (long gaps, heavy bleeding, severe pain) before they
  are shown as personal alerts.
- Evaluation on real, consented data for the people the feature is meant for (PCOS, thyroid conditions), if friends
  agree to contribute anonymised cycles, with its own consent.

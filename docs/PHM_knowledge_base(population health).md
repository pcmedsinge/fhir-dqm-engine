# US Population Health Knowledge Base

**A practitioner's guide to FHIR-native Digital Quality Measures, CQL, and the 2026+ build opportunity**

*Compiled from working sessions on May 21, 2026*

---

## Table of contents

1. [The market opportunity in plain numbers](#1-the-market-opportunity-in-plain-numbers)
2. [The regulatory forcing function](#2-the-regulatory-forcing-function)
3. [How quality measures actually work](#3-how-quality-measures-actually-work)
4. [CQL — Clinical Quality Language](#4-cql--clinical-quality-language)
5. [The architecture — how it all connects](#5-the-architecture--how-it-all-connects)
6. [Population types and measure variations](#6-population-types-and-measure-variations)
7. [eCQM vs HEDIS dQM — the same machinery, different doors](#7-ecqm-vs-hedis-dqm--the-same-machinery-different-doors)
8. [The recommended build](#8-the-recommended-build)
9. [Build plan and go-to-market](#9-build-plan-and-go-to-market)
10. [Glossary of every acronym used](#10-glossary-of-every-acronym-used)

---

## 1. The market opportunity in plain numbers

US Medicare is the federal health insurance program for older Americans. About half of all Medicare beneficiaries opt for a private insurance plan that administers their Medicare benefits — these are called **Medicare Advantage (MA)** plans. The big names are UnitedHealthcare, Humana, Aetna (CVS Health), Centene, Cigna.

**The MA market is approximately $500 billion.**

Every year CMS grades each MA plan from 1 to 5 stars, using the **Star Ratings** system. Plans rated 4 stars or higher receive **Quality Bonus Payments (QBP)** — substantial bonus revenue from the government. Plans below 4 stars receive less. The financial leverage is enormous:

- A plan moving from **3.0 Stars to 4.0 Stars** can expect to **increase revenue by 13.4–17.6%** through QBP and enrollment effects.
- A single-star **decline** at a major payer has been publicly disclosed as **over $1 billion in lost revenue** (Humana, 2024–2025).
- The 2026 ratings showed 64% of MA prescription-drug enrollees in 4+ star plans; the industry average is 3.66.

### The lever underneath Star Ratings

Star Ratings are computed from a portfolio of quality measures. The most important measure set is **HEDIS** (Healthcare Effectiveness Data and Information Set) — the national report card for health plans, owned by **NCQA** (National Committee for Quality Assurance). Over 90% of US health plans use HEDIS to gauge performance, covering 190+ million Americans.

Each HEDIS measure asks a "did you take good care of your members?" question:
- Did your diabetic members get an HbA1c test?
- Did your members aged 50–74 get colorectal cancer screening?
- Are your members' blood pressures actually controlled?

A member who *should* have received care but didn't has an open **care gap**. Closing care gaps lifts HEDIS scores → lifts Star Ratings → unlocks bonus payments.

**Care gap closure is therefore the upstream lever for billions of dollars in MA revenue.**

### Why this play beats the alternatives

Several other 2026 US population health initiatives were considered. Here's the scorecard:

| Option | Demand | Dollar value | Open-source whitespace | Verdict |
|---|---|---|---|---|
| CMS ACCESS Model PROM pipeline | High | Medium (narrow tracks) | Medium | Good but narrow TAM |
| HCC V28 risk-adjustment NLP | Very High | Very High | Low (Navina, Reveleer, MedInsight dominate) | Too crowded |
| Prior authorization (CMS-0057) | High | High | Low (Da Vinci PAS IG locked in) | Commoditized |
| SDOH extraction agent | Medium | Medium | Medium | Better as feature than product |
| **FHIR dQM engine + AI care-gap closure** | **Very High** | **Very High** | **High** | **Recommended** |

The HEDIS dQM space is the rare combination of *forced* demand, *huge* dollar value, *thin* open-source tooling, and clean alignment with FHIR + MCP + LLM-agent skills.

---

## 2. The regulatory forcing function

Three forces converge in 2026 that make this opportunity time-bound:

### Force 1: NCQA's mandated transition to Digital Quality Measures

NCQA is **retiring manual chart abstraction** for HEDIS reporting. Until recently, HEDIS measures were computed two ways:

1. **From insurance claims** — fast but incomplete (lots of clinical info never makes it onto a bill).
2. **By humans literally reading patient charts** — called *chart abstraction*. Nurses and trained coders sift thousands of records by hand. Slow, expensive ($20–50M/year for a big plan), error-prone.

NCQA's replacement is **Digital Quality Measures (dQMs)** specified in **FHIR + CQL**, submitted via the **ECDS** (Electronic Clinical Data Systems) reporting domain.

**Key dates:**
- **MY 2026:** 25 measures specified under ECDS.
- **MY 2025:** Only 8 measures still allowed hybrid (manual-abstraction) reporting.
- **MY 2029:** Endpoint for retiring the hybrid methodology entirely.
- **2030:** All HEDIS measures must be submitted through ECDS or administrative methods.

### Force 2: CMS-HCC V28 risk-adjustment compression

The CMS Hierarchical Condition Category (HCC) model — used to risk-adjust MA payments — moved to V28 at 100% blend in 2026. V28 reduces overall risk scores, compressing plan margins. Plans are forced to recover margin through **quality (Stars)** rather than coding intensity, which makes care-gap closure even more important.

### Force 3: CMS programs following the same path

CMS is moving its own quality programs to FHIR-based digital measures:
- MIPS (Merit-Based Incentive Payment System)
- Hospital Inpatient/Outpatient Quality Reporting
- MSSP ACOs (Medicare Shared Savings Program)
- Promoting Interoperability

All of them are converging on FHIR + CQL + MeasureReport as the canonical reporting stack.

---

## 3. How quality measures actually work

A quality measure is a fraction with people in it. It asks: *of the people who SHOULD have gotten care X, what percentage actually got it?*

### Worked example: BCS-E (Breast Cancer Screening)

- **Denominator:** women aged 50–74 enrolled in the plan during the measurement year.
- **Numerator:** of those women, how many actually got a mammogram in the last 27 months.
- **Score:** numerator ÷ denominator = % of eligible women who got their mammogram.

Score of 70% means 70% of eligible women got screened. That number flows into HEDIS reporting, which flows into Star Ratings, which flows into revenue.

### The standard five populations (for proportion measures)

Real-world measurement needs more nuance than a simple fraction. The full set:

| Population | Purpose |
|---|---|
| **Initial Population (IPP)** | Broadest pool — everyone who could theoretically be measured (e.g., all women 50–74). |
| **Denominator** | Usually equal to IPP for simple measures, narrower for complex ones. |
| **Denominator Exclusions** | People *removed* from the denominator entirely. Example: women who had a bilateral mastectomy — can't get a mammogram, would be unfair to count against the plan. |
| **Denominator Exceptions** | Softer removal for clinical reasons or documented refusal. |
| **Numerator** | The subset of the denominator who actually got the care. |

### What a member's evaluation looks like

For each patient, the CQL engine produces five booleans:

| Population | Mrs. Smith, age 62 |
|---|---|
| Initial Population? | true (she's a woman, 50–74) |
| Denominator? | true |
| Denominator Exclusions? | false (no mastectomy) |
| Denominator Exceptions? | false |
| Numerator? | true (mammogram on 2025-03-14) |

Aggregate across thousands of members → counts in each population → score → packaged into a FHIR `MeasureReport` resource.

---

## 4. CQL — Clinical Quality Language

CQL is the language used to specify quality measures. Understanding what it *is* and *isn't* is the single most important conceptual step.

### What CQL is

- A **declarative**, **read-only** rule language for clinical logic over FHIR data.
- An **HL7 standard**, alongside FHIR.
- Closer in spirit to **SQL** than to Python or .NET.
- Purpose-built for clinical concepts: value sets, terminology codes, temporal intervals, age calculations, populations are all first-class citizens.
- Compiled to **ELM** (Expression Logic Model), which is what engines actually execute.

### What CQL is NOT

- **Not a CRUD language.** No INSERT, UPDATE, or DELETE. Anywhere.
- **Not a general-purpose programming language.** You can't build an application in it.
- **Not for writing to FHIR data.** It only *reads*.

### Tiny code example: BCS-E

```cql
library BCS_E version '1.0.0'
using FHIR version '4.0.1'

valueset "Mammography": 'http://...mammography-vs'
valueset "Bilateral Mastectomy": 'http://...mastectomy-vs'

parameter "Measurement Period" Interval<DateTime>
  default Interval[@2026-01-01, @2027-01-01)

context Patient

define "Initial Population":
  AgeInYearsAt(start of "Measurement Period") between 50 and 74
    and Patient.gender = 'female'

define "Numerator":
  exists (
    [Procedure: "Mammography"] M
      where M.performed during Interval[
        start of "Measurement Period" - 27 months,
        end of "Measurement Period"]
  )

define "Denominator Exclusions":
  exists ([Procedure: "Bilateral Mastectomy"])
```

That's nearly the entire BCS-E rule. Five named populations, each defined declaratively over FHIR resources. No writes anywhere.

### Who writes CQL? (Hint: not you)

This trips many practitioners up. **You are a consumer of CQL files, not an author.**

- **HEDIS measures:** authored by NCQA's measure development team (clinicians + biostatisticians + CQL-trained informaticists).
- **CMS eCQMs:** authored by measure stewards under contract with CMS (Mathematica, The Joint Commission, etc.).
- Each measure takes 12–24 months of design, public comment, and testing before publication.

Your job as a builder is to *download* the published CQL files, run them, and process results. You'd only write CQL if you were inventing a brand-new measure — a specialist activity outside the scope of this build.

### Open-source CQL engines

- **HL7 reference engine** (Java) — `cql-engine`
- **cqf-ruler** — FHIR server with CQL execution built in
- **cql-engine-py** — Python port (less mature than Java)
- **IBM FHIR Server** — has CQL support

Pick one, don't reinvent.

---

## 5. The architecture — how it all connects

```
   ┌──────────────────┐      ┌──────────────────┐
   │  NCQA CQL rule   │      │  Plan's FHIR data│
   │  BCS_E.cql       │      │  Patients,       │
   │  (published      │      │  Procedures,     │
   │   yearly)        │      │  Encounters...   │
   └────────┬─────────┘      └────────┬─────────┘
            │                         │
            ▼                         ▼
        ┌──────────────────────────────────┐
        │           CQL engine              │
        │  Reads FHIR data, evaluates rules │
        └────────────────┬──────────────────┘
                         │
                         ▼
        ┌──────────────────────────────────┐
        │         FHIR MeasureReport        │
        │  Population counts + per-patient  │
        │  flags                            │
        └────────────────┬──────────────────┘
                         │
                         ▼
        ┌──────────────────────────────────┐
        │         Downstream uses           │
        │ Care gap UI · NCQA submission ·   │
        │ Stars projection · Dashboards     │
        └──────────────────────────────────┘
```

### How the engine connects to FHIR (the mechanics)

A CQL engine has a **data provider plugin** — typically a FHIR data provider — that knows how to fetch FHIR resources from a FHIR server (HAPI, Azure FHIR, AWS HealthLake, your own implementation, whatever).

When CQL says `[Procedure: "Mammography"]`, the engine translates that into a FHIR query like:

```
GET /Procedure?code=in:mammography-vs
```

The FHIR server returns matching resources as JSON. The engine then evaluates the rest of the rule (date filters, value comparisons, age calculations) against those resources.

### What "evaluating each population" actually means

For each patient in scope, the engine runs the rule expressions once per named population and returns the five booleans shown earlier. Then it aggregates across all patients to produce population counts and a measure score, packaged as a FHIR `MeasureReport` resource.

### What happens downstream

The `MeasureReport` flows into:

- **Care-gap UI** — "show me every member where Denominator=true and Numerator=false → these need outreach"
- **NCQA submission** — aggregate counts sent via ECDS for HEDIS reporting
- **Stars projection model** — "if we close X gaps by year-end, our Star rating moves from 3.5 to 4.0"
- **Internal dashboards** — real-time quality monitoring

### The architectural revolution

**Before (old world):** NCQA published PDF documents describing measures in English prose. Each vendor read the PDF, interpreted it, wrote custom code in their own platform. Subtle interpretation differences meant two vendors computing "the same" measure got different answers. Bugs everywhere. Audits painful.

**After (new world):** NCQA publishes the actual CQL file. Every conforming engine runs the exact same machine-executable code. Consistency, auditability, transparency. NCQA fixes a bug → patches the CQL → everyone gets the fix on next download.

The shift from *human-interpreted specifications* to *machine-executable artifacts* is the real revolution. FHIR + CQL is the standards stack that makes it possible.

---

## 6. Population types and measure variations

### Population names are standardized

The full vocabulary across all quality measures (defined by HL7 CQL/QI-Core, not by NCQA):

- Initial Population (IPP)
- Denominator
- Denominator Exclusions
- Denominator Exceptions
- Numerator
- Numerator Exclusions
- Measure Population (continuous variable measures only)
- Measure Observation (the calculated value)
- Stratifier (sub-cohort breakdowns — age, gender, race/ethnicity)

These names are the same across every HEDIS measure and every CMS eCQM.

### Measure types determine which populations are used

| Measure type | Populations used | Example | Question answered |
|---|---|---|---|
| **Proportion** (most common) | IPP, Denom, Denom Exclusions, Denom Exceptions, Numerator | BCS-E, CBP-E, HBD-E | % of eligible patients who got the care |
| **Ratio** | IPP, Denom, Numerator | Infections per 1000 catheter-days | Rate per unit |
| **Continuous variable** | IPP, Measure Population, Measure Population Exclusions + Observation | Median ED arrival-to-discharge time | Typical value of a number |
| **Cohort** | IPP only | Population identification for downstream workflows | Who's in this group |

### Same structure, different contents (BCS-E vs HBD-E)

HBD-E (Hemoglobin A1c Control for Patients with Diabetes) is a proportion measure, so it uses the **same five population types** as BCS-E. The structure is identical. What changes is what *fills* each population:

| Population | BCS-E | HBD-E |
|---|---|---|
| IPP | Women aged 50–74 | Patients aged 18–75 with diabetes diagnosis |
| Numerator | Had a mammogram in last 27 months | Most recent HbA1c < 8.0% during measurement year |

So when you load HBD-E.cql into the engine, every clinical detail differs but no new concept is introduced. **One engine handles them all.**

### Who decides the contents?

- HEDIS measures: NCQA's measure development team.
- CMS eCQMs: contracted measure stewards.
- Public comment and testing periods before final publication.

---

## 7. eCQM vs HEDIS dQM — the same machinery, different doors

Three closely related terms cause confusion:

- **eCQM (Electronic Clinical Quality Measure)** — CMS's term for digital quality measures used in CMS programs (MIPS, hospital quality, MSSP ACOs, Promoting Interoperability).
- **HEDIS dQM (Digital Quality Measure)** — NCQA's term for digital measures used in HEDIS reporting → Star Ratings.
- **Quality measure** — the generic concept.

### The comparison

|   | eCQM (FHIR flavor) | HEDIS dQM |
|---|---|---|
| Published by | CMS / measure stewards | NCQA |
| Submitted to | CMS programs | NCQA via ECDS |
| Used for | MIPS, hospital quality, MSSP ACO | Stars, plan accreditation |
| FHIR IG | QI-Core (transitioning to US Core) | Leans US Core |
| Underlying language | CQL | CQL |

### The key insight

**Mechanically, FHIR-based eCQMs and HEDIS dQMs are the same thing:** CQL library + value sets + Measure resource → CQL engine → MeasureReport. The differences are administrative (who publishes, who consumes).

**One engine serves both markets.** Load NCQA's CQL libraries → submit to NCQA. Load CMS's CQL libraries → submit to CMS programs. Same code path.

### Why this matters for TAM

| Market segment | Reporting target | Scale |
|---|---|---|
| Medicare Advantage plans | HEDIS / Stars | $500B market |
| Hospitals (IQR/OQR) | CMS eCQMs | ~5,000 US hospitals |
| MIPS-participating clinicians | CMS eCQMs | Hundreds of thousands |
| MSSP ACOs | CMS eCQMs | 480+ ACOs, 10M+ beneficiaries |
| Commercial ACO contracts | HEDIS-aligned | Hundreds of contracts |
| FQHCs | UDS reporting (HRSA) | ~1,400 health centers |

### Historical wrinkle to flag

"eCQM" predates the FHIR transition. Older eCQMs use **QDM** (Quality Data Model) and submit as **QRDA** XML documents. CMS is migrating to FHIR-based formats, but not all measures are FHIR-flavored yet. **Your engine should be FHIR-first** and explicit about that: "supports FHIR-based eCQMs and HEDIS dQMs; QDM-based legacy eCQMs out of scope." Honest, defensible scope.

---

## 8. The recommended build

**Project name (working):** `phm-dqm-engine` — final name your choice.

**One-line description:** Open-source FHIR-native digital quality measurement engine with an AI-powered care-gap closure layer, exposed via MCP.

### Architecture layers

```
┌─────────────────────────────────────────────────────────────┐
│  Data Ingest Layer                                          │
│  - FHIR R4 / US Core 6.x bulk import ($export, $import)     │
│  - Claims ingestion (CARIN BB / X12 EDI → FHIR)             │
│  - Optional: HL7 v2 ADT feeds for real-time triggers        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  Normalization & Provenance                                 │
│  - US Core conformance validation                           │
│  - Terminology normalization (LOINC/SNOMED/RxNorm/ICD-10)   │
│  - Provenance resources for every transformation            │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  dQM Execution Engine (the differentiator)                  │
│  - CQL engine running NCQA / CMS published rules            │
│  - Measure calculation → MeasureReport resources            │
│  - Cohort identification (Group resources)                  │
│  - Open care-gap detection per member per measure           │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  AI Care-Gap Layer (legitimate, audited AI use)             │
│  - LLM agent: extract structured evidence from notes        │
│    (e.g., "last colonoscopy 2023" in narrative → FHIR Obs)  │
│  - Explain WHY a gap is open with citations to resources    │
│  - Personalized outreach draft generation (FHIR Comm)       │
│  - SDOH-tiered prioritization (Gravity Project value sets)  │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  MCP Server + Dashboard                                     │
│  - Care managers query in natural language                  │
│  - ACO/plan dashboards: gap rate, projected Stars impact    │
│  - FHIR-native API for downstream EHR write-back            │
└─────────────────────────────────────────────────────────────┘
```

### Where AI is genuinely legitimate (not lipstick)

1. **Unstructured-to-structured extraction with provenance.** A diabetic member's last A1C may be buried in a free-text note. LLM extracts it, writes a FHIR `Observation` with a `Provenance` resource pointing back to the source note and a confidence score. Human reviewer can audit.
2. **Explainable gap reasoning.** Not "Gap: BPD-E open" — instead "Last BP 142/91 on 2025-09-12, threshold <140/90, two missed appointments → outreach prioritized."
3. **Care-manager copilot via MCP.** "Show me my diabetic members with open A1C gaps in food-insecure ZIP codes." Human picks who to contact.
4. **Outreach draft generation.** Personalized SMS/email/IVR scripts at the right reading level, human-approved before send.

**What we do NOT do:** autonomous clinical decision-making, automated coding without human review, anything that touches RADV-audit territory without explicit human sign-off. Risk-adjustment auditing is a snake pit; quality measurement is not.

### Why this maps to Parag's existing repos

| Existing repo | Role in new project |
|---|---|
| `fhir-mcp-suite` | MCP + FHIR query foundation; new `dqm-server` sibling module |
| `fhir-mapping--agent` | Direct reuse as the LLM extraction layer |
| `healthcare-graphql-api` | Dashboard read API |
| `python-healthcare-api-microservices` | Ingest/normalization skeleton |
| `TEFCA-Knowledge` | Provenance and data-exchange narrative |
| `bodhi_app` (BODHI) | Optional v2.0 — quality knowledge graph linking measures → conditions → interventions |

---

## 9. Build plan and go-to-market

### 16-week build plan (solo, AI-augmented)

| Weeks | Phase | Deliverables |
|---|---|---|
| 1–3 | Foundation | FHIR Bulk Data ingest + US Core validator, reusing `python-healthcare-api-microservices` skeleton |
| 4–6 | CQL engine integration | Wire up `cql-engine` (Java) or Python port; run BCS-E, CBP-E, HBD-E end-to-end |
| 7–9 | AI extraction agent | Extend `fhir-mapping--agent` for HEDIS-relevant extraction with mandatory Provenance |
| 10–12 | MCP server | New module in `fhir-mcp-suite`: `compute-measure`, `list-open-gaps`, `explain-gap`, `draft-outreach` |
| 13–14 | Stars projection model | Deterministic translation from gap-closure rate → projected Star cut points |
| 15–16 | Reference dashboard | Lightweight React/HotChocolate UI; Synthea-generated demo dataset |

### Who buys this

**Open-source distribution (Apache-2.0) + commercial dual-license / support model.**

Realistic adopter list:

- **Regional Medicare Advantage plans** (sub-$5B revenue) priced out of Innovaccer/Arcadia/Lightbeam
- **ACOs and MSSP/REACH participants** — 900+ FQHCs/RHCs/CAHs in ACO REACH alone
- **FQHCs** for UDS reporting (HRSA mandates similar measures)
- **HIEs and TEFCA QHINs** building value-added services
- **Health-tech startups** needing a quality layer they can't build from scratch
- **Hospital systems** reporting CMS IQR/OQR

### Monetization paths

1. **Open-core.** OSS engine free; commercial connectors (Epic, Cerner, Athena), audit-defensible AI extraction with SLAs, managed deployment as a paid tier.
2. **Consulting / implementation services** for plans on the dQM transition — $200K–$500K engagements are standard.
3. **Strategic acquisition target.** Quality-measure tooling has been acquired by Optum, Wolters Kluwer, Cotiviti, Inovalon. An OSS reference implementation with traction is a credible exit narrative.
4. **Government / public health.** CDC PHDS 2026 milestones explicitly call for automated FHIR-based reporting; a hardened CQL+FHIR engine aligns.

### Risks and mitigations

| Risk | Mitigation |
|---|---|
| CQL engine complexity | Don't write from scratch — integrate existing reference implementations |
| Conformance testing burden | Use NCQA's Digital Quality Measure Evaluation Package as CI test bed |
| AI hallucination on extraction | Mandatory provenance + confidence scores + human-in-the-loop gating |
| Vendor pushback | Stay in the open-source-good-citizen lane; target the underserved mid-market |
| Certification for official submission | Frame as "computes the same results, not formally certified" — adopters can pursue certification themselves |

### The 30-second pitch

> Every US Medicare Advantage plan, ACO, and FQHC must, by 2029, migrate quality reporting from manual chart abstraction to FHIR-native digital quality measures. The dollar value is enormous — a single Star Rating notch is worth 13–17% of plan revenue, and the MA market is $500B. Existing tooling is proprietary, expensive, and bolted onto warehouses. We are shipping the open-source FHIR-native dQM engine with an AI care-gap layer — built by a healthcare-interoperability practitioner who has been shipping FHIR + MCP + LLM-agent code in the open since 2024.

---

## 10. Glossary of every acronym used

| Acronym | Full form | One-line meaning |
|---|---|---|
| **ACCESS** | Ambulatory Specialty Care Access for Seniors | New CMS payment model launching July 5, 2026; 50% withhold tied to outcomes |
| **ACO** | Accountable Care Organization | Group of providers jointly responsible for cost and quality of a population |
| **ACO REACH** | Realizing Equity, Access, and Community Health | Advanced ACO model in Medicare |
| **ADT** | Admission, Discharge, Transfer | Real-time hospital event feed |
| **BCS-E** | Breast Cancer Screening – ECDS | HEDIS measure for mammogram screening |
| **BPD-E** | Blood Pressure control for patients with Diabetes – ECDS | HEDIS measure |
| **CARIN BB** | CARIN Blue Button | FHIR implementation guide for claims data |
| **CBP-E** | Controlling High Blood Pressure – ECDS | HEDIS measure |
| **CDC PHDS** | Public Health Data Strategy | CDC's roadmap for FHIR-based public health reporting |
| **CMS** | Centers for Medicare & Medicaid Services | US federal agency running Medicare and Medicaid |
| **CMS-0057** | Interoperability and Prior Authorization Final Rule | CMS rule mandating FHIR APIs for prior auth |
| **CQL** | Clinical Quality Language | HL7 standard for expressing clinical logic — read-only, declarative |
| **dQM** | Digital Quality Measure | NCQA's term for FHIR + CQL HEDIS measures |
| **ECDS** | Electronic Clinical Data Systems | NCQA's reporting domain for digital HEDIS measures |
| **eCQM** | Electronic Clinical Quality Measure | CMS's term for digital quality measures in CMS programs |
| **EHR** | Electronic Health Record | Provider-side clinical record system |
| **ELM** | Expression Logic Model | What CQL compiles to for execution |
| **ETL** | Extract, Transform, Load | Traditional data-pipeline pattern |
| **FHIR** | Fast Healthcare Interoperability Resources | Modern HL7 standard for representing healthcare data |
| **FQHC** | Federally Qualified Health Center | Community health center serving underserved areas |
| **GAD-7** | Generalized Anxiety Disorder 7-item scale | PROM for anxiety severity |
| **Gravity Project** | (not an acronym) | HL7 accelerator standardizing SDOH data |
| **HbA1c / A1C** | Hemoglobin A1c | Blood test reflecting 2–3 month average blood sugar |
| **HBD-E** | Hemoglobin A1c Control for Patients with Diabetes – ECDS | HEDIS measure |
| **HCC** | Hierarchical Condition Category | Risk-adjustment categorization used by CMS |
| **HCC V28** | Version 28 of the HCC model | Current Medicare risk-adjustment model |
| **HEDIS** | Healthcare Effectiveness Data and Information Set | The dominant US health-plan quality measure set, owned by NCQA |
| **HIE** | Health Information Exchange | Regional network for sharing patient data |
| **HL7** | Health Level Seven | Standards-development organization for healthcare interoperability |
| **HRSA** | Health Resources and Services Administration | US agency overseeing FQHCs and UDS reporting |
| **HTI-1** | Health Data, Technology, and Interoperability final rule | ONC rule expanding FHIR-based data classes |
| **ICD-10-CM** | International Classification of Diseases, 10th Revision, Clinical Modification | Diagnosis coding system |
| **IDSP** | Integrated Disease Surveillance Programme | India's disease surveillance system |
| **IG** | Implementation Guide | FHIR profile package specifying how to use FHIR for a use case |
| **IHIP** | Integrated Health Information Platform | India's health-data platform |
| **IPP** | Initial Population | The broadest pool of patients in a quality measure |
| **IQR / OQR** | Inpatient / Outpatient Quality Reporting | CMS hospital quality programs |
| **LOINC** | Logical Observation Identifiers Names and Codes | Coding system for lab and clinical observations |
| **MA** | Medicare Advantage | Private insurance plans administering Medicare benefits |
| **MCP** | Model Context Protocol | Standard for connecting LLMs to external tools and data |
| **MIPS** | Merit-Based Incentive Payment System | CMS quality program for physicians |
| **MONAI** | Medical Open Network for AI | PyTorch-based framework for medical imaging AI |
| **MSSP** | Medicare Shared Savings Program | CMS ACO program |
| **MY** | Measurement Year | The 12-month period a quality measure covers |
| **NCQA** | National Committee for Quality Assurance | Non-profit that owns HEDIS and accredits health plans |
| **ONC** | Office of the National Coordinator for Health Information Technology | US federal office overseeing health IT standards |
| **PHM** | Population Health Management | Managing health outcomes across a defined population |
| **PHQ-9** | Patient Health Questionnaire 9-item | PROM for depression severity |
| **PROM** | Patient-Reported Outcome Measure | Standardized questionnaires completed by patients |
| **QBP** | Quality Bonus Payment | Bonus revenue CMS pays MA plans rated 4+ stars |
| **QDM** | Quality Data Model | Older data model used by eCQMs before FHIR transition |
| **QHIN** | Qualified Health Information Network | TEFCA-designated network for nationwide data exchange |
| **QI-Core** | Quality Improvement Core | FHIR IG used by CQL-based eCQMs |
| **QRDA** | Quality Reporting Document Architecture | XML format used to submit older eCQMs |
| **RADV** | Risk Adjustment Data Validation | CMS audit program for risk-adjustment accuracy |
| **RAF** | Risk Adjustment Factor | Numeric score representing a member's expected cost |
| **RPM** | Remote Patient Monitoring | Device-based monitoring outside clinical settings |
| **RxNorm** | (not an acronym, a brand name) | Standardized drug nomenclature from NIH |
| **SDOH / SDoH** | Social Determinants of Health | Non-clinical factors influencing health outcomes |
| **SMART-on-FHIR** | (not an acronym) | Standard for FHIR-based apps with OAuth-based access |
| **SNOMED CT** | Systematized Nomenclature of Medicine — Clinical Terms | Comprehensive clinical terminology system |
| **TAM** | Total Addressable Market | Total revenue opportunity for a product |
| **TEFCA** | Trusted Exchange Framework and Common Agreement | US national framework for health data exchange |
| **UDS** | Uniform Data System | HRSA's reporting system for FQHCs |
| **US Core** | (not an acronym, just a name) | The baseline FHIR IG for US healthcare data |
| **X12 EDI** | (X12 is the standards body; EDI = Electronic Data Interchange) | Standard format for US claims and benefits transactions |

---

*End of knowledge base. Generated from working sessions on May 21, 2026.*

# Strategic Recommendation: A Build Target in US Population Health for 2026 and Beyond

**For:** Parag Medsinge
**Project:** `fhir-dqm-engine` — codename **Pramana** (Sanskrit प्रमाण, "valid means of knowledge")
**Repo:** https://github.com/pcmedsinge/fhir-dqm-engine
**Date:** May 21, 2026 (revised)
**Bottom line:** Build an **open-source FHIR-native Digital Quality Measure (dQM) execution engine with an AI-powered care-gap closure layer**, exposed via MCP. This is the single highest-value, lowest-competition, regulatorily-forced play in US population health right now.

---

## 1. The pain point, in dollars

US population health revenue is dominated by one feedback loop: **quality measures → Medicare Advantage Star Ratings → Quality Bonus Payments (QBP) and rebates**.

- The Medicare Advantage market is approximately **$500B**.
- A move from a **3.0-Star plan to a 4.0-Star plan increases revenue by 13.4–17.6%** through QBP and enrollment effects.
- A single-star **decline** at a major payer has been disclosed publicly as **>$1B in lost revenue** (Humana, 2024–2025).
- **HEDIS measures are the upstream lever** for Stars — and 90%+ of US health plans report HEDIS.

The plumbing under all of this is shifting hard:

- **NCQA is forcing the HEDIS transition to Digital Quality Measures (dQMs)** specified in **FHIR + CQL** via the **ECDS** reporting domain.
- As of **MY 2026, 25 measures are specified under ECDS**; only 8 hybrid measures remained as of MY 2025.
- **NCQA has set MY 2029 as the endpoint** for retiring hybrid abstraction; by 2030 effectively all HEDIS reporting is digital.
- CMS is following: MIPS, Hospital Outpatient and Inpatient Quality Reporting all moving to dQMs.
- CMS-HCC **V28 is now at 100% blend in 2026**, compressing risk-adjusted revenue and forcing plans to recover margin through quality (Stars) rather than coding intensity.

**Translation:** Every MA plan, ACO, FQHC, and value-based provider group in the US must, between now and 2029, move from manual chart abstraction to a FHIR-native, CQL-executed, AI-augmented quality and care-gap stack. **They mostly don't have one.**

---

## 2. Why this beats the other 2026 PHM plays

| Option | Demand | Dollar value | Open-source whitespace | Fits your stack | Verdict |
|---|---|---|---|---|---|
| CMS ACCESS Model PROM pipeline | High | Medium (narrow tracks) | Medium | High | Good, but narrow TAM |
| HCC V28 risk-adjustment NLP | Very High | Very High | **Low** (Navina, Reveleer, MedInsight, Inferscience dominate) | High | Crowded; high barrier to entry |
| Prior Authorization automation (CMS-0057) | High | High | Low (Da Vinci PAS IG + Epic/Availity locked in) | Medium | Too commoditized |
| SDOH extraction agent | Medium | Medium | Medium | High | Better as a *feature* than a product |
| **FHIR dQM engine + AI care-gap closure** | **Very High** | **Very High** | **High** | **Very High** | **Recommended** |

The dQM space combines *forced* demand, *huge* dollar value, *thin* open-source tooling, and *direct* alignment with what you've already built (`fhir-mcp-suite`, `fhir-mapping--agent`, `healthcare-graphql-api`, BODHI). Most vendors here sell black-box SaaS at enterprise prices; nobody has shipped a credible OSS reference implementation that an ACO IT team or a regional plan can pick up.

---

## 3. The build: architecture and AI scope

### Core architecture (five layers)

```
┌─────────────────────────────────────────────────────────────┐
│  Data Ingest                                                │
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
│  - CQL engine running NCQA HEDIS dQMs + CMS FHIR eCQMs      │
│  - Measure calculation → FHIR MeasureReport resources       │
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

1. **Unstructured-to-structured extraction with provenance.** A diabetic member's last A1C may be in a free-text note, not as an Observation. LLM extracts it, writes a FHIR Observation with `Provenance` pointing to the source note and a confidence score. Human reviewer can audit.
2. **Explainable gap reasoning.** Instead of "Gap: BPD-E open," show "Member's last BP reading was 142/91 on 2025-09-12, threshold for BPD-E is <140/90; member has 2 missed appointments — outreach prioritized." Citations to FHIR resources mandatory.
3. **Care-manager copilot via MCP.** "Show me all my diabetic members with open A1C gaps, ZIP codes flagged as food-insecure, no provider visit in 90 days." A human still picks who to call.
4. **Outreach draft generation.** Personalized SMS/email/IVR scripts with reading level matched to the member, *human-approved before send*.

What we **do not** do: autonomous clinical decision-making, automated coding without human review, anything that touches RADV-audit territory without explicit human sign-off. Risk-adjustment auditing is a snake pit; quality measurement is not.

### Licensing reality check

**The engine code is Apache-2.0. The NCQA dQM measure files themselves are commercial products** sold through the NCQA Store and cannot be redistributed in the repo. The architectural split:

- **Engine + tooling:** open-source, Apache-2.0, lives in this repo
- **Test measures for development:** public-domain CMS eCQM samples + Synthea-generated patient data, both shippable in the repo
- **Production measures:** customers bring their own licensed NCQA HEDIS dQM files; our engine executes them
- **CQL language specification:** open HL7 standard

This is the same legal pattern Reveleer, Innovaccer, and Arcadia operate under. Clean.

---

## 4. Development approach: stack, phases, timeline

### Stack lock-in for v0.1

- **Language:** TypeScript 5.x
- **Runtime:** Node.js 20 LTS
- **Framework:** NestJS (closest analog to ASP.NET Core architecture; familiar from your .NET background)
- **CQL engine:** `cql-execution` + `cql-exec-fhir` — these are NCQA's *own* reference engines, the ones they use to test their measures. Using them gives free correctness validation.
- **Package manager:** pnpm
- **Test data:** Synthea (synthetic FHIR patients) + public CMS eCQM samples
- **FHIR storage:** HAPI FHIR JPA server (Dockerized for local dev; pluggable for production)
- **Build/CI:** GitHub Actions
- **Containerization:** Docker + docker-compose for local stack

**On the Java vs JavaScript engine choice.** The HL7 reference engine in Java (`clinical_quality_language`) is mature and widely used. But NCQA themselves use the JS engines listed above to test their measures. Matching their engine pairing means measures NCQA certified pass our engine bit-identically — a free conformance check we wouldn't get on the Java path.

### Seven phases, each demoable

| Phase | Duration | Demoable artifact |
|---|---|---|
| **P1 — Scaffold** | ~1 week | TS/Nest project initialized, CI green, Docker builds |
| **P2 — Test data + FHIR store** | ~2 weeks | Synthea patients loaded into local HAPI; queryable via FHIR REST |
| **P3 — First CQL measure** ⭐ | ~3 weeks | One measure runs end-to-end → prints a FHIR MeasureReport (v0.1) |
| **P4 — Multiple measures + care gaps** | ~2 weeks | Three measures running; per-patient gap list |
| **P5 — AI extraction layer** | ~3 weeks | LLM agent extracts FHIR Observations from notes with Provenance |
| **P6 — MCP server** | ~2 weeks | Conversational interface for care managers |
| **P7 — Stars projection + dashboard** | ~3 weeks | Public demo: gap closure → projected Star Rating movement |

**Timeline reality:** 16 weeks if dedicated full-time; **22–26 weeks for an evening-and-weekend builder with a day job**. P3 is the hinge — that's where there's a real engine running real measures end-to-end. Everything else compounds on it.

### How the build actually happens

1. **Claude Code in plan mode** for each phase: discuss design, generate plan, then execute.
2. **Phase commits** push to GitHub at the end of each phase.
3. **Optional LinkedIn updates** at each milestone — these are the "learning in public" follow-ups to the CQL post.
4. **Documentation as a first-class output** — every phase adds to `docs/`, not "I'll write it later."
5. **One pair-down decision per phase:** if scope expands, cut something else from this phase to the next. Better to ship Phase 3 narrow than to slip it.

---

## 5. Why you specifically can win this

Lining up your existing repos against the architecture:

- **`fhir-mcp-suite`** → patterns reusable for the dQM MCP server (P6)
- **`fhir-mapping--agent`** → blueprint for the AI extraction layer (P5)
- **`healthcare-graphql-api`** → reference for API patterns in the dashboard (P7)
- **`python-healthcare-api-microservices`** → architectural patterns (clean architecture, microservices) — code is Python but patterns transfer to NestJS cleanly
- **`TEFCA-Knowledge`** → provenance/data-exchange narrative for README and talks
- **BODHI / KG work** → optional v2.0 enhancement: quality knowledge graph linking measures → conditions → interventions → outcomes

You are one of the small number of practitioners worldwide with FHIR depth, LLM-agent experience, MCP server experience, and production engineering across .NET + Python + TypeScript — *and* shipping in the open. That overlap is the moat.

---

## 6. Who buys this, and how it generates dollar value

**Open-source distribution (Apache-2.0) + commercial dual-license / support model**, similar to how Linear or Inferscience play it. Realistic adopter list:

- **Regional Medicare Advantage plans** (sub-$5B revenue) priced out of Innovaccer/Arcadia/Lightbeam — your direct sweet spot.
- **ACOs and MSSP/REACH participants** — 900+ FQHCs/RHCs/CAHs are in ACO REACH alone.
- **FQHCs** for UDS reporting (HRSA mandates a similar measure stack).
- **HIEs and TEFCA QHINs** building value-added services on top of network data.
- **Health-tech startups** who need a quality layer but can't build it from scratch.

**Monetization paths (pick one or stack):**

1. **Open-core.** OSS engine free; commercial connectors (Epic, Cerner, Athena), audit-defensible AI extraction with SLAs, managed deployment as a paid tier.
2. **Consulting / implementation services** for plans on the dQM transition — $200K–$500K engagements are standard.
3. **Strategic acquisition target.** Quality-measure tooling vendors have been acquired by Optum, Wolters Kluwer, Cotiviti, and Inovalon. An OSS reference implementation with traction is a credible exit narrative.
4. **Government / public health.** CDC PHDS milestones for 2026 explicitly call for automated FHIR-based reporting; a hardened CQL+FHIR engine aligns.

---

## 7. Risks and how to handle them

- **CQL is heavy.** Don't write a CQL engine from scratch; integrate `cql-execution` + `cql-exec-fhir` directly.
- **Conformance testing.** Use **NCQA dQM packages from the NCQA Store** (for production users) and **public CMS eCQM samples + Synthea** (for development CI) as your test bed.
- **AI hallucination risk on extraction.** Mandatory Provenance + confidence scores + human-in-the-loop gating before any write. Make this visible in the UI; turn it into a trust feature.
- **Vendor pushback.** Stay in the open-source-good-citizen lane; do not poke incumbents. Your audience is the underserved mid-market, not the F100 plans they already own.
- **Scope creep on a day-job timeline.** One pair-down per phase: if scope expands, cut something else from this phase to the next. Better to ship narrow than to slip.
- **Solo-developer burnout.** P3 is the hinge — once it works, momentum carries. Resist any temptation to perfect P1/P2 at the expense of getting to P3.

---

## 8. The 30-second pitch

> Every US Medicare Advantage plan, ACO, and FQHC must, by 2029, migrate quality reporting from manual chart abstraction to FHIR-native digital quality measures. The dollar value is enormous — a single Star Rating notch is worth 13–17% of plan revenue, and the MA market is $500B. Existing tooling is proprietary, expensive, and bolted onto warehouses. We are shipping the open-source FHIR-native dQM engine with an AI care-gap layer — built by a healthcare-interoperability practitioner who has been shipping FHIR + MCP + LLM-agent code in the open since 2024.

That's a product story. It also happens to be true.

---

*Sources consulted: NCQA HEDIS/ECDS publications (2025–2026), CMS ACCESS Model guidance and ArentFox Schiff analysis (Feb 2026), Healthcare Dive on 2026 MA Star Ratings (Oct 2025–Apr 2026), Synsormed and HealthScape Advisors on Stars financial impact, Reveleer and MedInsight on dQM transition and V28, JMIR Med Inform 2026 on LLM-based SDoH extraction, CDC Public Health Data Strategy 2026 milestones, NCQA Digital Quality Measures resource page (verified May 2026).*

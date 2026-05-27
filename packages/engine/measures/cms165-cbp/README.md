# CMS165 — Controlling High Blood Pressure (CBP)

**FHIR measure ID:** `ControllingHighBloodPressureFHIR`  
**Version:** 0.1.000  
**Source:** [cqframework/ecqm-content-qicore-2024](https://github.com/cqframework/ecqm-content-qicore-2024)  
**Commit:** `main` branch (retrieved 2026-05-27)  
**HEDIS equivalent:** CBP — Controlling Blood Pressure

## What this measure does

Calculates the percentage of patients 18–85 years old with a diagnosis of essential hypertension
whose most recent blood pressure (BP) reading is adequately controlled:

- **Systolic BP < 140 mmHg AND Diastolic BP < 90 mmHg**

## Populations

| Population               | Description                                                                      |
| ------------------------ | -------------------------------------------------------------------------------- |
| Initial Population (IPP) | Patients 18–85 with a qualifying encounter + essential hypertension diagnosis    |
| Denominator              | Same as IPP minus exclusions (ESRD, pregnancy, hospice, frailty, etc.)           |
| Denominator Exclusions   | Kidney disease, hospice, advanced illness + frailty, pregnancy, dialysis         |
| Numerator                | Most recent BP reading < 140/90 during or 6 months before the measurement period |

## Directory layout

```
cms165-cbp/
├── Measure-ControllingHighBloodPressureFHIR.json   # FHIR Measure resource
├── cql/                                            # Human-readable CQL source (10 files)
│   └── ControllingHighBloodPressureFHIR.cql        # Main measure logic
├── elm/                                            # Pre-compiled ELM JSON (10 files)
│   └── ControllingHighBloodPressureFHIR.json       # Main measure ELM
├── libraries/                                      # FHIR Library resources (with base64 ELM)
│   └── Library-*.json
└── value-sets/
    ├── valueSets.json                              # cql-execution format: { OID: [{code,system,...}] }
    └── *.json                                      # Individual FHIR ValueSet resources
```

## ELM compilation

ELM is **pre-compiled** from source. The engine loads `elm/*.json` directly — no CQL→ELM
compilation step at runtime. To recompile (e.g., after editing CQL):

```bash
# Run cql-translator-service as an ad-hoc Docker container
docker run -p 8081:8080 cqframework/cql-translation-service:latest
# Then POST each .cql file to http://localhost:8081/translator/cql and save the response
```

## Key implementation notes

- The measure uses `["observation-bp"]` QICore profile retrieval for BP readings.
  Synthea generates LOINC `85354-9` (Blood pressure panel) with components `8480-6` (systolic)
  and `8462-4` (diastolic). The `FhirDataSourceAdapter` retrieves by code `85354-9` and maps to
  the QICore profile shape so the CQL component extraction works.
- Essential hypertension: SNOMED `59621000` is in the `EssentialHypertension` value set.
- Synthea data confirmed: 68 hypertensive patients, 3,908 BP observations (as of seed 20250523).

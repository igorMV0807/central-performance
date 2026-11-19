# Portfolio case — Central de Performance

## One-line summary

A secure operations dashboard that transforms payment-recovery events into actionable metrics, traceable customer journeys, and quality alerts.

## The problem

Automation workflows can process many events without giving operators a clear answer to three basic questions: What worked? What needs attention? What should be improved next?

## The solution

Central de Performance consolidates recovery journeys, email activity, payment events, conversion evidence, and operational checks in a single authenticated interface.

## My contribution

- designed the dashboard structure around operational decisions;
- implemented the Next.js and TypeScript interface;
- connected authenticated server-side data access;
- translated recovery rules into measurable indicators and alerts;
- added traceability from aggregate metrics to individual journeys;
- separated the public portfolio copy from the running production system;
- removed secrets and real customer data before publication.

## Engineering decisions

- server-side calculations keep privileged access out of the browser;
- explicit pagination avoids silently truncating larger datasets;
- short-lived caching reduces repeated reads while preserving operational freshness;
- QA markers are excluded from business metrics;
- authentication plus an email allowlist restricts dashboard access;
- platform-specific analytics remain separated where business rules differ.

## What the demo proves

The demo shows the ability to connect product thinking, full-stack development, data analysis, business rules, security, and operational usability. It uses fictional data and does not expose production systems.

## Honest result statement

The project demonstrates a working measurement and operations layer. Do not claim revenue uplift, conversion improvement, or hours saved unless those values have been measured from an approved real-world baseline.

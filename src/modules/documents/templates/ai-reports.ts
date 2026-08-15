/**
 * AI Intelligence document templates: investigation report, member
 * verification report, AI comparison report, system health report.
 *
 * These render the forensic findings produced by the YUNITE AI Intelligence
 * Engine. The data comes from `ai/persistence` getters — the PDF never
 * re-investigates; the engines remain the source of truth.
 */

import type { Content } from 'pdfmake';
import { kpiRow, sectionHeader, preamble, closing } from './shared';
import { buildTable, emptyNote } from '../utils/tables';
import { text, titleCase, severityLabel, severityStyle, formatDate } from '../utils/formatting';
import { capRows } from '../utils/pagination';
import type { Finding } from '@/ai/types';
import type {
  InvestigationReportData,
  MemberVerificationReportData,
  AIComparisonReportData,
  SystemHealthReportData,
  DocumentEnvelope,
} from '../types/document.types';

/** A findings table (code + title + severity + status + module). */
function findingsTable(findings: Finding[]): Content {
  const { rows, truncated } = capRows(findings);
  if (rows.length === 0) return emptyNote('No findings in this investigation.');
  return {
    stack: [
      buildTable(
        [
          { header: 'Code', width: 80 },
          { header: 'Severity', width: 70 },
          { header: 'Module', width: 100 },
          { header: 'Finding', width: '*' },
          { header: 'Status', width: 80 },
        ],
        rows.map((f) => [
          { text: f.finding_code, style: 'tableCell' },
          { text: severityLabel(f.severity), style: severityStyle(f.severity) },
          { text: titleCase(f.module ?? '—'), style: 'tableCell' },
          { text: f.title, style: 'tableCell' },
          { text: titleCase(f.verification_status), style: 'tableCell' },
        ]),
      ),
      ...(truncated ? [emptyNote(`Showing first ${rows.length} of ${findings.length} findings.`)] : []),
    ],
  } as Content;
}

/** The detailed findings list (one block per finding with location + evidence). */
function findingsDetail(findings: Finding[]): Content[] {
  const { rows } = capRows(findings);
  const out: Content[] = [];
  for (const f of rows) {
    out.push({
      stack: [
        {
          columns: [
            { width: '*', text: `${f.finding_code} — ${f.title}`, style: 'sectionTitle' },
            { width: 'auto', text: severityLabel(f.severity), style: severityStyle(f.severity), alignment: 'right' },
          ],
        },
        { text: f.description, style: 'body', margin: [0, 2, 0, 4] },
        ...(f.location?.module ? [{ text: `Module: ${titleCase(f.location.module)}`, style: 'bodySmall' }] : []),
        ...(f.location?.database?.table ? [{ text: `Database: ${f.location.database.table}${f.location.database.field ? `.${f.location.database.field}` : ''}`, style: 'bodySmall' }] : []),
        ...(f.location?.backend?.route ? [{ text: `Backend: ${f.location.backend.route}`, style: 'bodySmall' }] : []),
        ...(f.location?.frontend?.component ? [{ text: `Frontend: ${f.location.frontend.component}`, style: 'bodySmall' }] : []),
        ...(f.expected_value ? [{ text: `Expected: ${f.expected_value}`, style: 'bodySmall' }] : []),
        ...(f.actual_value ? [{ text: `Actual: ${f.actual_value}`, style: 'bodySmall' }] : []),
        ...(f.difference ? [{ text: `Difference: ${f.difference}`, style: 'bodySmall' }] : []),
        ...(f.root_cause ? [{ text: `Root cause: ${f.root_cause}`, style: 'bodySmall', margin: [0, 2, 0, 0] }] : []),
        ...(f.recommendation ? [{ text: `Recommendation: ${f.recommendation}`, style: 'bodySmall' }] : []),
      ],
      margin: [0, 6, 0, 8],
    } as Content);
  }
  return out;
}

/** Full AI investigation report. */
export async function investigationReportTemplate(env: DocumentEnvelope, data: InvestigationReportData): Promise<Content[]> {
  const content: Content[] = await preamble(
    env,
    `${data.investigationNumber} · ${titleCase(data.scope)} · Score ${data.overallScore ?? '—'}/100`,
    [
      ['Investigation ID', data.investigationId],
      ['Scope', titleCase(data.scope)],
      ['Status', titleCase(data.status)],
      ['AI Status', titleCase(data.aiStatus)],
      ['Depth', titleCase(data.depth ?? '—')],
      ['Dual Mode', titleCase(data.dualMode ?? '—')],
      ['Started', formatDate(data.startedAt)],
      ...(data.finishedAt ? [['Finished', formatDate(data.finishedAt)] as [string, string]] : []),
      ['Records Checked', String(data.recordsChecked ?? 0)],
    ],
  );

  content.push(
    kpiRow([
      { label: 'Critical', value: String(data.counts.critical), accent: '#DC2626' },
      { label: 'High', value: String(data.counts.high), accent: '#EA580C' },
      { label: 'Medium', value: String(data.counts.medium), accent: '#D97706' },
      { label: 'Low/Info', value: `${data.counts.low}/${data.counts.info}` },
    ]),
  );

  if (data.summary) {
    content.push(...sectionHeader('Investigation Summary'));
    content.push({ text: data.summary, style: 'body' });
  }

  content.push(...sectionHeader('Findings Summary'));
  content.push(findingsTable(data.findings));

  if (data.findings.length > 0) {
    content.push(...sectionHeader('Detailed Findings'));
    content.push(...findingsDetail(data.findings));
  }

  if (data.recommendations.length > 0) {
    content.push(...sectionHeader('Recommendations'));
    content.push({
      ul: data.recommendations.map((r) => ({ text: r, style: 'body' })),
    } as Content);
  }

  if (data.rootCauseAnalysis) {
    content.push(...sectionHeader('Root Cause Analysis'));
    content.push({ text: data.rootCauseAnalysis, style: 'body' });
  }

  content.push(...closing(env, ['Investigation System']));
  return content;
}

/** Member verification report (layered trace per field). */
export async function memberVerificationReportTemplate(env: DocumentEnvelope, data: MemberVerificationReportData): Promise<Content[]> {
  const content: Content[] = await preamble(
    env,
    `${data.memberName ?? 'Member'} — ${data.memberNumber ?? 'No.'} · ${titleCase(data.overallStatus)}`,
    [
      ['Investigation', data.investigationNumber],
      ['Member', `${data.memberName ?? '—'} (${data.memberNumber ?? '—'})`],
      ['Overall Status', titleCase(data.overallStatus)],
      ['Verification Score', `${data.verificationScore}/100`],
      ['Fields Checked', String(data.fieldsChecked)],
      ['Fields Verified', String(data.fieldsVerified)],
      ['Fields Mismatched', String(data.fieldsMismatched)],
    ],
  );

  if (data.fieldResults.length > 0) {
    content.push(...sectionHeader('Field-Level Verification (Layered Trace)'));
    const { rows, truncated } = capRows(data.fieldResults);
    content.push(
      buildTable(
        [
          { header: 'Field', width: 120 },
          { header: 'Database', width: 80 },
          { header: 'API', width: 80 },
          { header: 'Display', width: 80 },
          { header: 'Match', width: 50 },
          { header: 'Mismatch Layer', width: 80 },
        ],
        rows.map((f) => [
          { text: titleCase(f.field), style: 'tableCell' },
          { text: text(f.database), style: 'tableCell' },
          { text: text(f.api), style: 'tableCell' },
          { text: text(f.display), style: 'tableCell' },
          { text: f.match ? '✓' : '✗', style: f.match ? 'info' : 'critical', alignment: 'center' },
          { text: titleCase(f.mismatchLayer ?? 'none'), style: 'tableCell' },
        ]),
      ),
    );
    if (truncated) content.push(emptyNote(`Showing first ${rows.length} of ${data.fieldResults.length} fields.`));
  }

  if (data.sections && data.sections.length > 0) {
    content.push(...sectionHeader('Report Sections'));
    for (const s of data.sections) {
      content.push({ text: s.title, style: 'sectionTitle' });
      content.push({ text: s.summary, style: 'body', margin: [0, 2, 0, 4] });
      if (s.items && s.items.length > 0) {
        content.push({ ul: s.items.map((i) => ({ text: i, style: 'bodySmall' })) } as Content);
      }
    }
  }

  if (data.geminiAssessment || data.openrouterAssessment || data.finalEvaluation) {
    content.push(...sectionHeader('AI Evaluation'));
    if (data.geminiAssessment) content.push({ text: `Gemini: ${data.geminiAssessment}`, style: 'body', margin: [0, 2, 0, 4] });
    if (data.openrouterAssessment) content.push({ text: `OpenRouter: ${data.openrouterAssessment}`, style: 'body', margin: [0, 2, 0, 4] });
    if (data.finalEvaluation) content.push({ text: `Final: ${data.finalEvaluation}`, style: 'body', margin: [0, 2, 0, 4] });
  }

  content.push(...closing(env, ['AI Intelligence System']));
  return content;
}

/** AI comparison report (Gemini vs OpenRouter). */
export async function comparisonReportTemplate(env: DocumentEnvelope, data: AIComparisonReportData): Promise<Content[]> {
  const content: Content[] = await preamble(env, `${data.investigationNumber} · ${titleCase(data.scope)}`, [
    ['Investigation', data.investigationNumber],
    ['Scope', titleCase(data.scope)],
  ]);

  content.push(...sectionHeader('Provider Summaries'));
  if (data.geminiReport) {
    content.push({ text: 'Gemini', style: 'sectionTitle' });
    content.push({ text: data.geminiReport.summary, style: 'body', margin: [0, 2, 0, 4] });
    content.push({ text: `${data.geminiReport.findingsCount} findings`, style: 'bodySmall' });
  }
  if (data.openrouterReport) {
    content.push({ text: 'OpenRouter', style: 'sectionTitle' });
    content.push({ text: data.openrouterReport.summary, style: 'body', margin: [0, 2, 0, 4] });
    content.push({ text: `${data.openrouterReport.findingsCount} findings`, style: 'bodySmall' });
  }

  if (data.comparison) {
    const c = data.comparison;
    content.push(
      kpiRow([
        { label: 'Agreements', value: String(c.counts.agreements), accent: '#16A34A' },
        { label: 'Disagreements', value: String(c.counts.disagreements), accent: '#DC2626' },
        { label: 'Gemini-only', value: String(c.counts.gemini_only), accent: '#D97706' },
        { label: 'OpenRouter-only', value: String(c.counts.openrouter_only), accent: '#D97706' },
      ]),
    );

    content.push(...sectionHeader('Comparison Summary'));
    content.push({ text: data.summary, style: 'body' });

    if (c.disagreements.length > 0) {
      content.push(...sectionHeader('Disagreements (Require Verification)'));
      content.push(
        buildTable(
          [{ header: 'Gemini Finding', width: '*' }, { header: 'OpenRouter Finding', width: '*' }, { header: 'Reason', width: 120 }],
          c.disagreements.map((d) => [
            { text: `${d.gemini.finding_code}: ${d.gemini.title}`, style: 'tableCell' },
            { text: `${d.openrouter.finding_code}: ${d.openrouter.title}`, style: 'tableCell' },
            { text: d.reason, style: 'tableCell' },
          ]),
        ),
      );
    }

    if (c.verified_findings.length > 0) {
      content.push(...sectionHeader('Verified Findings (Both Providers Agree)'));
      content.push(findingsTable(c.verified_findings));
    }
  }

  content.push(...closing(env, ['AI Intelligence System']));
  return content;
}

/** System health report (module health map + provider health). */
export async function systemHealthReportTemplate(env: DocumentEnvelope, data: SystemHealthReportData): Promise<Content[]> {
  const content: Content[] = await preamble(env, `Generated ${formatDate(data.generatedOn)}`, [
    ['Generated', formatDate(data.generatedOn)],
  ]);

  if (data.summary) {
    content.push(...sectionHeader('Health Summary'));
    content.push({ text: data.summary, style: 'body' });
  }

  content.push(...sectionHeader('Module Health'));
  content.push(
    buildTable(
      [
        { header: 'Module', width: 150 },
        { header: 'Status', width: 90 },
        { header: 'Findings', width: 70, numeric: true },
        { header: 'Critical', width: 70, numeric: true },
        { header: 'High', width: 60, numeric: true },
        { header: 'Affected', width: 70, numeric: true },
      ],
      data.modules.map((m) => [
        titleCase(m.module),
        titleCase(m.status),
        String(m.findingsCount),
        String(m.criticalCount),
        String(m.highCount),
        String(m.affectedMembers ?? m.affectedRecords ?? 0),
      ]),
    ),
  );

  if (data.providerHealth.length > 0) {
    content.push(...sectionHeader('AI Provider Health'));
    content.push(
      buildTable(
        [
          { header: 'Provider', width: 120 },
          { header: 'Status', width: 90 },
          { header: 'Availability', width: 90, numeric: true },
          { header: 'Success', width: 70, numeric: true },
          { header: 'Failure', width: 70, numeric: true },
        ],
        data.providerHealth.map((p) => [
          titleCase(p.provider),
          titleCase(p.status),
          `${p.availabilityPct}%`,
          String(p.successCount),
          String(p.failureCount),
        ]),
      ),
    );
  }

  content.push(...closing(env, ['AI Intelligence System']));
  return content;
}

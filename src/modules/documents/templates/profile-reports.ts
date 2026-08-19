/**
 * Member profile template: member_profile.
 *
 * Renders the FULL personal profile captured at registration — personal,
 * contact, employment, next of kin, emergency contact, communication
 * preferences, and membership details — for a single member or, when no
 * member scope is given, for every member (one profile per page).
 */

import type { Content } from 'pdfmake';
import { kpiRow, sectionHeader, preamble, closing, pageBreak } from './shared';
import { buildTable, emptyNote } from '../utils/tables';
import { text, titleCase, formatDate } from '../utils/formatting';
import { BRAND_COLORS } from '@/lib/services/reports/brand';
import type { MemberProfileData } from '@/lib/services/reports/report-data.service';
import type { DocumentEnvelope } from '../types/document.types';

/** A field/value table for one profile section. */
function fieldTable(fields: Array<[string, unknown]>): Content {
  return buildTable(
    [{ header: 'Field', width: 150 }, { header: 'Value' }],
    fields.map(([label, value]) => [label, typeof value === 'string' ? text(value) : value]),
  );
}

function boolLabel(value: boolean | null): string | null {
  if (value === null) return null;
  return value ? 'Enabled' : 'Disabled';
}

/** Render one member's complete profile as pdfmake content. */
function renderOneProfile(m: MemberProfileData): Content[] {
  const content: Content[] = [];

  content.push({
    columns: [
      {
        width: '*',
        stack: [
          { text: `${m.first_name} ${m.last_name}`, style: 'memberName' },
          { text: `Member No. ${m.member_number}`, style: 'bodySmall' },
        ],
      },
      {
        width: 'auto',
        text: titleCase(m.status).toUpperCase(),
        fontSize: 7,
        bold: true,
        color: m.status === 'active' ? BRAND_COLORS.green : BRAND_COLORS.navy,
      },
    ],
    margin: [0, 2, 0, 6],
  } as unknown as Content);

  content.push(...sectionHeader('Personal Information'));
  content.push(
    fieldTable([
      ['Full Name', `${m.first_name} ${m.last_name}`],
      ['ID Number', m.id_number],
      ['KRA PIN', m.kra_pin],
      ['Date of Birth', m.date_of_birth ? formatDate(m.date_of_birth) : null],
      ['Gender', m.gender ? titleCase(m.gender) : null],
      ['Marital Status', m.marital_status],
      ['Nationality', m.nationality],
    ]),
  );

  content.push(...sectionHeader('Contact Information'));
  content.push(
    fieldTable([
      ['Phone', m.phone],
      ['Alternative Phone', m.alt_phone],
      ['Email', m.email],
      ['Alternative Email', m.alt_email],
      ['Physical Address', m.physical_address],
      ['Postal Address', m.postal_address],
    ]),
  );

  content.push(...sectionHeader('Employment'));
  content.push(
    fieldTable([
      ['Occupation', m.occupation],
      ['Employer', m.employer],
      ['Employer Address', m.employer_address],
    ]),
  );

  content.push(...sectionHeader('Next of Kin'));
  content.push(
    fieldTable([
      ['Name', m.next_of_kin_name],
      ['Phone', m.next_of_kin_phone],
      ['Relationship', m.next_of_kin_relationship],
    ]),
  );

  content.push(...sectionHeader('Emergency Contact'));
  content.push(
    fieldTable([
      ['Name', m.emergency_contact_name],
      ['Phone', m.emergency_contact_phone],
      ['Relationship', m.emergency_contact_relationship],
    ]),
  );

  content.push(...sectionHeader('Communication Preferences'));
  content.push(
    fieldTable([
      ['Preferred Language', m.preferred_language],
      ['Preferred Contact Method', m.preferred_contact_method],
      ['SMS Notifications', boolLabel(m.sms_notifications)],
      ['Email Notifications', boolLabel(m.email_notifications)],
    ]),
  );

  content.push(...sectionHeader('Membership Details'));
  content.push(
    fieldTable([
      ['Member Number', m.member_number],
      ['Status', titleCase(m.status)],
      ['Membership Category', m.membership_category],
      ['Member Group', m.member_group],
      ['Workflow Stage', m.workflow_stage ? titleCase(m.workflow_stage) : null],
      ['Registration Date', formatDate(m.registration_date)],
      ['Record Created', formatDate(m.created_at)],
    ]),
  );

  return content;
}

/** Member profile document — one member or the full register of profiles. */
export async function memberProfileTemplate(
  env: DocumentEnvelope,
  profiles: MemberProfileData[],
  total: number,
): Promise<Content[]> {
  const single = profiles.length === 1 ? profiles[0] : undefined;
  const content: Content[] = await preamble(
    env,
    single
      ? `${single.first_name} ${single.last_name} — Member No. ${single.member_number}`
      : `${total} member profiles on record`,
    single
      ? [['Member Status', titleCase(single.status)], ['Contact', text(single.phone)]]
      : [['Profiles Included', String(total)]],
  );

  if (profiles.length === 0) {
    content.push(emptyNote('No members on record.'));
    return content;
  }

  if (!single) {
    content.push(
      kpiRow([{ label: 'Profiles Included', value: String(total) }]),
    );
  }

  profiles.forEach((m, i) => {
    if (i > 0) content.push(pageBreak());
    content.push(...renderOneProfile(m));
  });

  content.push(...closing(env, ['Prepared By', 'Secretary']));
  return content;
}

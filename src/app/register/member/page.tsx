import PublicMemberRegistrationForm from './PublicMemberRegistrationForm';
import { ORG_IDENTITY } from '@/lib/services/reports/brand';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `Member Registration — ${ORG_IDENTITY.name}`,
  description: `Submit your information to ${ORG_IDENTITY.name}. A submission does not automatically make you a registered member; it is processed by an administrator.`,
};

export default function RegisterMemberPage() {
  return <PublicMemberRegistrationForm />;
}

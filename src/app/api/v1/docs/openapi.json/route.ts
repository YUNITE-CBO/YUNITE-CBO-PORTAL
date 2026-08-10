import { NextResponse } from 'next/server';
import { buildOpenApiDoc } from '@/lib/api/openapi';

/**
 * OpenAPI 3.0 document for the YUNITE API gateway, generated from the
 * endpoint manifest. Public (no auth) so integration partners can discover
 * the contract anonymously when api.gateway.public_docs_enabled is on; the
 * document contains no secrets.
 */
export async function GET() {
  const doc = buildOpenApiDoc();
  return NextResponse.json(doc, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

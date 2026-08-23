'use client';

/**
 * YUNITE API — Swagger UI
 *
 * Loads swagger-ui from the official CDN (no npm dependency) and points it at
 * the live OpenAPI document generated from the endpoint manifest at
 * /api/v1/docs/openapi.json. The document is public and contains no secrets.
 */

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    SwaggerUIBundle?: any;
  }
}

export default function ApiDocsPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef(false);

  useEffect(() => {
    if (renderedRef.current) return;
    renderedRef.current = true;

    const loadScript = (src: string) =>
      new Promise<void>((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(s);
      });

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui.css';
    document.head.appendChild(link);

    (async () => {
      try {
        await loadScript('https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui-bundle.js');
        if (window.SwaggerUIBundle && containerRef.current) {
          window.SwaggerUIBundle({
            url: '/api/v1/docs/openapi.json',
            domNode: containerRef.current,
            deepLinking: true,
            presets: [window.SwaggerUIBundle.presets.apis],
            layout: 'BaseLayout',
            defaultModelsExpandDepth: -1,
            tryItOutEnabled: false,
          });
        }
      } catch (err) {
        console.error('Failed to load Swagger UI:', err);
      }
    })();
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">API Documentation</h1>
        <p className="text-gray-600 mt-1">
          Interactive Swagger UI for the YUNITE API gateway. The OpenAPI document is generated live from the
          endpoint manifest, so it can never drift from the running API.
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <a
            href="/api/v1/docs/openapi.json"
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-200 hover:bg-indigo-100"
          >
            OpenAPI JSON ↗
          </a>
          <a
            href="/api/v1/docs"
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 bg-gray-50 text-gray-700 rounded-lg border border-gray-200 hover:bg-gray-100"
          >
            Docs index ↗
          </a>
          <a
            href="/api/v1/health"
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 bg-green-50 text-green-700 rounded-lg border border-green-200 hover:bg-green-100"
          >
            Health ↗
          </a>
        </div>
      </div>
      <div className="bg-white rounded-xl border p-4">
        <div ref={containerRef} />
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Copy, Check, ShieldAlert } from 'lucide-react';

type EnvVar = {
  key: string;
  sensitive: boolean;
  description: string;
  isSet: boolean;
  length: number;
  value: string | null;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function EnvironmentVariables() {
  const { data, error, isLoading } = useSWR<{ data?: EnvVar[]; error?: string }>(
    '/api/env',
    fetcher
  );

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const vars = data?.data ?? [];

  async function handleCopy(v: EnvVar) {
    if (!v.value) return;
    try {
      await navigator.clipboard.writeText(v.value);
      setCopiedKey(v.key);
      setTimeout(() => setCopiedKey((k) => (k === v.key ? null : k)), 1500);
    } catch {
      // Clipboard may be unavailable (e.g. non-HTTPS); fail silently.
    }
  }

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>Environment Variables</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-500 mb-4">
          Backend configuration this deployment is running with. Visible to
          owners only.
        </p>

        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 mb-4">
          <ShieldAlert className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
          <p className="text-sm text-red-800">
            These are the full backend values, including secrets like your
            Postgres password and the Supabase service-role key. Anyone who can
            see this screen can read them — avoid screen-sharing or screenshotting
            this tab.
          </p>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading environment...
          </div>
        )}

        {(error || data?.error) && !isLoading && (
          <p className="text-red-500 text-sm py-4">
            {data?.error || 'Failed to load environment variables.'}
          </p>
        )}

        {!isLoading && !error && !data?.error && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Variable</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vars.map((v) => (
                  <TableRow key={v.key}>
                    <TableCell className="align-top">
                      <div className="font-mono text-xs font-medium text-gray-900 whitespace-nowrap">
                        {v.key}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5 max-w-[280px]">
                        {v.description}
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      {v.isSet ? (
                        <div className="flex items-center gap-2">
                          <code className="font-mono text-xs text-gray-700 break-all bg-gray-50 rounded px-1.5 py-0.5">
                            {v.value}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 shrink-0 text-gray-400 hover:text-gray-700"
                            onClick={() => handleCopy(v)}
                          >
                            {copiedKey === v.key ? (
                              <Check className="h-3.5 w-3.5 text-green-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                            <span className="sr-only">Copy {v.key}</span>
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 italic">
                          Not set
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      {v.sensitive ? (
                        <Badge
                          variant="outline"
                          className="border-amber-300 bg-amber-50 text-amber-700"
                        >
                          Secret
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Public</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right align-top">
                      {v.isSet ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600 whitespace-nowrap">
                          <Check className="h-3.5 w-3.5" />
                          Set
                        </span>
                      ) : (
                        <span className="text-xs text-red-500 whitespace-nowrap">
                          Missing
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

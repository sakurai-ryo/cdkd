/**
 * Installed-SDK reconciliation (VERIFICATION.md C3).
 *
 * The pipeline's two inputs (CFn registry schema snapshot, api-models-aws at
 * HEAD) are both newer than the RUNTIME's pinned @aws-sdk/client-* packages.
 * A member that exists in the HEAD Smithy model but not in the installed
 * client is silently dropped by the SDK serializer — the exact failure class
 * this tool exists to eliminate (live instances: CodeBuild `hostKernel`,
 * Lambda `S3ObjectStorageMode`). So the installed client's typings are a
 * REQUIRED third input: every generated SDK member name is checked against
 * them, and absent members are flagged + never emitted.
 *
 * Granularity note: the check is a package-wide member-NAME set, not
 * per-shape membership — sufficient for the model-newer-than-runtime class
 * (the member name is absent entirely), blind to a member that exists on a
 * different shape only.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface InstalledSdkIndex {
  /** npm package basename, e.g. `client-cloudwatch`. */
  pkg: string;
  /** null = package not installed; skew check skipped (reported). */
  members: Set<string> | null;
}

/** `CloudWatch Logs` -> `client-cloudwatch-logs`, `Route 53` -> `client-route-53`. */
export function clientPackageName(sdkId: string): string {
  return 'client-' + sdkId.toLowerCase().replace(/\s+/g, '-');
}

export function clientPackageInstalled(nodeModulesDir: string, sdkId: string): boolean {
  return existsSync(join(nodeModulesDir, '@aws-sdk', clientPackageName(sdkId)));
}

export function loadInstalledSdkIndex(nodeModulesDir: string, sdkId: string): InstalledSdkIndex {
  const pkg = clientPackageName(sdkId);
  const modelsDir = join(nodeModulesDir, '@aws-sdk', pkg, 'dist-types', 'models');
  if (!existsSync(modelsDir)) return { pkg, members: null };
  const members = new Set<string>();
  for (const file of readdirSync(modelsDir)) {
    if (!file.endsWith('.d.ts')) continue;
    const text = readFileSync(join(modelsDir, file), 'utf8');
    // Interface property signatures: `  MemberName?: Type;` / `  member: T;`
    const re = /^\s+([A-Za-z_][A-Za-z0-9_]*)\??:/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) members.add(m[1] as string);
  }
  return { pkg, members };
}

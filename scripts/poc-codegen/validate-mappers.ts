/**
 * Runtime validation harness over the COMMITTED generated mappers in
 * examples/. This is a smoke test asserting hand-picked expectations —
 * NOT a differential equivalence suite against the hand-written providers
 * (see EVALUATION.md §6 mode (ii) for what that would take).
 *
 * It pins BOTH sides of the post-verification behavior:
 *   - auto-tier mappings (exact / case) ARE emitted with their transforms;
 *   - rename-candidates, collisions and version-skew members are NOT
 *     emitted (VERIFICATION.md C2 / C3) — a wrong-but-plausible write is
 *     worse than a visible gap.
 *
 * Run: node scripts/poc-codegen/validate-mappers.ts   (exit 0 = all pass)
 */
import { buildCreateInput as anomalyCreate } from './examples/AWS-CloudWatch-AnomalyDetector.mapper.ts';
import { buildCreateInput as ecsServiceCreate } from './examples/AWS-ECS-Service.mapper.ts';
import { buildCreateInput as cfDistCreate } from './examples/AWS-CloudFront-Distribution.mapper.ts';
import { buildCreateInput as codeBuildCreate } from './examples/AWS-CodeBuild-Project.mapper.ts';
import { buildCreateInput as s3BucketCreate } from './examples/AWS-S3-Bucket.mapper.ts';

const checks: Array<[string, boolean]> = [];
const rec = (v: unknown): Record<string, unknown> => (v ?? {}) as Record<string, unknown>;

// --- AWS::CloudWatch::AnomalyDetector -------------------------------------
const anomalyOut = anomalyCreate({
  Namespace: 'AWS/EC2',
  MetricName: 'CPUUtilization',
  Stat: 'Average',
  Dimensions: [{ Name: 'InstanceId', Value: 'i-123' }],
  Configuration: {
    MetricTimeZone: 'UTC+0900',
    ExcludedTimeRanges: [{ StartTime: '2026-01-01T00:00:00Z', EndTime: '2026-01-02T00:00:00Z' }],
  },
  MetricCharacteristics: { PeriodicSpikes: true },
});
const cfg = rec(anomalyOut['Configuration']);
const range = rec((cfg['ExcludedTimeRanges'] as unknown[])[0]);
checks.push(
  ['AnomalyDetector: MetricTimezone spelled with lowercase z (#1304 class)', cfg['MetricTimezone'] === 'UTC+0900'],
  ['AnomalyDetector: CFn MetricTimeZone key NOT forwarded', cfg['MetricTimeZone'] === undefined],
  ['AnomalyDetector: StartTime coerced to Date', range['StartTime'] instanceof Date],
  ['AnomalyDetector: EndTime coerced to Date', range['EndTime'] instanceof Date],
  ['AnomalyDetector: Namespace passthrough', anomalyOut['Namespace'] === 'AWS/EC2'],
  [
    'AnomalyDetector: MetricCharacteristics passthrough',
    JSON.stringify(anomalyOut['MetricCharacteristics']) === JSON.stringify({ PeriodicSpikes: true }),
  ]
);

// --- AWS::ECS::Service -----------------------------------------------------
const ecsOut = ecsServiceCreate({
  Cluster: 'my-cluster',
  ServiceName: 'my-svc',
  DesiredCount: 2,
  EnableECSManagedTags: true,
  LoadBalancers: [
    {
      ContainerName: 'app',
      ContainerPort: 80,
      TargetGroupArn: 'arn:tg',
      AdvancedConfiguration: { AlternateTargetGroupArn: 'arn:alt' },
    },
  ],
  NetworkConfiguration: {
    AwsvpcConfiguration: { Subnets: ['subnet-1'], AssignPublicIp: 'ENABLED' },
  },
  PlacementStrategies: [{ Type: 'spread', Field: 'attribute:ecs.availability-zone' }],
});
const lb = rec((ecsOut['loadBalancers'] as unknown[])[0]);
checks.push(
  ['ECS: cluster camelCase', ecsOut['cluster'] === 'my-cluster'],
  ['ECS: desiredCount camelCase', ecsOut['desiredCount'] === 2],
  ['ECS: enableECSManagedTags camelCase', ecsOut['enableECSManagedTags'] === true],
  [
    'ECS: AdvancedConfiguration blue/green block delivered (#1473 class)',
    rec(lb['advancedConfiguration'])['alternateTargetGroupArn'] === 'arn:alt',
  ],
  [
    'ECS: awsvpcConfiguration nested camelCase',
    Array.isArray(rec(ecsOut['networkConfiguration'] as never)['awsvpcConfiguration'] && rec(rec(ecsOut['networkConfiguration'] as never)['awsvpcConfiguration'])['subnets']),
  ],
  [
    'ECS: PlacementStrategies is a CANDIDATE — NOT emitted in either spelling',
    ecsOut['placementStrategy'] === undefined && ecsOut['PlacementStrategies'] === undefined,
  ]
);

// --- AWS::CloudFront::Distribution ----------------------------------------
const cfOut = cfDistCreate({
  DistributionConfig: {
    Enabled: true,
    Comment: 'poc',
    IPV6Enabled: true,
    Aliases: ['example.com'],
    DefaultCacheBehavior: {
      TargetOriginId: 'origin1',
      ViewerProtocolPolicy: 'redirect-to-https',
      TrustedSigners: ['self'],
    },
    Origins: [
      {
        Id: 'origin1',
        DomainName: 'bucket.s3.amazonaws.com',
        OriginCustomHeaders: [{ HeaderName: 'x-poc', HeaderValue: '1' }],
        CustomOriginConfig: { OriginProtocolPolicy: 'https-only', OriginSSLProtocols: ['TLSv1.2'] },
      },
    ],
    ViewerCertificate: { AcmCertificateArn: 'arn:acm:cert', SslSupportMethod: 'sni-only' },
  },
});
const dc = rec(cfOut['DistributionConfig']);
const aliases = rec(dc['Aliases']);
const origin0 = rec((rec(dc['Origins'])['Items'] as unknown[])[0]);
const vc = rec(dc['ViewerCertificate']);
const dcb = rec(dc['DefaultCacheBehavior']);
const ts = rec(dcb['TrustedSigners']);
checks.push(
  ['CloudFront: Aliases wrapped {Quantity, Items}', aliases['Quantity'] === 1 && Array.isArray(aliases['Items'])],
  ['CloudFront: Origins wrapped {Quantity, Items}', rec(dc['Origins'])['Quantity'] === 1],
  [
    'CloudFront: OriginSSLProtocols -> OriginSslProtocols wrapper (#1370 class)',
    rec(rec(origin0['CustomOriginConfig'])['OriginSslProtocols'])['Quantity'] === 1,
  ],
  ['CloudFront: AcmCertificateArn -> ACMCertificateArn (#1370 class)', vc['ACMCertificateArn'] === 'arn:acm:cert'],
  ['CloudFront: SslSupportMethod -> SSLSupportMethod (#1370 class)', vc['SSLSupportMethod'] === 'sni-only'],
  [
    'CloudFront: IPV6Enabled is a CANDIDATE — NOT emitted in either spelling',
    dc['IsIPV6Enabled'] === undefined && dc['IPV6Enabled'] === undefined,
  ],
  [
    'CloudFront: OriginCustomHeaders is a CANDIDATE — NOT emitted in either spelling',
    origin0['CustomHeaders'] === undefined && origin0['OriginCustomHeaders'] === undefined,
  ],
  [
    'CloudFront: TrustedSigners wrapper emitted (Enabled left to glue per TODO)',
    ts['Quantity'] === 1 && Array.isArray(ts['Items']) && ts['Enabled'] === undefined,
  ]
);

// --- AWS::CodeBuild::Project ----------------------------------------------
const cbOut = codeBuildCreate({
  Name: 'proj',
  Source: { Type: 'GITHUB', Location: 'https://example.com/repo.git' },
  Artifacts: { Type: 'NO_ARTIFACTS' },
  ServiceRole: 'arn:role',
  Environment: {
    Type: 'LINUX_CONTAINER',
    ComputeType: 'BUILD_GENERAL1_SMALL',
    Image: 'aws/codebuild/standard:7.0',
    HostKernel: 'kernel-6.1',
  },
  BuildBatchConfig: { ServiceRole: 'arn:batch-role', BatchReportMode: 'REPORT_INDIVIDUAL_BUILDS' },
});
const env = rec(cbOut['environment']);
checks.push(
  ['CodeBuild: environment camelCase delivered', env['type'] === 'LINUX_CONTAINER'],
  [
    'CodeBuild: HostKernel is VERSION-SKEW — NOT emitted (C3; installed SDK lacks it)',
    env['hostKernel'] === undefined && env['HostKernel'] === undefined,
  ],
  [
    'CodeBuild: BatchReportMode delivered (#1432 class)',
    rec(cbOut['buildBatchConfig'])['batchReportMode'] === 'REPORT_INDIVIDUAL_BUILDS',
  ]
);

// --- AWS::S3::Bucket -------------------------------------------------------
const s3Out = s3BucketCreate({ BucketName: 'my-bucket', BucketEncryption: { X: 1 } });
checks.push(
  [
    'S3: BucketName is a CANDIDATE — NOT emitted in any spelling',
    s3Out['Bucket'] === undefined && s3Out['BucketNamespace'] === undefined && s3Out['BucketName'] === undefined,
  ],
  [
    'S3: BucketEncryption NOT json-stringified into CreateBucket (C2 class)',
    Object.values(s3Out).every((v) => typeof v !== 'string' || !v.includes('"X"')),
  ]
);

console.log('--- checks ---');
let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed += 1;
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);

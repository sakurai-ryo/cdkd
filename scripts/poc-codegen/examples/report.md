# PoC codegen report: CFn registry schema + Smithy model -> SDK input mappers

Generated over 6 resource type(s).

## AWS::CloudWatch::AnomalyDetector

Smithy model: `cloudwatch-2010-08-01.json` (sdkId: CloudWatch, cloudFormationName: CloudWatch)

| op | operation | source | other candidates |
|----|-----------|--------|------------------|
| create | PutAnomalyDetector | verb-heuristic | — |
| update | PutAnomalyDetector | verb-heuristic | — |
| delete | DeleteAnomalyDetector | verb-heuristic | — |

**create coverage** (PutAnomalyDetector): 35/35 CFn paths matched (100.0%).
**update coverage** (PutAnomalyDetector): 35/35 CFn paths matched (100.0%).
**delete coverage** (DeleteAnomalyDetector): 28/30 CFn paths matched (93.3%).

### Case divergences auto-resolved (beyond Pascal->camel style flip) (1)

- `Configuration.MetricTimeZone` -> `MetricTimezone` [create, update]

### Unmatched CFn paths (CFn-only field, wrong op, or silent-drop risk) (2)

- `Configuration` (structure) [delete]
- `MetricCharacteristics` (structure) [createOnly] [delete]


## AWS::ECS::Service

Smithy model: `ecs-2014-11-13.json` (sdkId: ECS, cloudFormationName: ECS)

| op | operation | source | other candidates |
|----|-----------|--------|------------------|
| create | CreateService | handlers | DescribeServiceDeployments, DescribeServices, ListServiceDeployments, TagResource |
| update | UpdateService | handlers | DescribeServiceDeployments, DescribeServices, ListServiceDeployments, ListTagsForResource, StopServiceDeployment, TagResource |
| delete | DeleteService | handlers | DescribeServices |

**create coverage** (CreateService): 136/137 CFn paths matched (99.3%).
**update coverage** (UpdateService): 133/137 CFn paths matched (97.1%).
**delete coverage** (DeleteService): 3/27 CFn paths matched (11.1%).

### Rename candidates (need human confirmation) (3)

- `PlacementStrategies` -> `placementStrategy` (fuzzy-matched to "placementStrategy" (overlap 0.84)) [create, update]
- `ServiceName` -> `service` (fuzzy-matched to "service" (overlap 0.64)) [update, delete]
- `ServiceConnectConfiguration` -> `service` (object serialized to JSON string; fuzzy-matched to "service" (overlap 0.26)) [delete]

### Type-incompatible same-name members (manual mapping) (1)

- `ForceNewDeployment` -> `forceNewDeployment`: type-incompatible: CFn structure vs SDK boolean [update]

### Unmatched CFn paths (CFn-only field, wrong op, or silent-drop risk) (24)

- `ForceNewDeployment` (structure) [create, delete]
- `LaunchType` (string) [update, delete]
- `Role` (string) [createOnly] [update, delete]
- `SchedulingStrategy` (string) [createOnly] [update, delete]
- `Tags` (list) [update, delete]
- `AvailabilityZoneRebalancing` (string) [delete]
- `CapacityProviderStrategy` (list) [delete]
- `DeploymentConfiguration` (structure) [delete]
- `DeploymentController` (structure) [delete]
- `DesiredCount` (number) [delete]
- `EnableECSManagedTags` (boolean) [delete]
- `EnableExecuteCommand` (boolean) [delete]
- `HealthCheckGracePeriodSeconds` (number) [delete]
- `LoadBalancers` (list) [delete]
- `Monitoring` (structure) [delete]
- `NetworkConfiguration` (structure) [delete]
- `PlacementConstraints` (list) [delete]
- `PlacementStrategies` (list) [delete]
- `PlatformVersion` (string) [delete]
- `PropagateTags` (string) [delete]
- `ServiceRegistries` (list) [delete]
- `TaskDefinition` (string) [delete]
- `VolumeConfigurations` (list) [delete]
- `VpcLatticeConfigurations` (list) [delete]


## AWS::ECS::TaskDefinition

Smithy model: `ecs-2014-11-13.json` (sdkId: ECS, cloudFormationName: ECS)

| op | operation | source | other candidates |
|----|-----------|--------|------------------|
| create | RegisterTaskDefinition | handlers | DescribeTaskDefinition, TagResource |
| update | (unresolved) | — | — |
| delete | DeregisterTaskDefinition | handlers | DescribeTaskDefinition |

**create coverage** (RegisterTaskDefinition): 158/158 CFn paths matched (100.0%).
**delete coverage** (DeregisterTaskDefinition): 0/18 CFn paths matched (0.0%).

### Case divergences auto-resolved (beyond Pascal->camel style flip) (5)

- `Volumes.EFSVolumeConfiguration` -> `efsVolumeConfiguration` [create]
- `Volumes.EFSVolumeConfiguration.AuthorizationConfig.IAM` -> `iam` [create]
- `Volumes.EFSVolumeConfiguration.FilesystemId` -> `fileSystemId` [create]
- `Volumes.FSxWindowsFileServerVolumeConfiguration` -> `fsxWindowsFileServerVolumeConfiguration` [create]
- `Volumes.S3FilesVolumeConfiguration` -> `s3filesVolumeConfiguration` [create]

### Rename candidates (need human confirmation) (1)

- `ProxyConfiguration.ProxyConfigurationProperties` -> `properties` (fuzzy-matched to "properties" (overlap 0.36)) [create]

### Unmatched CFn paths (CFn-only field, wrong op, or silent-drop risk) (18)

- `ContainerDefinitions` (list) [createOnly] [delete]
- `Cpu` (string) [createOnly] [delete]
- `EnableFaultInjection` (boolean) [createOnly] [delete]
- `EphemeralStorage` (structure) [createOnly] [delete]
- `ExecutionRoleArn` (string) [createOnly] [delete]
- `Family` (string) [createOnly] [delete]
- `InferenceAccelerators` (list) [createOnly] [delete]
- `IpcMode` (string) [createOnly] [delete]
- `Memory` (string) [createOnly] [delete]
- `NetworkMode` (string) [createOnly] [delete]
- `PidMode` (string) [createOnly] [delete]
- `PlacementConstraints` (list) [createOnly] [delete]
- `ProxyConfiguration` (structure) [createOnly] [delete]
- `RequiresCompatibilities` (list) [createOnly] [delete]
- `RuntimePlatform` (structure) [createOnly] [delete]
- `Tags` (list) [delete]
- `TaskRoleArn` (string) [createOnly] [delete]
- `Volumes` (list) [createOnly] [delete]

### SDK required members with no CFn source (synthesize in glue code) (1)

- `<DeregisterTaskDefinitionRequest>.taskDefinition` [delete]


## AWS::CloudFront::Distribution

Smithy model: `cloudfront-2020-05-31.json` (sdkId: CloudFront, cloudFormationName: CloudFront)

| op | operation | source | other candidates |
|----|-----------|--------|------------------|
| create | CreateDistribution | handlers | CreateConnectionGroup, CreateDistributionWithTags, GetConnectionGroup, GetDistribution, GetDistributionConfig, GetVpcOrigin |
| update | UpdateDistribution | handlers | CreateConnectionGroup, GetConnectionGroup, GetDistribution, GetDistributionConfig, GetVpcOrigin, UpdateDistributionWithStagingConfig |
| delete | DeleteDistribution | handlers | GetDistribution, GetDistributionConfig |

**create coverage** (CreateDistribution): 147/154 CFn paths matched (95.5%).
**update coverage** (UpdateDistribution): 147/154 CFn paths matched (95.5%).
**delete coverage** (DeleteDistribution): 0/2 CFn paths matched (0.0%).

### Per-property sub-operations (multi-op resource idiom)

| CFn property | operation | inner coverage |
|--------------|-----------|----------------|
| Tags | CreateDistributionWithTags | 0/1 (0%) |

### Case divergences auto-resolved (beyond Pascal->camel style flip) (4)

- `DistributionConfig.Origins.CustomOriginConfig.OriginSSLProtocols` -> `OriginSslProtocols` [create, update]
- `DistributionConfig.ViewerCertificate.AcmCertificateArn` -> `ACMCertificateArn` [create, update]
- `DistributionConfig.ViewerCertificate.IamCertificateId` -> `IAMCertificateId` [create, update]
- `DistributionConfig.ViewerCertificate.SslSupportMethod` -> `SSLSupportMethod` [create, update]

### Rename candidates (need human confirmation) (2)

- `DistributionConfig.IPV6Enabled` -> `IsIPV6Enabled` (fuzzy-matched to "IsIPV6Enabled" (overlap 0.85)) [create, update]
- `DistributionConfig.Origins.OriginCustomHeaders` -> `CustomHeaders` (fuzzy-matched to "CustomHeaders" (overlap 0.68)) [create, update]

### Unmatched CFn paths (CFn-only field, wrong op, or silent-drop risk) (8)

- `DistributionConfig.CNAMEs` (list) [create, update]
- `DistributionConfig.CacheBehaviors.CachedMethods` (list) [create, update]
- `DistributionConfig.CustomOrigin` (structure) [create, update]
- `DistributionConfig.DefaultCacheBehavior.CachedMethods` (list) [create, update]
- `DistributionConfig.Restrictions.GeoRestriction.Locations` (list) [create, update]
- `DistributionConfig.S3Origin` (structure) [create, update]
- `Tags` (list)
- `DistributionConfig` (structure) [delete]

### SDK required members with no CFn source (synthesize in glue code) (4)

- `DistributionConfig.<DistributionConfig>.CallerReference` [create, update]
- `DistributionConfig.Restrictions.GeoRestriction.<GeoRestriction>.Quantity` [create, update]
- `<UpdateDistributionRequest>.Id` [update]
- `<DeleteDistributionRequest>.Id` [delete]


## AWS::CodeBuild::Project

Smithy model: `codebuild-2016-10-06.json` (sdkId: CodeBuild, cloudFormationName: CodeBuild)

| op | operation | source | other candidates |
|----|-----------|--------|------------------|
| create | CreateProject | verb-heuristic | — |
| update | UpdateProject | verb-heuristic | UpdateProjectVisibility |
| delete | DeleteProject | verb-heuristic | — |

**create coverage** (CreateProject): 96/99 CFn paths matched (97.0%).
**update coverage** (UpdateProject): 96/99 CFn paths matched (97.0%).
**delete coverage** (DeleteProject): 1/25 CFn paths matched (4.0%).

### Per-property sub-operations (multi-op resource idiom)

| CFn property | operation | inner coverage |
|--------------|-----------|----------------|
| Visibility | UpdateProjectVisibility | 1/1 (100%) |

### Case divergences auto-resolved (beyond Pascal->camel style flip) (1)

- `SecondarySources.BuildSpec` -> `buildspec` [create, update]

### Unmatched CFn paths (CFn-only field, wrong op, or silent-drop risk) (24)

- `ResourceAccessRole` (string)
- `Triggers` (structure)
- `Visibility` (string)
- `Artifacts` (structure) [delete]
- `AutoRetryLimit` (number) [delete]
- `BadgeEnabled` (boolean) [delete]
- `BuildBatchConfig` (structure) [delete]
- `Cache` (structure) [delete]
- `ConcurrentBuildLimit` (number) [delete]
- `Description` (string) [delete]
- `EncryptionKey` (string) [delete]
- `Environment` (structure) [delete]
- `FileSystemLocations` (list) [delete]
- `LogsConfig` (structure) [delete]
- `QueuedTimeoutInMinutes` (number) [delete]
- `SecondaryArtifacts` (list) [delete]
- `SecondarySourceVersions` (list) [delete]
- `SecondarySources` (list) [delete]
- `ServiceRole` (string) [delete]
- `Source` (structure) [delete]
- `SourceVersion` (string) [delete]
- `Tags` (list) [delete]
- `TimeoutInMinutes` (number) [delete]
- `VpcConfig` (structure) [delete]


## AWS::S3::Bucket

Smithy model: `s3-2006-03-01.json` (sdkId: S3, cloudFormationName: S3)

| op | operation | source | other candidates |
|----|-----------|--------|------------------|
| create | CreateBucket | handlers | PutBucketTagging, PutBucketAbac, PutBucketReplication, PutBucketWebsite, PutObjectAcl, GetBucketAcl |
| update | UpdateBucketMetadataJournalTableConfiguration | handlers | PutBucketAcl, PutBucketTagging, PutBucketAbac, PutBucketReplication, PutBucketWebsite, GetBucketMetadataTableConfiguration |
| delete | DeleteBucket | handlers | — |

**create coverage** (CreateBucket): 5/23 CFn paths matched (21.7%).
**update coverage** (UpdateBucketMetadataJournalTableConfiguration): 4/23 CFn paths matched (17.4%).
**delete coverage** (DeleteBucket): 4/23 CFn paths matched (17.4%).

### Per-property sub-operations (multi-op resource idiom)

| CFn property | operation | inner coverage |
|--------------|-----------|----------------|
| AccelerateConfiguration | PutBucketAccelerateConfiguration | 2/2 (100%) |
| AnalyticsConfigurations | PutBucketAnalyticsConfiguration | 0/1 (0%) |
| CorsConfiguration | PutBucketCors | 7/8 (88%) |
| IntelligentTieringConfigurations | PutBucketIntelligentTieringConfiguration | 1/6 (17%) |
| InventoryConfigurations | PutBucketInventoryConfiguration | 1/1 (100%) |
| LifecycleConfiguration | PutBucketLifecycleConfiguration | 17/28 (61%) |
| LoggingConfiguration | PutBucketLogging | 0/1 (0%) |
| MetricsConfigurations | PutBucketMetricsConfiguration | 0/1 (0%) |
| NotificationConfiguration | PutBucketNotificationConfiguration | 8/13 (62%) |
| ObjectLockConfiguration | PutObjectLockConfiguration | 7/7 (100%) |
| OwnershipControls | PutBucketOwnershipControls | 3/3 (100%) |
| PublicAccessBlockConfiguration | PutPublicAccessBlock | 5/5 (100%) |
| ReplicationConfiguration | PutBucketReplication | 33/35 (94%) |
| Tags | PutBucketTagging | 0/1 (0%) |
| VersioningConfiguration | PutBucketVersioning | 2/2 (100%) |
| WebsiteConfiguration | PutBucketWebsite | 16/16 (100%) |

### Rename candidates (need human confirmation) (5)

- `BucketEncryption` -> `Bucket` (object serialized to JSON string; fuzzy-matched to "Bucket" (overlap 0.38))
- `BucketName` -> `BucketNamespace` (fuzzy-matched to "BucketNamespace" (overlap 0.67))
- `BucketNamePrefix` -> `Bucket` (fuzzy-matched to "Bucket" (overlap 0.38))
- `ObjectLockEnabled` -> `ObjectLockEnabledForBucket` (fuzzy-matched to "ObjectLockEnabledForBucket" (overlap 0.65)) [create]
- `BucketNamespace` -> `Bucket` (fuzzy-matched to "Bucket" (overlap 0.40)) [update, delete]

### Unmatched CFn paths (CFn-only field, wrong op, or silent-drop risk) (19)

- `AbacStatus` (string)
- `AccelerateConfiguration` (structure)
- `AccessControl` (string)
- `AnalyticsConfigurations` (list)
- `CorsConfiguration` (structure)
- `IntelligentTieringConfigurations` (list)
- `InventoryConfigurations` (list)
- `LifecycleConfiguration` (structure)
- `LoggingConfiguration` (structure)
- `MetricsConfigurations` (list)
- `NotificationConfiguration` (structure)
- `ObjectLockConfiguration` (structure)
- `OwnershipControls` (structure)
- `PublicAccessBlockConfiguration` (structure)
- `ReplicationConfiguration` (structure)
- `Tags` (list)
- `VersioningConfiguration` (structure)
- `WebsiteConfiguration` (structure)
- `ObjectLockEnabled` (boolean) [update, delete]

### SDK required members with no CFn source (synthesize in glue code) (1)

- `<UpdateBucketMetadataJournalTableConfigurationRequest>.JournalTableConfiguration` [update]


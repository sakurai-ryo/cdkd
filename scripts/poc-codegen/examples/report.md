# PoC codegen report: CFn registry schema + Smithy model -> SDK input mappers

Generated over 6 resource type(s).

## AWS::CloudWatch::AnomalyDetector

Smithy model: `cloudwatch-2010-08-01.json` (sdkId: CloudWatch, cloudFormationName: CloudWatch)

| op | operation | source | other candidates |
|----|-----------|--------|------------------|
| create | PutAnomalyDetector | verb-heuristic | — |
| update | PutAnomalyDetector | verb-heuristic | — |
| delete | DeleteAnomalyDetector | verb-heuristic | — |

**create coverage** (PutAnomalyDetector): 35/35 auto-emitted.
**update coverage** (PutAnomalyDetector): 35/35 auto-emitted.
**delete coverage** (DeleteAnomalyDetector): 28/30 auto-emitted, 2 unmatched.

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

**create coverage** (CreateService): 135/137 auto-emitted, 1 candidate(s) (report-only), 1 unmatched.
**update coverage** (UpdateService): 130/137 auto-emitted, 2 candidate(s) (report-only), 1 unsupported, 4 unmatched.
**delete coverage** (DeleteService): 1/27 auto-emitted, 1 candidate(s) (report-only), 25 unmatched.

### Rename candidates (NOT emitted — need human confirmation via override table) (2)

- `PlacementStrategies` -> `placementStrategy` (fuzzy-matched to "placementStrategy" (overlap 0.84)) [create, update]
- `ServiceName` -> `service` (fuzzy-matched to "service" (overlap 0.64)) [update, delete]

### Type-incompatible same-name members (manual mapping) (1)

- `ForceNewDeployment` -> `forceNewDeployment`: type-incompatible: CFn structure vs SDK boolean [update]

### Unmatched CFn paths (CFn-only field, wrong op, or silent-drop risk) (25)

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
- `ServiceConnectConfiguration` (structure) [delete]
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

**create coverage** (RegisterTaskDefinition): 157/158 auto-emitted, 1 candidate(s) (report-only).
**delete coverage** (DeregisterTaskDefinition): 0/18 auto-emitted, 18 unmatched.

### Case divergences auto-resolved (beyond Pascal->camel style flip) (5)

- `Volumes.EFSVolumeConfiguration` -> `efsVolumeConfiguration` [create]
- `Volumes.EFSVolumeConfiguration.AuthorizationConfig.IAM` -> `iam` [create]
- `Volumes.EFSVolumeConfiguration.FilesystemId` -> `fileSystemId` [create]
- `Volumes.FSxWindowsFileServerVolumeConfiguration` -> `fsxWindowsFileServerVolumeConfiguration` [create]
- `Volumes.S3FilesVolumeConfiguration` -> `s3filesVolumeConfiguration` [create]

### Rename candidates (NOT emitted — need human confirmation via override table) (1)

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

**create coverage** (CreateDistribution): 145/154 auto-emitted, 2 candidate(s) (report-only), 7 unmatched.
**update coverage** (UpdateDistribution): 145/154 auto-emitted, 2 candidate(s) (report-only), 7 unmatched.
**delete coverage** (DeleteDistribution): 0/2 auto-emitted, 2 unmatched.

### Case divergences auto-resolved (beyond Pascal->camel style flip) (4)

- `DistributionConfig.Origins.CustomOriginConfig.OriginSSLProtocols` -> `OriginSslProtocols` [create, update]
- `DistributionConfig.ViewerCertificate.AcmCertificateArn` -> `ACMCertificateArn` [create, update]
- `DistributionConfig.ViewerCertificate.IamCertificateId` -> `IAMCertificateId` [create, update]
- `DistributionConfig.ViewerCertificate.SslSupportMethod` -> `SSLSupportMethod` [create, update]

### Rename candidates (NOT emitted — need human confirmation via override table) (2)

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

**create coverage** (CreateProject): 95/99 auto-emitted, 1 version-skew (not emitted), 3 unmatched.
**update coverage** (UpdateProject): 95/99 auto-emitted, 1 version-skew (not emitted), 3 unmatched.
**delete coverage** (DeleteProject): 1/25 auto-emitted, 24 unmatched.

### Per-property sub-operations (multi-op resource idiom)

| CFn property | operation | inner coverage |
|--------------|-----------|----------------|
| Visibility | UpdateProjectVisibility | 0/1 auto-emitted, 1 candidate(s) (report-only) |

### Case divergences auto-resolved (beyond Pascal->camel style flip) (1)

- `SecondarySources.BuildSpec` -> `buildspec` [create, update]

### Rename candidates (NOT emitted — need human confirmation via override table) (1)

- `Visibility` -> `projectVisibility` (fuzzy-matched to "projectVisibility" (overlap 0.59)) [sub-op:UpdateProjectVisibility]

### Members absent from the installed SDK (version skew — NOT emitted) (1)

- `Environment.HostKernel` -> `hostKernel` [create, update]

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

### SDK required members with no CFn source (synthesize in glue code) (1)

- `<UpdateProjectVisibilityInput>.projectArn` [sub-op:UpdateProjectVisibility]


## AWS::S3::Bucket

Smithy model: `s3-2006-03-01.json` (sdkId: S3, cloudFormationName: S3)

| op | operation | source | other candidates |
|----|-----------|--------|------------------|
| create | CreateBucket | handlers | PutBucketTagging, PutBucketAbac, PutBucketReplication, PutBucketWebsite, PutObjectAcl, GetBucketAcl |
| update | UpdateBucketMetadataJournalTableConfiguration | handlers | PutBucketAcl, PutBucketTagging, PutBucketAbac, PutBucketReplication, PutBucketWebsite, GetBucketMetadataTableConfiguration |
| delete | DeleteBucket | handlers | — |

**create coverage** (CreateBucket): 1/25 auto-emitted, 2 candidate(s) (report-only), 1 collision(s), 21 unmatched.
**update coverage** (UpdateBucketMetadataJournalTableConfiguration): 0/25 auto-emitted, 1 candidate(s) (report-only), 2 collision(s), 22 unmatched.
**delete coverage** (DeleteBucket): 0/25 auto-emitted, 1 candidate(s) (report-only), 2 collision(s), 22 unmatched.

### Per-property sub-operations (multi-op resource idiom)

| CFn property | operation | inner coverage |
|--------------|-----------|----------------|
| AccelerateConfiguration | PutBucketAccelerateConfiguration | 1/2 auto-emitted, 1 candidate(s) (report-only) |
| AnalyticsConfigurations | PutBucketAnalyticsConfiguration | 0/1 auto-emitted, 1 unmatched |
| BucketEncryption | PutBucketEncryption | 0/1 auto-emitted, 1 unmatched |
| CorsConfiguration | PutBucketCors | 6/8 auto-emitted, 1 candidate(s) (report-only), 1 unmatched |
| IntelligentTieringConfigurations | PutBucketIntelligentTieringConfiguration | 0/6 auto-emitted, 1 candidate(s) (report-only), 5 unmatched |
| InventoryConfigurations | PutBucketInventoryConfiguration | 0/1 auto-emitted, 1 candidate(s) (report-only) |
| LifecycleConfiguration | PutBucketLifecycleConfiguration | 15/28 auto-emitted, 13 unmatched |
| LoggingConfiguration | PutBucketLogging | 0/1 auto-emitted, 1 unmatched |
| MetadataConfiguration | CreateBucketMetadataConfiguration | 14/22 auto-emitted, 1 version-skew (not emitted), 7 unmatched |
| MetadataTableConfiguration | CreateBucketMetadataTableConfiguration | 4/6 auto-emitted, 1 collision(s), 1 unmatched |
| MetricsConfigurations | PutBucketMetricsConfiguration | 0/1 auto-emitted, 1 unmatched |
| NotificationConfiguration | PutBucketNotificationConfiguration | 6/13 auto-emitted, 2 candidate(s) (report-only), 5 unmatched |
| ObjectLockConfiguration | PutObjectLockConfiguration | 7/7 auto-emitted |
| OwnershipControls | PutBucketOwnershipControls | 3/3 auto-emitted |
| PublicAccessBlockConfiguration | PutPublicAccessBlock | 5/5 auto-emitted |
| ReplicationConfiguration | PutBucketReplication | 33/35 auto-emitted, 2 unmatched |
| Tags | PutBucketTagging | 0/1 auto-emitted, 1 unmatched |
| VersioningConfiguration | PutBucketVersioning | 2/2 auto-emitted |
| WebsiteConfiguration | PutBucketWebsite | 12/16 auto-emitted, 2 candidate(s) (report-only), 2 unsupported |

### Case divergences auto-resolved (beyond Pascal->camel style flip) (5)

- `CorsConfiguration` -> `CORSConfiguration` [sub-op:PutBucketCors]
- `CorsConfiguration.CorsRules` -> `CORSRules` [sub-op:PutBucketCors]
- `CorsConfiguration.CorsRules.Id` -> `ID` [sub-op:PutBucketCors]
- `LifecycleConfiguration.Rules.Id` -> `ID` [sub-op:PutBucketLifecycleConfiguration]
- `ReplicationConfiguration.Rules.Id` -> `ID` [sub-op:PutBucketReplication]

### Rename candidates (NOT emitted — need human confirmation via override table) (11)

- `BucketNamePrefix` -> `Bucket` (fuzzy-matched to "Bucket" (overlap 0.38)) [create]
- `ObjectLockEnabled` -> `ObjectLockEnabledForBucket` (fuzzy-matched to "ObjectLockEnabledForBucket" (overlap 0.65)) [create]
- `BucketName` -> `Bucket` (fuzzy-matched to "Bucket" (overlap 0.60)) [update, delete]
- `AccelerateConfiguration.AccelerationStatus` -> `Status` (fuzzy-matched to "Status" (overlap 0.33)) [sub-op:PutBucketAccelerateConfiguration]
- `CorsConfiguration.CorsRules.MaxAge` -> `MaxAgeSeconds` (fuzzy-matched to "MaxAgeSeconds" (overlap 0.46)) [sub-op:PutBucketCors]
- `IntelligentTieringConfigurations` -> `IntelligentTieringConfiguration` (wraps into .Tierings; wrapper has additional required member(s) not derivable from the array: Id, Status; fuzzy-matched to "IntelligentTieringConfiguration" (overlap 0.97)) [sub-op:PutBucketIntelligentTieringConfiguration]
- `InventoryConfigurations` -> `InventoryConfiguration` (wraps into .OptionalFields; wrapper has additional required member(s) not derivable from the array: Destination, IsEnabled, Id, IncludedObjectVersions, Schedule; fuzzy-matched to "InventoryConfiguration" (overlap 0.96)) [sub-op:PutBucketInventoryConfiguration]
- `NotificationConfiguration.QueueConfigurations.Queue` -> `QueueArn` (fuzzy-matched to "QueueArn" (overlap 0.63)) [sub-op:PutBucketNotificationConfiguration]
- `NotificationConfiguration.TopicConfigurations.Topic` -> `TopicArn` (fuzzy-matched to "TopicArn" (overlap 0.63)) [sub-op:PutBucketNotificationConfiguration]
- `WebsiteConfiguration.RoutingRules.RedirectRule` -> `Redirect` (fuzzy-matched to "Redirect" (overlap 0.67)) [sub-op:PutBucketWebsite]
- `WebsiteConfiguration.RoutingRules.RoutingRuleCondition` -> `Condition` (fuzzy-matched to "Condition" (overlap 0.45)) [sub-op:PutBucketWebsite]

### Collisions: two CFn properties on one SDK member (losers NOT emitted) (4)

- `BucketName` -> `BucketNamespace`: fuzzy-matched to "BucketNamespace" (overlap 0.67); collides with 'BucketNamespace' on SDK member 'BucketNamespace' — NOT emitted; needs an override-table decision [create]
- `BucketNamePrefix` -> `Bucket`: fuzzy-matched to "Bucket" (overlap 0.38); collides with 'BucketName' on SDK member 'Bucket' — NOT emitted; needs an override-table decision [update, delete]
- `BucketNamespace` -> `Bucket`: fuzzy-matched to "Bucket" (overlap 0.40); collides with 'BucketName' on SDK member 'Bucket' — NOT emitted; needs an override-table decision [update, delete]
- `MetadataTableConfiguration.S3TablesDestination.TableNamespace` -> `TableName`: fuzzy-matched to "TableName" (overlap 0.64); collides with 'TableName' on SDK member 'TableName' — NOT emitted; needs an override-table decision [sub-op:CreateBucketMetadataTableConfiguration]

### Members absent from the installed SDK (version skew — NOT emitted) (1)

- `MetadataConfiguration.AnnotationTableConfiguration` -> `AnnotationTableConfiguration` [sub-op:CreateBucketMetadataConfiguration]

### Type-incompatible same-name members (manual mapping) (2)

- `WebsiteConfiguration.ErrorDocument` -> `ErrorDocument`: type-incompatible: CFn string vs SDK structure [sub-op:PutBucketWebsite]
- `WebsiteConfiguration.IndexDocument` -> `IndexDocument`: type-incompatible: CFn string vs SDK structure [sub-op:PutBucketWebsite]

### Unmatched CFn paths (CFn-only field, wrong op, or silent-drop risk) (56)

- `AbacStatus` (string)
- `AccelerateConfiguration` (structure)
- `AccessControl` (string)
- `AnalyticsConfigurations` (list) [create, update, delete, sub-op:PutBucketAnalyticsConfiguration]
- `BucketEncryption` (structure) [create, update, delete, sub-op:PutBucketEncryption]
- `CorsConfiguration` (structure)
- `IntelligentTieringConfigurations` (list)
- `InventoryConfigurations` (list)
- `LifecycleConfiguration` (structure)
- `LoggingConfiguration` (structure) [create, update, delete, sub-op:PutBucketLogging]
- `MetadataConfiguration` (structure)
- `MetadataTableConfiguration` (structure)
- `MetricsConfigurations` (list) [create, update, delete, sub-op:PutBucketMetricsConfiguration]
- `NotificationConfiguration` (structure)
- `ObjectLockConfiguration` (structure)
- `OwnershipControls` (structure)
- `PublicAccessBlockConfiguration` (structure)
- `ReplicationConfiguration` (structure)
- `Tags` (list) [create, update, delete, sub-op:PutBucketTagging]
- `VersioningConfiguration` (structure)
- `WebsiteConfiguration` (structure)
- `ObjectLockEnabled` (boolean) [update, delete]
- `CorsConfiguration.CorsRules.ExposedHeaders` (list) [sub-op:PutBucketCors]
- `IntelligentTieringConfigurations.Id` (string) [sub-op:PutBucketIntelligentTieringConfiguration]
- `IntelligentTieringConfigurations.Prefix` (string) [sub-op:PutBucketIntelligentTieringConfiguration]
- `IntelligentTieringConfigurations.Status` (string) [sub-op:PutBucketIntelligentTieringConfiguration]
- `IntelligentTieringConfigurations.TagFilters` (list) [sub-op:PutBucketIntelligentTieringConfiguration]
- `IntelligentTieringConfigurations.Tierings` (list) [sub-op:PutBucketIntelligentTieringConfiguration]
- `LifecycleConfiguration.Rules.ExpirationDate` (string) [sub-op:PutBucketLifecycleConfiguration]
- `LifecycleConfiguration.Rules.ExpirationInDays` (number) [sub-op:PutBucketLifecycleConfiguration]
- `LifecycleConfiguration.Rules.ExpiredObjectDeleteMarker` (boolean) [sub-op:PutBucketLifecycleConfiguration]
- `LifecycleConfiguration.Rules.NoncurrentVersionExpirationInDays` (number) [sub-op:PutBucketLifecycleConfiguration]
- `LifecycleConfiguration.Rules.NoncurrentVersionTransition` (structure) [sub-op:PutBucketLifecycleConfiguration]
- `LifecycleConfiguration.Rules.NoncurrentVersionTransitions.TransitionInDays` (number) [sub-op:PutBucketLifecycleConfiguration]
- `LifecycleConfiguration.Rules.ObjectSizeGreaterThan` (string) [sub-op:PutBucketLifecycleConfiguration]
- `LifecycleConfiguration.Rules.ObjectSizeLessThan` (string) [sub-op:PutBucketLifecycleConfiguration]
- `LifecycleConfiguration.Rules.TagFilters` (list) [sub-op:PutBucketLifecycleConfiguration]
- `LifecycleConfiguration.Rules.Transition` (structure) [sub-op:PutBucketLifecycleConfiguration]
- `LifecycleConfiguration.Rules.Transitions.TransitionDate` (string) [sub-op:PutBucketLifecycleConfiguration]
- `LifecycleConfiguration.Rules.Transitions.TransitionInDays` (number) [sub-op:PutBucketLifecycleConfiguration]
- `LifecycleConfiguration.TransitionDefaultMinimumObjectSize` (string) [sub-op:PutBucketLifecycleConfiguration]
- `MetadataConfiguration.AnnotationTableConfiguration.TableArn` (string) [sub-op:CreateBucketMetadataConfiguration]
- `MetadataConfiguration.AnnotationTableConfiguration.TableName` (string) [sub-op:CreateBucketMetadataConfiguration]
- `MetadataConfiguration.Destination` (structure) [sub-op:CreateBucketMetadataConfiguration]
- `MetadataConfiguration.InventoryTableConfiguration.TableArn` (string) [sub-op:CreateBucketMetadataConfiguration]
- `MetadataConfiguration.InventoryTableConfiguration.TableName` (string) [sub-op:CreateBucketMetadataConfiguration]
- `MetadataConfiguration.JournalTableConfiguration.TableArn` (string) [sub-op:CreateBucketMetadataConfiguration]
- `MetadataConfiguration.JournalTableConfiguration.TableName` (string) [sub-op:CreateBucketMetadataConfiguration]
- `MetadataTableConfiguration.S3TablesDestination.TableArn` (string) [sub-op:CreateBucketMetadataTableConfiguration]
- `NotificationConfiguration.EventBridgeConfiguration.EventBridgeEnabled` (boolean) [sub-op:PutBucketNotificationConfiguration]
- `NotificationConfiguration.LambdaConfigurations` (list) [sub-op:PutBucketNotificationConfiguration]
- `NotificationConfiguration.QueueConfigurations.Event` (string) [sub-op:PutBucketNotificationConfiguration]
- `NotificationConfiguration.QueueConfigurations.Filter.S3Key` (structure) [sub-op:PutBucketNotificationConfiguration]
- `NotificationConfiguration.TopicConfigurations.Event` (string) [sub-op:PutBucketNotificationConfiguration]
- `ReplicationConfiguration.Rules.Filter.And.TagFilters` (list) [sub-op:PutBucketReplication]
- `ReplicationConfiguration.Rules.Filter.TagFilter` (structure) [sub-op:PutBucketReplication]

### SDK required members with no CFn source (synthesize in glue code) (33)

- `<UpdateBucketMetadataJournalTableConfigurationRequest>.JournalTableConfiguration` [update]
- `<PutBucketAccelerateConfigurationRequest>.Bucket` [sub-op:PutBucketAccelerateConfiguration]
- `<PutBucketAnalyticsConfigurationRequest>.Bucket` [sub-op:PutBucketAnalyticsConfiguration]
- `<PutBucketAnalyticsConfigurationRequest>.Id` [sub-op:PutBucketAnalyticsConfiguration]
- `<PutBucketAnalyticsConfigurationRequest>.AnalyticsConfiguration` [sub-op:PutBucketAnalyticsConfiguration]
- `<PutBucketEncryptionRequest>.Bucket` [sub-op:PutBucketEncryption]
- `<PutBucketEncryptionRequest>.ServerSideEncryptionConfiguration` [sub-op:PutBucketEncryption]
- `<PutBucketCorsRequest>.Bucket` [sub-op:PutBucketCors]
- `<PutBucketIntelligentTieringConfigurationRequest>.Bucket` [sub-op:PutBucketIntelligentTieringConfiguration]
- `<PutBucketIntelligentTieringConfigurationRequest>.Id` [sub-op:PutBucketIntelligentTieringConfiguration]
- `IntelligentTieringConfigurations.<Tiering>.Days` [sub-op:PutBucketIntelligentTieringConfiguration]
- `IntelligentTieringConfigurations.<Tiering>.AccessTier` [sub-op:PutBucketIntelligentTieringConfiguration]
- `<PutBucketInventoryConfigurationRequest>.Bucket` [sub-op:PutBucketInventoryConfiguration]
- `<PutBucketInventoryConfigurationRequest>.Id` [sub-op:PutBucketInventoryConfiguration]
- `<PutBucketLifecycleConfigurationRequest>.Bucket` [sub-op:PutBucketLifecycleConfiguration]
- `<PutBucketLoggingRequest>.Bucket` [sub-op:PutBucketLogging]
- `<PutBucketLoggingRequest>.BucketLoggingStatus` [sub-op:PutBucketLogging]
- `<CreateBucketMetadataConfigurationRequest>.Bucket` [sub-op:CreateBucketMetadataConfiguration]
- `<CreateBucketMetadataTableConfigurationRequest>.Bucket` [sub-op:CreateBucketMetadataTableConfiguration]
- `<PutBucketMetricsConfigurationRequest>.Bucket` [sub-op:PutBucketMetricsConfiguration]
- `<PutBucketMetricsConfigurationRequest>.Id` [sub-op:PutBucketMetricsConfiguration]
- `<PutBucketMetricsConfigurationRequest>.MetricsConfiguration` [sub-op:PutBucketMetricsConfiguration]
- `<PutBucketNotificationConfigurationRequest>.Bucket` [sub-op:PutBucketNotificationConfiguration]
- `NotificationConfiguration.QueueConfigurations.<QueueConfiguration>.Events` [sub-op:PutBucketNotificationConfiguration]
- `NotificationConfiguration.TopicConfigurations.<TopicConfiguration>.Events` [sub-op:PutBucketNotificationConfiguration]
- `<PutObjectLockConfigurationRequest>.Bucket` [sub-op:PutObjectLockConfiguration]
- `<PutBucketOwnershipControlsRequest>.Bucket` [sub-op:PutBucketOwnershipControls]
- `<PutPublicAccessBlockRequest>.Bucket` [sub-op:PutPublicAccessBlock]
- `<PutBucketReplicationRequest>.Bucket` [sub-op:PutBucketReplication]
- `<PutBucketTaggingRequest>.Bucket` [sub-op:PutBucketTagging]
- `<PutBucketTaggingRequest>.Tagging` [sub-op:PutBucketTagging]
- `<PutBucketVersioningRequest>.Bucket` [sub-op:PutBucketVersioning]
- `<PutBucketWebsiteRequest>.Bucket` [sub-op:PutBucketWebsite]


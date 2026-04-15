CREATE TABLE `analysisArtifacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` varchar(128) NOT NULL,
	`artifactType` varchar(64) NOT NULL,
	`label` varchar(255) NOT NULL,
	`relativePath` text NOT NULL,
	`sourcePath` text,
	`storageUrl` text,
	`storageKey` varchar(512),
	`mimeType` varchar(255),
	`sizeBytes` bigint unsigned,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `analysisArtifacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `analysisCommits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` varchar(128) NOT NULL,
	`repository` varchar(255) NOT NULL,
	`branch` varchar(128) NOT NULL DEFAULT 'main',
	`commitHash` varchar(64),
	`commitMessage` text,
	`status` enum('pending','running','completed','failed','skipped') NOT NULL DEFAULT 'pending',
	`detailsJson` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `analysisCommits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `analysisEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` varchar(128) NOT NULL,
	`eventType` varchar(64) NOT NULL DEFAULT 'info',
	`stage` varchar(128),
	`message` text,
	`progress` double,
	`payloadJson` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `analysisEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `analysisInsights` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` varchar(128) NOT NULL,
	`modelName` varchar(128),
	`riskLevel` varchar(64),
	`title` varchar(255),
	`summaryMarkdown` text NOT NULL,
	`summaryJson` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `analysisInsights_id` PRIMARY KEY(`id`),
	CONSTRAINT `analysisInsights_jobId_unique` UNIQUE(`jobId`)
);
--> statement-breakpoint
CREATE TABLE `analysisJobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` varchar(128) NOT NULL,
	`pipelineJobId` varchar(128),
	`sampleName` varchar(255) NOT NULL,
	`sourceArchiveName` varchar(255) NOT NULL,
	`sourceArchiveUrl` text,
	`sourceArchiveStorageKey` varchar(512),
	`focusFunction` varchar(255) NOT NULL,
	`focusTermsJson` json,
	`focusRegexesJson` json,
	`status` enum('queued','running','completed','failed','cancelled') NOT NULL DEFAULT 'queued',
	`progress` double NOT NULL DEFAULT 0,
	`stage` varchar(128) NOT NULL DEFAULT 'queued',
	`message` text,
	`pipelineBaseUrl` text,
	`pipelineJobPath` text,
	`resultPath` text,
	`errorMessage` text,
	`llmSummaryStatus` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
	`commitStatus` enum('pending','running','completed','failed','skipped') NOT NULL DEFAULT 'pending',
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`completedAt` timestamp,
	CONSTRAINT `analysisJobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `analysisJobs_jobId_unique` UNIQUE(`jobId`)
);

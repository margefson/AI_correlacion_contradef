ALTER TABLE `incidents` ADD `status` enum('open','in_progress','resolved') DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE `incidents` ADD `notes` text;--> statement-breakpoint
ALTER TABLE `incidents` ADD `resolvedAt` timestamp;
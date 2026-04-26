CREATE TABLE `incident_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`incidentId` int NOT NULL,
	`userId` int NOT NULL,
	`action` enum('status_changed','notes_updated','category_changed','risk_changed','created') NOT NULL,
	`fromValue` varchar(255),
	`toValue` varchar(255),
	`comment` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `incident_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `incidents` MODIFY COLUMN `category` enum('phishing','malware','brute_force','ddos','vazamento_de_dados','engenharia_social','unknown') NOT NULL DEFAULT 'unknown';
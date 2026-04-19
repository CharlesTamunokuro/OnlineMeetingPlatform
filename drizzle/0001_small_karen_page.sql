CREATE TABLE `meetings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`meetingId` varchar(32) NOT NULL,
	`hostId` int NOT NULL,
	`title` text,
	`status` enum('active','ended') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`endedAt` timestamp,
	CONSTRAINT `meetings_id` PRIMARY KEY(`id`),
	CONSTRAINT `meetings_meetingId_unique` UNIQUE(`meetingId`)
);
--> statement-breakpoint
CREATE TABLE `participants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`meetingId` int NOT NULL,
	`userId` int,
	`displayName` varchar(255) NOT NULL,
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	`leftAt` timestamp,
	`audioEnabled` int NOT NULL DEFAULT 1,
	`videoEnabled` int NOT NULL DEFAULT 1,
	CONSTRAINT `participants_id` PRIMARY KEY(`id`)
);

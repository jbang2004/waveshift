CREATE TABLE `media_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`videoId` integer,
	`status` text NOT NULL,
	`progress` integer DEFAULT 0,
	`uploadUrl` text,
	`uploadId` text,
	`fileSize` integer,
	`fileName` text,
	`mimeType` text,
	`workflowId` text,
	`workflowStatus` text,
	`videoUrl` text,
	`audioUrl` text,
	`transcriptionId` text,
	`error` text,
	`errorDetails` text,
	`createdAt` integer NOT NULL,
	`startedAt` integer,
	`completedAt` integer,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`videoId`) REFERENCES `videos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `transcription_segments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`transcriptionId` text NOT NULL,
	`sequence` integer NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`contentType` text NOT NULL,
	`speaker` text NOT NULL,
	`original` text NOT NULL,
	`translation` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`transcriptionId`) REFERENCES `transcriptions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `transcriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`taskId` text NOT NULL,
	`targetLanguage` text NOT NULL,
	`style` text NOT NULL,
	`model` text,
	`fileName` text,
	`fileSize` integer,
	`mimeType` text,
	`totalSegments` integer NOT NULL,
	`duration` integer,
	`startTime` text,
	`endTime` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`taskId`) REFERENCES `media_tasks`(`id`) ON UPDATE no action ON DELETE no action
);

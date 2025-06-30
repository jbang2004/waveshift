DROP TABLE `accounts`;--> statement-breakpoint
DROP TABLE `sessions`;--> statement-breakpoint
DROP TABLE `verification_tokens`;--> statement-breakpoint
ALTER TABLE `users` ADD `createdAt` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `updatedAt` integer NOT NULL;
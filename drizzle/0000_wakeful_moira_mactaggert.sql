CREATE TABLE `albums` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`title` text NOT NULL,
	`client` text NOT NULL,
	`date` text NOT NULL,
	`published` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `albums_token_unique` ON `albums` (`token`);--> statement-breakpoint
CREATE TABLE `attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`since` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`album` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`album`) REFERENCES `albums`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `selections` (
	`id` text PRIMARY KEY NOT NULL,
	`album` text NOT NULL,
	`name` text NOT NULL,
	`photos` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`album`) REFERENCES `albums`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`expires` integer NOT NULL
);

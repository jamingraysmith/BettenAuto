CREATE TABLE `hub_access` (
	`email` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`permissions` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);

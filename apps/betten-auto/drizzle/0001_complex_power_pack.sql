CREATE TABLE `hub_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hub_members` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`user_id` text NOT NULL,
	`read_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hub_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`sender_id` text NOT NULL,
	`body` text NOT NULL,
	`vehicle_vin` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hub_people` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`updated_at` text NOT NULL
);

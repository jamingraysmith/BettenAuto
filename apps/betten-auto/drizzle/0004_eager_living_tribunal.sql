CREATE TABLE `hub_bridge_nonces` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hub_customers` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	`actor` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hub_departments` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hub_identity_aliases` (
	`alias` text PRIMARY KEY NOT NULL,
	`canonical` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hub_info` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `hub_access` ADD `department_id` text DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE `hub_messages` ADD `customer_id` text;--> statement-breakpoint
ALTER TABLE `hub_messages` ADD `department_name` text;--> statement-breakpoint
ALTER TABLE `hub_people` ADD `department_id` text DEFAULT 'general' NOT NULL;
--> statement-breakpoint
INSERT INTO hub_departments(id,name) VALUES ('general','General'),('administration','Administration'),('sales','Sales'),('service','Service'),('detail','Detail'),('parts','Parts'),('management','Management');
--> statement-breakpoint
INSERT INTO hub_channels(id,title,created_at) SELECT 'dept:'||id,name||' Department',strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM hub_departments;

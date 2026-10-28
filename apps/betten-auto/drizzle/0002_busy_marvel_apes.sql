CREATE INDEX `hub_members_user_channel` ON `hub_members` (`user_id`,`channel_id`);--> statement-breakpoint
CREATE INDEX `hub_messages_channel_date` ON `hub_messages` (`channel_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `hub_messages_sender_date` ON `hub_messages` (`sender_id`,`created_at`);
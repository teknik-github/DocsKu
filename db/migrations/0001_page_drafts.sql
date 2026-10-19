ALTER TABLE "pages" ADD COLUMN "draft_title" text NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "draft_description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "draft_content" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "has_changes" boolean DEFAULT false NOT NULL;
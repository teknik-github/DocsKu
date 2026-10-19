ALTER TABLE "page_revisions" ADD COLUMN "cover_image" text;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "cover_image" text;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "draft_cover_image" text;
CREATE TYPE "public"."comment_status" AS ENUM('pending', 'approved', 'spam');--> statement-breakpoint
CREATE TABLE "page_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"parent_id" uuid,
	"author_name" text NOT NULL,
	"author_email" text,
	"body" text NOT NULL,
	"status" "comment_status" DEFAULT 'pending' NOT NULL,
	"is_staff" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "page_comments" ADD CONSTRAINT "page_comments_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_comments" ADD CONSTRAINT "page_comments_parent_id_page_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."page_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_comments_page_idx" ON "page_comments" USING btree ("page_id","status","created_at");--> statement-breakpoint
CREATE INDEX "page_comments_status_idx" ON "page_comments" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "page_comments_parent_idx" ON "page_comments" USING btree ("parent_id");
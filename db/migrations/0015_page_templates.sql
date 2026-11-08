CREATE TABLE "page_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"icon" text,
	"page_title" text DEFAULT '' NOT NULL,
	"page_description" text DEFAULT '' NOT NULL,
	"content" jsonb NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "page_templates" ADD CONSTRAINT "page_templates_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
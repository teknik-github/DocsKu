CREATE TABLE "doc_version_pages" (
	"version_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"content" jsonb NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "doc_version_pages_version_id_slug_pk" PRIMARY KEY("version_id","slug")
);
--> statement-breakpoint
CREATE TABLE "doc_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"navigation" jsonb NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doc_versions_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "doc_version_pages" ADD CONSTRAINT "doc_version_pages_version_id_doc_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."doc_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_versions" ADD CONSTRAINT "doc_versions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
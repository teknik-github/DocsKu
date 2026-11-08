CREATE TABLE "page_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"parent_id" uuid,
	"author_id" uuid,
	"quote" text DEFAULT '' NOT NULL,
	"body" text NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_reads" (
	"page_id" uuid NOT NULL,
	"day" date NOT NULL,
	"reads" integer DEFAULT 0 NOT NULL,
	"depth_25" integer DEFAULT 0 NOT NULL,
	"depth_50" integer DEFAULT 0 NOT NULL,
	"depth_75" integer DEFAULT 0 NOT NULL,
	"depth_100" integer DEFAULT 0 NOT NULL,
	"exits" integer DEFAULT 0 NOT NULL,
	"seconds" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "page_reads_page_id_day_pk" PRIMARY KEY("page_id","day")
);
--> statement-breakpoint
CREATE TABLE "search_clicks" (
	"query" text NOT NULL,
	"page_id" uuid NOT NULL,
	"day" date NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "search_clicks_query_page_id_day_pk" PRIMARY KEY("query","page_id","day")
);
--> statement-breakpoint
ALTER TABLE "page_notes" ADD CONSTRAINT "page_notes_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_notes" ADD CONSTRAINT "page_notes_parent_id_page_notes_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."page_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_notes" ADD CONSTRAINT "page_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_notes" ADD CONSTRAINT "page_notes_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_reads" ADD CONSTRAINT "page_reads_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_clicks" ADD CONSTRAINT "search_clicks_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_notes_page_idx" ON "page_notes" USING btree ("page_id","created_at");--> statement-breakpoint
CREATE INDEX "page_notes_parent_idx" ON "page_notes" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "page_reads_day_idx" ON "page_reads" USING btree ("day");--> statement-breakpoint
CREATE INDEX "search_clicks_day_idx" ON "search_clicks" USING btree ("day");
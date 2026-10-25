CREATE TABLE "page_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"helpful" boolean NOT NULL,
	"comment" text,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_views" (
	"page_id" uuid NOT NULL,
	"day" date NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "page_views_page_id_day_pk" PRIMARY KEY("page_id","day")
);
--> statement-breakpoint
CREATE TABLE "redirects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_path" text NOT NULL,
	"page_id" uuid,
	"to_url" text,
	"auto" boolean DEFAULT false NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"last_hit_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "redirects_from_path_unique" UNIQUE("from_path")
);
--> statement-breakpoint
CREATE TABLE "search_queries" (
	"query" text NOT NULL,
	"day" date NOT NULL,
	"searches" integer DEFAULT 0 NOT NULL,
	"misses" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "search_queries_query_day_pk" PRIMARY KEY("query","day")
);
--> statement-breakpoint
ALTER TABLE "page_feedback" ADD CONSTRAINT "page_feedback_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_views" ADD CONSTRAINT "page_views_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redirects" ADD CONSTRAINT "redirects_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_feedback_page_idx" ON "page_feedback" USING btree ("page_id","created_at");--> statement-breakpoint
CREATE INDEX "page_feedback_created_idx" ON "page_feedback" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "page_views_day_idx" ON "page_views" USING btree ("day");--> statement-breakpoint
CREATE INDEX "search_queries_day_idx" ON "search_queries" USING btree ("day");
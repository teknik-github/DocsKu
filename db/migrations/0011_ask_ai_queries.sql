CREATE TABLE "ask_ai_queries" (
	"query" text NOT NULL,
	"day" date NOT NULL,
	"asks" integer DEFAULT 0 NOT NULL,
	"misses" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ask_ai_queries_query_day_pk" PRIMARY KEY("query","day")
);
--> statement-breakpoint
CREATE INDEX "ask_ai_queries_day_idx" ON "ask_ai_queries" USING btree ("day");
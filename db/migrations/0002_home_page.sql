CREATE TYPE "public"."page_kind" AS ENUM('doc', 'home');--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "kind" "page_kind" DEFAULT 'doc' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "pages_one_home" ON "pages" USING btree ("kind") WHERE kind = 'home';
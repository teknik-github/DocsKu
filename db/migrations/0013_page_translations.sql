ALTER TABLE "pages" ADD COLUMN "locale" text DEFAULT 'id' NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "translation_of" uuid;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_translation_of_pages_id_fk" FOREIGN KEY ("translation_of") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pages_translation_locale" ON "pages" USING btree ("translation_of","locale") WHERE translation_of is not null;
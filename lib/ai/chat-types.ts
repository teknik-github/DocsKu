import type { JSONContent } from "@tiptap/core";
import type { PageSeo } from "@/lib/site-types";

/** Shapes shared by the AI Chat server (agent, storage) and the dashboard UI. */

export type CurrentPage = {
  id: string;
  kind: "doc" | "home";
  slug: string;
  status: string;
  title: string;
  description: string;
  seo: PageSeo;
  /** The page as Markdown (from the editor's working copy). */
  markdown: string;
};

export type Proposal = {
  id: string;
  kind: "new" | "edit";
  title?: string;
  description?: string;
  slug?: string;
  seo?: PageSeo;
  /** "replace" swaps the whole body, "append" adds to the end. */
  contentMode?: "replace" | "append";
  contentMarkdown?: string;
  contentDoc?: JSONContent;
  note?: string;
  /** New pages: navigation section suggested by the agent ("Tab › Section"). */
  section?: string;
  /** New pages: suggested publish time (ISO 8601), for content plans. */
  publishAt?: string;
};

export type ProposalState = Proposal & {
  status?: "applied" | "dismissed";
  draftId?: string;
  /** What applying a new-page proposal produced. */
  pageStatus?: "draft" | "published" | "scheduled";
  error?: string;
};

export type ChatMessage =
  | { id: string; role: "user"; content: string; createdAt: string }
  | {
      id: string;
      role: "assistant";
      content: string;
      tools: string[];
      proposals: ProposalState[];
      error?: string;
      model?: string;
      /** Tokens used for this reply; `cached` came from the provider's prompt cache. */
      usage?: { input: number; cached: number; output: number };
      createdAt: string;
    };

export type ConversationListItem = {
  id: string;
  title: string;
  pageId: string | null;
  pageTitle: string | null;
  updatedAt: string;
  messageCount: number;
};

export type Conversation = {
  id: string;
  title: string;
  pageId: string | null;
  model: string | null;
  messages: ChatMessage[];
  summary: string | null;
  compactedCount: number;
};

/** Events streamed by /admin/api/agent (newline-delimited JSON). */
export type AgentEvent =
  | { t: "conversation"; id: string; title: string; userMessageId: string; assistantMessageId: string }
  | { t: "compacted"; summary: string; count: number }
  | { t: "text"; v: string }
  | { t: "thinking" }
  | { t: "tool"; label: string }
  | { t: "proposal"; proposal: Proposal }
  | { t: "usage"; usage: { input: number; cached: number; output: number } }
  | { t: "error"; v: string };

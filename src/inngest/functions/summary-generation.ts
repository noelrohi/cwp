import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { article, episode, episodeSummary } from "@/server/db/schema";
import {
  generateArticleSummary,
  generateEpisodeSummary,
} from "@/server/lib/episode-summary";
import type { TranscriptData } from "@/types/transcript";
import { inngest } from "../client";

const GENERATE_EPISODE_SUMMARY_EVENT = "app/summary.episode.generate" as const;
const GENERATE_ARTICLE_SUMMARY_EVENT = "app/summary.article.generate" as const;

type GenerateEpisodeSummaryEvent = {
  pipelineRunId: string;
  userId: string;
  episodeId: string;
  force?: boolean;
};

type GenerateArticleSummaryEvent = {
  pipelineRunId: string;
  userId: string;
  articleId: string;
  force?: boolean;
};

export const generateEpisodeSummaryFunction = inngest.createFunction(
  { id: "summary-generate-episode" },
  { event: GENERATE_EPISODE_SUMMARY_EVENT },
  async ({ event, step, logger }) => {
    const {
      pipelineRunId,
      userId,
      episodeId,
      force = false,
    } = event.data as GenerateEpisodeSummaryEvent;

    logger.info(
      `Pipeline run ${pipelineRunId}: Generating summary for episode ${episodeId}`,
    );

    const episodeRecord = await step.run("load-episode", async () => {
      const result = await db.query.episode.findFirst({
        where: and(eq(episode.id, episodeId), eq(episode.userId, userId)),
        with: { summary: true },
      });
      return result ?? null;
    });

    if (!episodeRecord) {
      logger.error(
        `Pipeline run ${pipelineRunId}: episode ${episodeId} not found`,
      );
      return { status: "missing" } as const;
    }

    if (episodeRecord.summary && !force) {
      logger.info(
        `Pipeline run ${pipelineRunId}: episode ${episodeId} already has summary, skipping`,
      );
      return { status: "already-exists", summaryId: episodeRecord.summary.id };
    }

    if (!episodeRecord.transcriptUrl) {
      logger.error(
        `Pipeline run ${pipelineRunId}: episode ${episodeId} has no transcript URL`,
      );
      return { status: "no-transcript" } as const;
    }

    const summaryRecord = await step.run("generate-summary", async () => {
      const transcriptResponse = await fetch(episodeRecord.transcriptUrl!);
      if (!transcriptResponse.ok) {
        throw new Error("Failed to fetch transcript");
      }

      const transcript: TranscriptData = await transcriptResponse.json();
      const markdownContent = await generateEpisodeSummary(
        transcript,
        episodeRecord.title,
      );

      if (episodeRecord.summary && force) {
        await db
          .delete(episodeSummary)
          .where(eq(episodeSummary.id, episodeRecord.summary.id));
      }

      const summaryId = randomUUID();
      const [record] = await db
        .insert(episodeSummary)
        .values({
          id: summaryId,
          episodeId,
          markdownContent,
        })
        .returning();

      return record;
    });

    logger.info(
      `Pipeline run ${pipelineRunId}: episode ${episodeId} summary generated`,
    );

    return { status: "generated", summaryId: summaryRecord.id };
  },
);

export const generateArticleSummaryFunction = inngest.createFunction(
  { id: "summary-generate-article" },
  { event: GENERATE_ARTICLE_SUMMARY_EVENT },
  async ({ event, step, logger }) => {
    const {
      pipelineRunId,
      userId,
      articleId,
      force = false,
    } = event.data as GenerateArticleSummaryEvent;

    logger.info(
      `Pipeline run ${pipelineRunId}: Generating summary for article ${articleId}`,
    );

    const articleRecord = await step.run("load-article", async () => {
      const result = await db.query.article.findFirst({
        where: and(eq(article.id, articleId), eq(article.userId, userId)),
        with: { summary: true, transcriptChunks: true },
      });
      return result ?? null;
    });

    if (!articleRecord) {
      logger.error(
        `Pipeline run ${pipelineRunId}: article ${articleId} not found`,
      );
      return { status: "missing" } as const;
    }

    if (articleRecord.summary && !force) {
      logger.info(
        `Pipeline run ${pipelineRunId}: article ${articleId} already has summary, skipping`,
      );
      return { status: "already-exists", summaryId: articleRecord.summary.id };
    }

    if (
      !articleRecord.transcriptChunks ||
      articleRecord.transcriptChunks.length === 0
    ) {
      logger.error(
        `Pipeline run ${pipelineRunId}: article ${articleId} has no processed content`,
      );
      return { status: "no-content" } as const;
    }

    const summaryRecord = await step.run("generate-summary", async () => {
      const content = articleRecord
        .transcriptChunks!.map((chunk) => chunk.content)
        .join("\n\n");

      const markdownContent = await generateArticleSummary(
        content,
        articleRecord.title,
      );

      if (articleRecord.summary && force) {
        await db
          .delete(episodeSummary)
          .where(eq(episodeSummary.id, articleRecord.summary.id));
      }

      const summaryId = randomUUID();
      const [record] = await db
        .insert(episodeSummary)
        .values({
          id: summaryId,
          articleId,
          markdownContent,
        })
        .returning();

      return record;
    });

    logger.info(
      `Pipeline run ${pipelineRunId}: article ${articleId} summary generated`,
    );

    return { status: "generated", summaryId: summaryRecord.id };
  },
);

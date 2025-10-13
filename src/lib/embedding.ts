import { openai } from "@ai-sdk/openai";
import { embed, embedMany } from "ai";

export async function generateEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: openai.textEmbeddingModel("text-embedding-3-small"),
    value: text,
  });

  return embedding;
}

export async function generateEmbeddingBatch(
  texts: string[],
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  if (texts.length === 1) {
    const embedding = await generateEmbedding(texts[0]);
    return [embedding];
  }

  const { embeddings } = await embedMany({
    model: openai.textEmbeddingModel("text-embedding-3-small"),
    values: texts,
  });

  return embeddings;
}

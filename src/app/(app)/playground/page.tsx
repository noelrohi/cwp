"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  FileText,
  Loader2,
  Play,
  Podcast,
  Search,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { parseAsString, useQueryState } from "nuqs";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTRPC } from "@/server/trpc/client";
import type { TranscriptData } from "@/types/transcript";

export default function PlaygroundPage() {
  const trpc = useTRPC();
  const [episodeId] = useQueryState(
    "episodeId",
    parseAsString
      .withOptions({
        clearOnDefault: true,
      })
      .withDefault(""),
  );
  const [minWords, setMinWords] = useState(200);
  const [maxWords, setMaxWords] = useState(800);
  const [searchQuery, setSearchQuery] = useQueryState(
    "q",
    parseAsString.withDefault(""),
  );
  const [transcript, setTranscript] = useState<TranscriptData | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [similarChunks, setSimilarChunks] = useState<
    Array<{
      id: string;
      content: string;
      speaker: string | null;
      similarity: number;
    }>
  >([]);

  const {
    data: episode,
    isLoading,
    refetch,
  } = useQuery({
    ...trpc.episodes.get.queryOptions({
      episodeId,
    }),
    enabled: !!episodeId, // Only run query when episodeId exists and is not empty
  });

  const generateTranscript = useMutation(
    trpc.episodes.generateTranscript.mutationOptions({
      onSuccess: () => {
        toast.success("Transcript generated successfully!");
        refetch();
      },
      onError: (error) => {
        toast.error(`Failed to generate transcript: ${error.message}`);
      },
    }),
  );

  const chunkTranscript = useMutation(
    trpc.playground.chunkTranscript.mutationOptions({
      onSuccess: () => {
        toast.success("Transcript chunked successfully!");
      },
      onError: (error) => {
        toast.error(`Failed to chunk transcript: ${error.message}`);
      },
    }),
  );

  const findSimilarChunks = useMutation(
    trpc.playground.findSimilarChunks.mutationOptions({
      onSuccess: (data) => {
        console.log("Similarity results:", data);
        setSimilarChunks(data);
        toast.success("Found similar chunks!");
      },
      onError: (error) => {
        toast.error(`Failed to find similar chunks: ${error.message}`);
      },
    }),
  );

  const saveChunk = useMutation(
    trpc.playground.saveChunk.mutationOptions({
      onSuccess: () => {
        toast.success("Chunk saved for training context");
        savedChunksQuery.refetch();
      },
      onError: (error) => {
        toast.error(`Failed to save chunk: ${error.message}`);
      },
    }),
  );

  const removeSavedChunk = useMutation(
    trpc.playground.removeSavedChunk.mutationOptions({
      onSuccess: () => {
        toast.info("Chunk removed from training context");
        savedChunksQuery.refetch();
      },
      onError: (error) => {
        toast.error(`Failed to remove chunk: ${error.message}`);
      },
    }),
  );

  const skipChunk = useMutation(
    trpc.playground.skipChunk.mutationOptions({
      onSuccess: () => {
        toast.info("Chunk skipped - model will learn from this");
      },
      onError: (error) => {
        toast.error(`Failed to skip chunk: ${error.message}`);
      },
    }),
  );

  const savedChunksQuery = useQuery({
    ...trpc.playground.getSavedChunks.queryOptions(),
    enabled: true,
  });

  const fetchTranscript = useCallback(async (url: string) => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch transcript");
      }
      const jsonData = await response.json();
      setTranscript(jsonData);
    } catch (_error) {
      toast.error("Failed to load transcript");
    }
  }, []);

  useEffect(() => {
    if (transcript && transcriptRef.current) {
      transcriptRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [transcript]);

  const handleChunkTranscript = () => {
    if (!isEpisodeLoaded) {
      toast.error("No episode selected");
      return;
    }
    if (!episode?.transcriptUrl) {
      toast.error("No transcript available");
      return;
    }
    // Convert words to tokens (1 word ≈ 1.33 tokens)
    const minTokens = Math.round(minWords * 1.33);
    const maxTokens = Math.round(maxWords * 1.33);
    chunkTranscript.mutate({
      episodeId,
      minTokens,
      maxTokens,
    });
  };

  const handleSearchSimilar = () => {
    if (!isEpisodeLoaded) {
      toast.error("No episode selected");
      return;
    }
    if (!searchQuery.trim()) {
      toast.error("Please enter a search query");
      return;
    }
    console.log("Search query:", searchQuery);
    findSimilarChunks.mutate({
      query: searchQuery,
      episodeId,
    });
  };

  const handleSaveChunk = (chunkId: string) => {
    saveChunk.mutate({
      chunkId,
      query: searchQuery,
    });
  };

  const handleSkipChunk = (chunkId: string, isSaved: boolean = false) => {
    if (isSaved) {
      removeSavedChunk.mutate({
        chunkId,
      });
    } else {
      skipChunk.mutate({
        chunkId,
        query: searchQuery,
      });
    }
  };

  if (isLoading) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-8">
        <Link
          href="/podcasts"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground mb-6 hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Podcasts
        </Link>
        <Card className="w-full">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <CardTitle className="mb-2">Loading Episode</CardTitle>
            <CardDescription>
              Please wait while we fetch the episode details...
            </CardDescription>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!episodeId) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-8">
        <Link
          href="/podcasts"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground mb-6 hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Podcasts
        </Link>
        <Card className="w-full">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Podcast className="h-16 w-16 text-muted-foreground mb-6" />
            <CardTitle className="mb-2">No Episode Selected</CardTitle>
            <CardDescription className="text-center mb-6 max-w-md">
              Select an episode from your dashboard to start exploring
              transcripts, chunking content, and finding similar segments.
            </CardDescription>
            <Link href="/dashboard">
              <Button size="lg" className="gap-2">
                <Podcast className="h-4 w-4" />
                Go to Dashboard
              </Button>
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  const episodeData = episode;

  // Disable all functionality if no episode is loaded
  const isEpisodeLoaded = !!episode && !!episodeId;

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      {/* Back Navigation */}
      <Link
        href="/podcasts"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground mb-6 hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Podcasts
      </Link>

      {/* Episode Header */}
      <div className="flex gap-6 mb-8">
        {/* Episode Thumbnail */}
        {episodeData?.thumbnailUrl && (
          <div className="relative h-32 w-32 rounded-lg bg-muted flex-shrink-0 group">
            <Image
              src={episodeData.thumbnailUrl}
              alt={episodeData.title}
              className="h-full w-full rounded-lg object-cover"
              fill
            />
            {/* Play Button Overlay */}
            {episodeData?.audioUrl && (
              <a
                href={episodeData.audioUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200"
              >
                <div className="bg-white rounded-full p-3 shadow-lg hover:scale-110 transition-transform">
                  <Play className="h-6 w-6 text-black fill-current" />
                </div>
              </a>
            )}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold mb-3">{episode?.title}</h1>
          {/* Episode ID Input */}
          <div className="mb-4 text-muted-foreground text-sm">
            {episode?.podcast?.title}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 flex-wrap">
            {episodeData?.transcriptUrl && (
              <Button
                variant="outline"
                onClick={() =>
                  fetchTranscript(episodeData.transcriptUrl as string)
                }
                disabled={!isEpisodeLoaded}
              >
                <FileText className="h-4 w-4 mr-2" />
                Load Transcript
              </Button>
            )}
            {episodeData?.audioUrl && !episodeData?.transcriptUrl && (
              <Button
                variant="outline"
                onClick={() => generateTranscript.mutate({ episodeId })}
                disabled={generateTranscript.isPending || !isEpisodeLoaded}
              >
                <FileText className="h-4 w-4 mr-2" />
                {generateTranscript.isPending
                  ? "Generating Transcript..."
                  : "Generate Transcript"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Chunking Controls */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Transcript Chunking</CardTitle>
          <CardDescription>
            Break down the transcript into manageable chunks for processing and
            analysis.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
              <div>
                <Label htmlFor="minWords" className="text-sm font-medium">
                  Minimum Words per Chunk
                </Label>
                <Input
                  id="minWords"
                  type="number"
                  value={minWords}
                  onChange={(e) => setMinWords(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <div>
                <Label htmlFor="maxWords" className="text-sm font-medium">
                  Maximum Words per Chunk
                </Label>
                <Input
                  id="maxWords"
                  type="number"
                  value={maxWords}
                  onChange={(e) => setMaxWords(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>
            <Button
              onClick={handleChunkTranscript}
              disabled={
                chunkTranscript.isPending ||
                !episodeData?.transcriptUrl ||
                !isEpisodeLoaded
              }
              className="whitespace-nowrap"
            >
              {chunkTranscript.isPending ? "Chunking..." : "Start Chunking"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Similarity Search */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Similarity Search</CardTitle>
          <CardDescription>
            Search for specific content within the transcript and find similar
            segments.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Enter search query..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1"
            />
            <Button
              onClick={handleSearchSimilar}
              disabled={
                findSimilarChunks.isPending ||
                !searchQuery.trim() ||
                !isEpisodeLoaded
              }
            >
              <Search className="h-4 w-4 mr-2" />
              {findSimilarChunks.isPending ? "Searching..." : "Search"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Saved Chunks */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Saved Chunks for Training Context</CardTitle>
          <CardDescription>
            Chunks you've saved will be used to improve the model's
            understanding of your content.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {savedChunksQuery.data && savedChunksQuery.data.length > 0 ? (
            <div className="space-y-2">
              {savedChunksQuery.data.map((savedChunk, index) => (
                <div key={savedChunk.id} className="bg-muted/50 rounded-lg p-3">
                  <div className="flex justify-between items-start mb-2">
                    <div className="text-sm font-medium">
                      Saved Chunk {index + 1}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSkipChunk(savedChunk.chunkId, true)}
                      className="h-7 px-2 text-xs"
                    >
                      Remove
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground mb-1">
                    Query: {savedChunk.query}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {savedChunk.content.substring(0, 150)}...
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                No saved chunks yet. Search for content and save relevant chunks
                to build your training context.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader>
          <CardTitle>Similar Chunks</CardTitle>
          <CardDescription>
            Search results matching your query. Save relevant chunks to improve
            the model.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {similarChunks.length > 0 ? (
            <div className="space-y-4">
              {similarChunks.map((chunk, index) => (
                <div key={index} className="bg-muted/50 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div className="text-sm font-medium">
                      Similarity: {(chunk.similarity * 100).toFixed(1)}%
                    </div>
                    <div className="flex items-center gap-2">
                      {chunk.speaker && (
                        <div className="text-sm text-muted-foreground">
                          Speaker: {chunk.speaker}
                        </div>
                      )}
                      <div className="flex gap-1">
                        {savedChunksQuery.data?.some(
                          (saved) => saved.chunkId === chunk.id,
                        ) ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSkipChunk(chunk.id, true)}
                            className="h-7 px-2 text-xs"
                          >
                            Skip
                          </Button>
                        ) : (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSkipChunk(chunk.id, false)}
                              className="h-7 px-2 text-xs"
                            >
                              Skip
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSaveChunk(chunk.id)}
                              className="h-7 px-2 text-xs"
                            >
                              Save
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="text-sm">{chunk.content}</p>
                </div>
              ))}
            </div>
          ) : searchQuery ? (
            <div className="text-center py-8">
              <Search className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                No similar chunks found for "{searchQuery}". Try a different
                search query.
              </p>
            </div>
          ) : (
            <div className="text-center py-8">
              <Search className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Enter a search query above to find similar content in the
                transcript.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transcript Display */}
      {transcript && (
        <div ref={transcriptRef} className="mt-8 bg-muted/50 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Transcript Preview</h2>
          <div className="max-h-96 overflow-y-auto space-y-2">
            {transcript.slice(0, 10).map((utterance, index) => (
              <div key={index} className="text-sm">
                <span className="text-xs text-muted-foreground font-mono mr-2">
                  {Math.floor(utterance.start)}s
                </span>
                {utterance.speaker !== undefined && (
                  <span className="text-xs font-medium text-muted-foreground mr-2">
                    Speaker {utterance.speaker}:
                  </span>
                )}
                {utterance.transcript}
              </div>
            ))}
            {transcript.length > 10 && (
              <div className="text-xs text-muted-foreground text-center">
                ... and {transcript.length - 10} more utterances
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

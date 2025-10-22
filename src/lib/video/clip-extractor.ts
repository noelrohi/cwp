import {
  ALL_FORMATS,
  BlobSource,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_MEDIUM,
  StreamTarget,
  type StreamTargetChunk,
} from "mediabunny";

const CLIP_VIDEO_CODEC = "avc" as const;
const CLIP_AUDIO_CODEC = "aac" as const;
const CLIP_RESOLUTION_HEIGHT = 720;
const CLIP_BITRATE = QUALITY_MEDIUM;

/**
 * Extracts a video clip from a source video using Mediabunny
 * @param sourceVideoUrl - URL or Blob of the source video
 * @param startTime - Start time in seconds
 * @param endTime - End time in seconds
 * @returns ArrayBuffer of the extracted clip in MP4 format
 */
export async function extractVideoClip(
  sourceVideoUrl: string | Blob,
  startTime: number,
  endTime: number,
): Promise<ArrayBuffer> {
  console.log("[extractVideoClip] Starting extraction", {
    sourceType: typeof sourceVideoUrl,
    sourceUrl: typeof sourceVideoUrl === "string" ? sourceVideoUrl : "Blob",
    startTime,
    endTime,
  });

  // Fetch source video
  const sourceBlob =
    typeof sourceVideoUrl === "string"
      ? await fetchVideoAsBlob(sourceVideoUrl)
      : sourceVideoUrl;

  console.log("[extractVideoClip] Fetched blob", {
    size: sourceBlob.size,
    type: sourceBlob.type,
  });

  // Create input from blob
  const input = new Input({
    source: new BlobSource(sourceBlob),
    formats: ALL_FORMATS, // Support all formats (MP4, WebM, Matroska, etc.)
  });

  console.log("[extractVideoClip] Input created, checking format recognition");

  // Create output target (in-memory stream)
  const chunks: Uint8Array[] = [];
  const writableStream = new WritableStream<StreamTargetChunk>({
    write(chunk) {
      if (chunk.type === "write") {
        chunks.push(chunk.data);
      }
    },
  });
  const streamTarget = new StreamTarget(writableStream);

  const output = new Output({
    target: streamTarget,
    format: new Mp4OutputFormat({
      fastStart: "in-memory", // Optimize for streaming
    }),
  });

  // Create conversion with trim and quality settings
  console.log("[extractVideoClip] Creating conversion...");
  let conversion: Conversion;
  try {
    conversion = await Conversion.init({
      input,
      output,
      trim: {
        start: startTime,
        end: endTime,
      },
      video: {
        codec: CLIP_VIDEO_CODEC,
        bitrate: CLIP_BITRATE,
        height: CLIP_RESOLUTION_HEIGHT,
        // Preserve aspect ratio by only setting height
      },
      audio: {
        codec: CLIP_AUDIO_CODEC,
        bitrate: CLIP_BITRATE,
      },
    });
  } catch (error) {
    console.error("[extractVideoClip] Conversion.init failed:", error);
    // Try to get more information about the input format
    try {
      const format = await input.getFormat();
      console.error("[extractVideoClip] Detected format:", format.name);
    } catch (formatError) {
      console.error("[extractVideoClip] Could not detect format:", formatError);
    }
    throw error;
  }

  console.log("[extractVideoClip] Conversion created successfully");

  // Check if conversion is valid
  if (!conversion.isValid) {
    const errors = conversion.discardedTracks
      .map((t) => `${t.track.type}: ${t.reason}`)
      .join(", ");
    throw new Error(`Invalid conversion: ${errors}`);
  }

  // Execute conversion
  await conversion.execute();

  // Finalize output
  await output.finalize();

  // Combine chunks into single ArrayBuffer
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  // Dispose input to free resources
  input.dispose();

  return result.buffer;
}

/**
 * Generates a thumbnail from a video at a specific timestamp
 * @param sourceVideoUrl - URL or Blob of the source video
 * @param timestamp - Timestamp in seconds
 * @returns Blob of the thumbnail image (JPEG)
 */
export async function generateThumbnail(
  sourceVideoUrl: string | Blob,
  timestamp: number,
): Promise<Blob> {
  const sourceBlob =
    typeof sourceVideoUrl === "string"
      ? await fetchVideoAsBlob(sourceVideoUrl)
      : sourceVideoUrl;

  const input = new Input({
    source: new BlobSource(sourceBlob),
    formats: ALL_FORMATS,
  });

  // Get video track
  const videoTrack = await input.getPrimaryVideoTrack();
  if (!videoTrack) {
    throw new Error("No video track found in source");
  }

  // Use CanvasSink to render frame at timestamp
  const { CanvasSink } = await import("mediabunny");
  const canvasSink = new CanvasSink(videoTrack, {
    width: 1280, // Standard thumbnail width
    fit: "contain",
  });

  // Get canvas at timestamp
  const wrappedCanvas = await canvasSink.getCanvas(timestamp);
  if (!wrappedCanvas) {
    throw new Error(`No frame found at timestamp ${timestamp}`);
  }

  // Convert canvas to blob
  const canvas = wrappedCanvas.canvas;
  const thumbnailBlob = await new Promise<Blob>((resolve, reject) => {
    if (canvas instanceof HTMLCanvasElement) {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Failed to convert canvas to blob"));
        }
      }, "image/jpeg");
    } else if (canvas instanceof OffscreenCanvas) {
      canvas.convertToBlob({ type: "image/jpeg" }).then(resolve, reject);
    } else {
      reject(new Error("Unsupported canvas type"));
    }
  });

  // Dispose input
  input.dispose();

  return thumbnailBlob;
}

/**
 * Fetches a video from URL as a Blob
 * Handles YouTube URLs by extracting the direct video stream URL
 */
async function fetchVideoAsBlob(url: string): Promise<Blob> {
  // Check if this is a YouTube URL
  if (url.includes("youtube.com") || url.includes("youtu.be")) {
    return await fetchYouTubeVideoAsBlob(url);
  }

  console.log("[fetchVideoAsBlob] Fetching from URL:", url);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch video from ${url}: ${response.statusText}`,
    );
  }

  const blob = await response.blob();
  console.log("[fetchVideoAsBlob] Fetched blob:", {
    size: blob.size,
    type: blob.type,
  });

  return blob;
}

/**
 * Fetches a YouTube video as a Blob by getting the direct stream URL
 */
async function fetchYouTubeVideoAsBlob(url: string): Promise<Blob> {
  const { Innertube } = await import("youtubei.js");

  // Extract video ID from URL
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) {
    throw new Error(`Invalid YouTube URL: ${url}`);
  }

  console.log("[fetchYouTubeVideoAsBlob] Fetching video info for:", videoId);

  const youtube = await Innertube.create();
  const info = await youtube.getInfo(videoId);
  const formats = info.streaming_data?.formats || [];

  console.log("[fetchYouTubeVideoAsBlob] Available formats:", formats.length);

  // Find the best video+audio combined format
  const bestFormat = formats
    .filter((f) => f.has_video && f.has_audio && f.url)
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

  if (!bestFormat?.url) {
    throw new Error(
      "No suitable video+audio format found with URL. Video may require authentication or be restricted.",
    );
  }

  console.log("[fetchYouTubeVideoAsBlob] Using format:", {
    itag: bestFormat.itag,
    quality: bestFormat.quality_label,
    mimeType: bestFormat.mime_type,
    bitrate: bestFormat.bitrate,
  });

  console.log("[fetchYouTubeVideoAsBlob] Downloading from stream URL");

  // Fetch with proper headers that YouTube expects
  const response = await fetch(bestFormat.url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      Range: "bytes=0-", // Support range requests
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch YouTube video stream: ${response.status} ${response.statusText}`,
    );
  }

  const blob = await response.blob();
  console.log(
    `[fetchYouTubeVideoAsBlob] Downloaded ${blob.size} bytes from YouTube`,
  );

  return blob;
}

/**
 * Extracts YouTube video ID from various URL formats
 */
function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
    /youtube\.com\/embed\/([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  punctuated_word?: string;
  speaker?: number;
  speaker_confidence?: number;
  language?: string;
}

export interface TranscriptUtterance {
  start: number;
  end: number;
  confidence: number;
  channel: number;
  transcript: string;
  words: TranscriptWord[];
  speaker?: number;
  id: string;
}

export type TranscriptData = TranscriptUtterance[];

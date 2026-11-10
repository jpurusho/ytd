/**
 * Claude Analysis Service
 * AI-powered transcript analysis using Anthropic Claude
 */
import Anthropic from '@anthropic-ai/sdk';
import { getSetting } from './database';
import { logger } from './logger';

export interface AnalysisResult {
  summary?: string;
  chapters?: Array<{ timestamp: number; title: string; description: string }>;
  topics?: string[];
  answer?: string;
}

export class ClaudeAnalysisService {
  private client: Anthropic | null = null;

  /**
   * Initialize Claude client with API key from settings
   */
  private async getClient(): Promise<Anthropic | null> {
    if (this.client) return this.client;

    const apiKey = await getSetting('claude_api_key');
    if (!apiKey) {
      logger.warn('[Claude] No API key configured');
      return null;
    }

    this.client = new Anthropic({
      apiKey,
    });

    return this.client;
  }

  /**
   * Check if Claude API is available
   */
  async isAvailable(): Promise<boolean> {
    const apiKey = await getSetting('claude_api_key');
    return !!apiKey;
  }

  /**
   * Generate a summary of the transcript
   */
  async summarize(transcriptText: string, videoTitle: string): Promise<string> {
    const client = await this.getClient();
    if (!client) {
      throw new Error('Claude API key not configured. Add it in Settings.');
    }

    logger.info('[Claude] Generating summary', {
      textLength: transcriptText.length,
      title: videoTitle,
    });

    try {
      const message = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `You are analyzing a video transcript. Generate a concise summary.

Video Title: ${videoTitle}

Transcript:
${transcriptText}

Provide a 3-5 sentence summary covering the main topics and key takeaways.`,
          },
        ],
      });

      const summary = message.content[0].type === 'text' ? message.content[0].text : '';

      logger.info('[Claude] Summary generated', {
        summaryLength: summary.length,
        usage: message.usage,
      });

      return summary;
    } catch (error) {
      const err = error as Error;
      logger.error('[Claude] Summarization failed', { error: err });
      throw new Error(`Claude summarization failed: ${err.message}`);
    }
  }

  /**
   * Generate chapter markers with timestamps
   */
  async generateChapters(
    transcriptText: string,
    segments: Array<{ start: number; end: number; text: string }>,
    videoTitle: string
  ): Promise<Array<{ timestamp: number; title: string; description: string }>> {
    const client = await this.getClient();
    if (!client) {
      throw new Error('Claude API key not configured. Add it in Settings.');
    }

    logger.info('[Claude] Generating chapters', {
      textLength: transcriptText.length,
      segmentCount: segments.length,
    });

    try {
      const message = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: `You are analyzing a video transcript to create chapter markers.

Video Title: ${videoTitle}

Transcript with timestamps:
${segments.map(s => `[${formatTime(s.start)}] ${s.text}`).join('\n')}

Generate 5-10 chapter markers with:
1. Timestamp (in seconds)
2. Chapter title (short, descriptive)
3. Brief description

Format as JSON array:
[{"timestamp": 0, "title": "Introduction", "description": "Overview of the topic"}]`,
          },
        ],
      });

      const content = message.content[0].type === 'text' ? message.content[0].text : '';

      // Extract JSON from response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('Failed to parse chapters from Claude response');
      }

      const chapters = JSON.parse(jsonMatch[0]);

      logger.info('[Claude] Chapters generated', {
        chapterCount: chapters.length,
        usage: message.usage,
      });

      return chapters;
    } catch (error) {
      const err = error as Error;
      logger.error('[Claude] Chapter generation failed', { error: err });
      throw new Error(`Chapter generation failed: ${err.message}`);
    }
  }

  /**
   * Answer a question about the transcript
   */
  async askQuestion(transcriptText: string, question: string, videoTitle: string): Promise<string> {
    const client = await this.getClient();
    if (!client) {
      throw new Error('Claude API key not configured. Add it in Settings.');
    }

    logger.info('[Claude] Answering question', {
      question,
      textLength: transcriptText.length,
    });

    try {
      const message = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `You are analyzing a video transcript to answer questions.

Video Title: ${videoTitle}

Transcript:
${transcriptText}

Question: ${question}

Answer the question based on the transcript. If the answer isn't in the transcript, say so.`,
          },
        ],
      });

      const answer = message.content[0].type === 'text' ? message.content[0].text : '';

      logger.info('[Claude] Question answered', {
        answerLength: answer.length,
        usage: message.usage,
      });

      return answer;
    } catch (error) {
      const err = error as Error;
      logger.error('[Claude] Q&A failed', { error: err });
      throw new Error(`Q&A failed: ${err.message}`);
    }
  }

  /**
   * Extract key topics from transcript
   */
  async extractTopics(transcriptText: string, videoTitle: string): Promise<string[]> {
    const client = await this.getClient();
    if (!client) {
      throw new Error('Claude API key not configured. Add it in Settings.');
    }

    logger.info('[Claude] Extracting topics', {
      textLength: transcriptText.length,
    });

    try {
      const message = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 512,
        messages: [
          {
            role: 'user',
            content: `You are analyzing a video transcript.

Video Title: ${videoTitle}

Transcript:
${transcriptText}

Extract 5-10 key topics/themes discussed in this video. Return as a JSON array of strings.
Format: ["topic1", "topic2", "topic3"]`,
          },
        ],
      });

      const content = message.content[0].type === 'text' ? message.content[0].text : '';

      // Extract JSON from response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('Failed to parse topics from Claude response');
      }

      const topics = JSON.parse(jsonMatch[0]);

      logger.info('[Claude] Topics extracted', {
        topicCount: topics.length,
        usage: message.usage,
      });

      return topics;
    } catch (error) {
      const err = error as Error;
      logger.error('[Claude] Topic extraction failed', { error: err });
      throw new Error(`Topic extraction failed: ${err.message}`);
    }
  }
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Singleton instance
export const claudeAnalysisService = new ClaudeAnalysisService();

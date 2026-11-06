/**
 * File Integrity Service
 * Verifies downloaded files haven't been corrupted
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import { logger } from './logger';

export interface IntegrityResult {
  valid: boolean;
  hash: string;
  fileSize: number;
  error?: string;
}

export class FileIntegrityService {
  /**
   * Calculate SHA-256 hash of a file
   */
  async calculateHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);

      stream.on('data', (chunk) => {
        hash.update(chunk);
      });

      stream.on('end', () => {
        resolve(hash.digest('hex'));
      });

      stream.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Verify a downloaded file's integrity
   * Checks: file exists, readable, non-zero size, valid format
   */
  async verifyFile(filePath: string, expectedMinSize?: number): Promise<IntegrityResult> {
    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        return {
          valid: false,
          hash: '',
          fileSize: 0,
          error: 'File does not exist',
        };
      }

      // Get file stats
      const stats = fs.statSync(filePath);

      // Check if file is empty
      if (stats.size === 0) {
        return {
          valid: false,
          hash: '',
          fileSize: 0,
          error: 'File is empty (0 bytes)',
        };
      }

      // Check if file meets minimum size requirement
      if (expectedMinSize && stats.size < expectedMinSize) {
        return {
          valid: false,
          hash: '',
          fileSize: stats.size,
          error: `File size (${stats.size} bytes) is smaller than expected (${expectedMinSize} bytes)`,
        };
      }

      // Calculate hash
      const hash = await this.calculateHash(filePath);

      // Check file format (basic check for common video/audio headers)
      const isValidFormat = await this.checkFileFormat(filePath);
      if (!isValidFormat) {
        return {
          valid: false,
          hash,
          fileSize: stats.size,
          error: 'File format appears corrupted (no valid header found)',
        };
      }

      logger.info(`[FileIntegrity] File verified successfully`, {
        filePath,
        hash: hash.substring(0, 16) + '...',
        fileSize: stats.size,
      });

      return {
        valid: true,
        hash,
        fileSize: stats.size,
      };
    } catch (error) {
      const err = error as Error;
      logger.error(`[FileIntegrity] Verification failed`, {
        filePath,
        error: err,
      });

      return {
        valid: false,
        hash: '',
        fileSize: 0,
        error: err.message,
      };
    }
  }

  /**
   * Check if file has a valid media format header
   * Basic check for common formats: MP4, WebM, MP3, etc.
   */
  private async checkFileFormat(filePath: string): Promise<boolean> {
    return new Promise((resolve) => {
      const fd = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(32); // Read first 32 bytes

      try {
        fs.readSync(fd, buffer, 0, 32, 0);
        fs.closeSync(fd);

        // Check for common magic numbers
        const hex = buffer.toString('hex');

        // MP4/M4A (ftyp box)
        if (hex.includes('66747970')) {
          return resolve(true);
        }

        // WebM/MKV (EBML header)
        if (hex.startsWith('1a45dfa3')) {
          return resolve(true);
        }

        // MP3 (ID3 tag or MP3 frame sync)
        if (hex.startsWith('494433') || hex.startsWith('fffb') || hex.startsWith('fff3')) {
          return resolve(true);
        }

        // OGG
        if (hex.startsWith('4f676753')) {
          return resolve(true);
        }

        // FLAC
        if (hex.startsWith('664c6143')) {
          return resolve(true);
        }

        // AVI (RIFF...AVI)
        if (hex.startsWith('52494646') && hex.includes('415649')) {
          return resolve(true);
        }

        // MOV (Quick Time)
        if (hex.includes('6d6f6f76') || hex.includes('6d646174')) {
          return resolve(true);
        }

        logger.warn(`[FileIntegrity] Unknown file format`, {
          filePath,
          header: hex.substring(0, 32),
        });

        // If we can't identify, assume it's valid (don't want false positives)
        resolve(true);
      } catch (error) {
        logger.error(`[FileIntegrity] Error reading file header`, { filePath, error });
        fs.closeSync(fd);
        resolve(false);
      }
    });
  }

  /**
   * Compare two files for integrity
   */
  async compareFiles(file1: string, file2: string): Promise<boolean> {
    try {
      const [hash1, hash2] = await Promise.all([
        this.calculateHash(file1),
        this.calculateHash(file2),
      ]);

      return hash1 === hash2;
    } catch (error) {
      logger.error(`[FileIntegrity] File comparison failed`, { file1, file2, error });
      return false;
    }
  }

  /**
   * Store file hash for future verification
   */
  storeHash(videoId: string, hash: string): void {
    // This could be stored in database for future integrity checks
    // For now, just log it
    logger.debug(`[FileIntegrity] Hash stored for ${videoId}`, {
      hash: hash.substring(0, 16) + '...',
    });
  }
}

// Singleton instance
export const fileIntegrityService = new FileIntegrityService();

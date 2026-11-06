/**
 * Disk Space Service
 * Check available disk space before downloads
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger } from './logger';

export interface DiskSpaceInfo {
  available: number; // bytes
  total: number; // bytes
  used: number; // bytes
  percentUsed: number;
}

export class DiskSpaceService {
  /**
   * Get disk space information for a given path
   */
  async getDiskSpace(targetPath: string): Promise<DiskSpaceInfo> {
    const platform = os.platform();

    try {
      if (platform === 'darwin' || platform === 'linux') {
        return this.getDiskSpaceUnix(targetPath);
      } else if (platform === 'win32') {
        return this.getDiskSpaceWindows(targetPath);
      } else {
        throw new Error(`Unsupported platform: ${platform}`);
      }
    } catch (error) {
      logger.error(`[DiskSpace] Failed to get disk space for ${targetPath}`, { error });
      throw error;
    }
  }

  /**
   * Get disk space on Unix-like systems (macOS, Linux)
   */
  private getDiskSpaceUnix(targetPath: string): DiskSpaceInfo {
    // Use df command to get disk space
    const command = `df -k "${targetPath}" | tail -1`;
    const output = execSync(command, { encoding: 'utf-8' });

    // Parse output: Filesystem  1K-blocks    Used Available Use% Mounted
    const parts = output.trim().split(/\s+/);
    const total = parseInt(parts[1], 10) * 1024; // Convert KB to bytes
    const used = parseInt(parts[2], 10) * 1024;
    const available = parseInt(parts[3], 10) * 1024;
    const percentUsed = parseInt(parts[4].replace('%', ''), 10);

    return { available, total, used, percentUsed };
  }

  /**
   * Get disk space on Windows
   */
  private getDiskSpaceWindows(targetPath: string): DiskSpaceInfo {
    // Get drive letter
    const drive = path.parse(targetPath).root;

    // Use wmic command
    const command = `wmic logicaldisk where "DeviceID='${drive.replace('\\', '')}'" get Size,FreeSpace /format:list`;
    const output = execSync(command, { encoding: 'utf-8' });

    // Parse output
    const freeMatch = output.match(/FreeSpace=(\d+)/);
    const sizeMatch = output.match(/Size=(\d+)/);

    if (!freeMatch || !sizeMatch) {
      throw new Error('Failed to parse Windows disk space output');
    }

    const available = parseInt(freeMatch[1], 10);
    const total = parseInt(sizeMatch[1], 10);
    const used = total - available;
    const percentUsed = Math.round((used / total) * 100);

    return { available, total, used, percentUsed };
  }

  /**
   * Check if there's enough space for a download
   * Returns true if sufficient, false otherwise
   */
  async hasEnoughSpace(
    targetPath: string,
    requiredBytes: number,
    bufferPercentage: number = 10
  ): Promise<{ hasSpace: boolean; available: number; required: number; message?: string }> {
    try {
      const diskSpace = await this.getDiskSpace(targetPath);

      // Add buffer (default 10% extra)
      const requiredWithBuffer = requiredBytes * (1 + bufferPercentage / 100);

      const hasSpace = diskSpace.available >= requiredWithBuffer;

      if (!hasSpace) {
        const message = `Insufficient disk space. Need ${this.formatBytes(requiredWithBuffer)}, have ${this.formatBytes(diskSpace.available)}`;
        logger.warn(`[DiskSpace] ${message}`);
        return {
          hasSpace: false,
          available: diskSpace.available,
          required: requiredWithBuffer,
          message,
        };
      }

      logger.info(`[DiskSpace] Sufficient space available`, {
        available: this.formatBytes(diskSpace.available),
        required: this.formatBytes(requiredWithBuffer),
      });

      return {
        hasSpace: true,
        available: diskSpace.available,
        required: requiredWithBuffer,
      };
    } catch (error) {
      logger.error(`[DiskSpace] Error checking disk space`, { error });
      // Return true to not block downloads if we can't check
      return {
        hasSpace: true,
        available: 0,
        required: requiredBytes,
        message: 'Unable to check disk space',
      };
    }
  }

  /**
   * Format bytes to human-readable string
   */
  formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * Get low disk space warning threshold
   * Returns true if disk is running low (< 5% or < 1GB free)
   */
  async isLowDiskSpace(targetPath: string): Promise<boolean> {
    try {
      const diskSpace = await this.getDiskSpace(targetPath);
      const oneGB = 1024 * 1024 * 1024;

      return diskSpace.available < oneGB || diskSpace.percentUsed > 95;
    } catch (error) {
      logger.error(`[DiskSpace] Error checking low disk space`, { error });
      return false;
    }
  }

  /**
   * Estimate download size from video info
   * This is a rough estimate based on format and quality
   */
  estimateDownloadSize(format: string, quality: string, duration: number = 600): number {
    // Rough bitrates in MB per minute
    const bitrates: Record<string, Record<string, number>> = {
      mp4: {
        '2160p': 50, // 4K
        '1440p': 25, // 2K
        '1080p': 12,
        '720p': 6,
        '480p': 3,
        '360p': 1.5,
        best: 12, // Assume 1080p
      },
      webm: {
        '2160p': 40,
        '1440p': 20,
        '1080p': 10,
        '720p': 5,
        '480p': 2.5,
        '360p': 1.2,
        best: 10,
      },
      mp3: {
        high: 2,
        medium: 1.2,
        low: 0.8,
        best: 2,
      },
      m4a: {
        high: 1.5,
        medium: 1,
        low: 0.6,
        best: 1.5,
      },
    };

    const formatBitrates = bitrates[format.toLowerCase()] || bitrates.mp4;
    const bitrate = formatBitrates[quality] || formatBitrates.best || 10;

    // Convert duration from seconds to minutes
    const durationMinutes = duration / 60;

    // Calculate size in bytes (bitrate is in MB/min)
    const estimatedMB = bitrate * durationMinutes;
    const estimatedBytes = estimatedMB * 1024 * 1024;

    logger.debug(`[DiskSpace] Estimated download size`, {
      format,
      quality,
      duration,
      estimatedMB: estimatedMB.toFixed(2),
    });

    return Math.ceil(estimatedBytes);
  }
}

// Singleton instance
export const diskSpaceService = new DiskSpaceService();

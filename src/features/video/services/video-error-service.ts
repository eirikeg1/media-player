import { Alert } from 'react-native';
import type { VideoError, VideoErrorType, RawVideoError } from '../types/video-error.types';
import { getVideoErrorInfo, isRetryableError } from '../types/video-error.types';

export class VideoErrorService {
  /**
   * Process raw error and return enhanced error info
   */
  static processError(rawError: RawVideoError, retryAttempt: number = 0): VideoError {
    return getVideoErrorInfo(rawError, retryAttempt);
  }

  /**
   * Show error alert to user
   */
  static showErrorAlert(error: VideoError): void {
    Alert.alert(
      error.title,
      error.message + '\n\n' + error.suggestion,
      [{ text: 'OK' }]
    );
  }

  /**
   * Determine if error should trigger an alert
   */
  static shouldShowAlert(error: VideoError, retryAttempt: number, maxRetries: number): boolean {
    return !error.canRetry || retryAttempt >= maxRetries;
  }

  /**
   * Handle error with appropriate user feedback
   */
  static handleError(
    rawError: RawVideoError,
    retryAttempt: number = 0,
    maxRetries: number = 3
  ): VideoError {
    const enhancedError = this.processError(rawError, retryAttempt);

    if (this.shouldShowAlert(enhancedError, retryAttempt, maxRetries)) {
      this.showErrorAlert(enhancedError);
    }

    console.error('Video playback error:', rawError, 'Enhanced:', enhancedError);
    return enhancedError;
  }

  /**
   * Check if error type allows retries
   */
  static canRetryErrorType(errorType: VideoErrorType): boolean {
    return isRetryableError(errorType);
  }

  /**
   * Get user-friendly error category
   */
  static getErrorCategory(errorType: VideoErrorType): string {
    switch (errorType) {
      case 'NETWORK_ERROR':
        return 'Connection';
      case 'STREAM_UNAVAILABLE':
        return 'Content';
      case 'FORMAT_UNSUPPORTED':
        return 'Playback';
      case 'TIMEOUT':
        return 'Loading';
      case 'PERMISSION_DENIED':
        return 'Access';
      default:
        return 'Unknown';
    }
  }
}
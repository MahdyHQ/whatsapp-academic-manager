import json
import traceback
from loguru import logger
from typing import Any, Dict, Optional

class ErrorTracker:
    def __init__(self):
        # Configure loguru
        logger.remove()
        logger.add("logs/app.log", rotation="1 day", compression="zip", format="{time} {level} {message}", level="DEBUG")
        logger.add("logs/error.log", rotation="1 day", compression="zip", format="{time} {level} {message}", level="ERROR")

    def log_info(self, message: str, context: Optional[Dict[str, Any]] = None) -> None:
        """Log an informational message."""
        logger.info(self._format_message(message, context))

    def log_warning(self, message: str, context: Optional[Dict[str, Any]] = None) -> None:
        """Log a warning message."""
        logger.warning(self._format_message(message, context))

    def log_error(self, message: str, exception: Exception, context: Optional[Dict[str, Any]] = None, notify: bool = False) -> None:
        """Log an error message with exception details."""
        error_message = self._format_message(message, context)
        logger.error(f"{error_message} | Exception: {str(exception)} | Traceback: {traceback.format_exc()}")
        if notify:
            self._notify_error(error_message)

    def log_critical(self, message: str, exception: Exception, context: Optional[Dict[str, Any]] = None) -> None:
        """Log a critical error message with exception details."""
        error_message = self._format_message(message, context)
        logger.critical(f"{error_message} | Exception: {str(exception)} | Traceback: {traceback.format_exc()}")

    def log_api_request(self, method: str, endpoint: str, status_code: int, duration_ms: float, user_id: Optional[str] = None, error: Optional[str] = None) -> None:
        """Log details about an API request."""
        logger.info(json.dumps({
            "event": "api_request",
            "method": method,
            "endpoint": endpoint,
            "status_code": status_code,
            "duration_ms": duration_ms,
            "user_id": user_id,
            "error": error
        }))

    def log_whatsapp_event(self, event_type: str, account_id: str, group_id: str, message_id: str, status: str, error: Optional[str] = None) -> None:
        """Log details about a WhatsApp event."""
        logger.info(json.dumps({
            "event": "whatsapp_event",
            "event_type": event_type,
            "account_id": account_id,
            "group_id": group_id,
            "message_id": message_id,
            "status": status,
            "error": error
        }))

    def log_ai_analysis(self, provider: str, message_id: str, confidence: float, processing_time_ms: float, event_detected: str, error: Optional[str] = None) -> None:
        """Log details about AI analysis."""
        logger.info(json.dumps({
            "event": "ai_analysis",
            "provider": provider,
            "message_id": message_id,
            "confidence": confidence,
            "processing_time_ms": processing_time_ms,
            "event_detected": event_detected,
            "error": error
        }))

    def log_database_operation(self, operation: str, table: str, duration_ms: float, rows_affected: int, error: Optional[str] = None) -> None:
        """Log details about a database operation."""
        logger.info(json.dumps({
            "event": "database_operation",
            "operation": operation,
            "table": table,
            "duration_ms": duration_ms,
            "rows_affected": rows_affected,
            "error": error
        }))

    def _format_message(self, message: str, context: Optional[Dict[str, Any]]) -> str:
        """Format the log message with context."""
        if context:
            return f"{message} | Context: {json.dumps(context)}"
        return message

    def _notify_error(self, message: str) -> None:
        """Placeholder for error notification logic (e.g., send email, alert system)."""
        pass  # Implement notification logic here

# Example usage
if __name__ == "__main__":
    tracker = ErrorTracker()
    tracker.log_info("This is an info message.", context={"user": "alice"})
    tracker.log_warning("This is a warning message.")
    try:
        1 / 0
    except ZeroDivisionError as e:
        tracker.log_error("An error occurred.", exception=e, context={"operation": "division"}, notify=True)
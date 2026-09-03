export type ErrorDetails = unknown;

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: ErrorDetails;
  readonly isOperational: boolean;

  constructor(
    code: string,
    message: string,
    statusCode: number,
    details?: ErrorDetails,
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
  }
}

export class ValidationError extends AppError {
  constructor(message = "Request validation failed", details?: ErrorDetails) {
    super("VALIDATION_ERROR", message, 400, details);
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super("UNAUTHORIZED", message, 401);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action") {
    super("FORBIDDEN", message, 403);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super("RESOURCE_NOT_FOUND", message, 404);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message = "Resource conflict", details?: ErrorDetails) {
    super("CONFLICT", message, 409, details);
    this.name = "ConflictError";
  }
}

export class AccountInactiveError extends AppError {
  constructor(message = "Account is inactive") {
    super("ACCOUNT_INACTIVE", message, 403);
    this.name = "AccountInactiveError";
  }
}

export class NotImplementedError extends AppError {
  constructor(message = "This feature is not implemented") {
    super("NOT_IMPLEMENTED", message, 501);
    this.name = "NotImplementedError";
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = "This service is not available", code = "SERVICE_UNAVAILABLE") {
    super(code, message, 503);
    this.name = "ServiceUnavailableError";
  }
}

export class DatabaseError extends Error {
  constructor(message, cause) {
    super(message)
    this.name = 'DatabaseError'
    if (cause) this.cause = cause
  }
}

/** Raised when user input fails business validation. `errors` maps field → message. */
export class ValidationError extends Error {
  constructor(errors) {
    const messages = Object.values(errors)
    super(messages[0] || 'Please check the highlighted fields.')
    this.name = 'ValidationError'
    this.errors = errors
  }
}

export class NotFoundError extends Error {
  constructor(message) {
    super(message)
    this.name = 'NotFoundError'
  }
}

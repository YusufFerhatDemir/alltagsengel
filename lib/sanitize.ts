const MAX_MESSAGE_LENGTH = 2000
const MAX_INPUT_LENGTH = 500

export function sanitizeMessage(input: string): string {
  return input.trim().slice(0, MAX_MESSAGE_LENGTH)
}

export function sanitizeInput(input: string): string {
  return input.trim().slice(0, MAX_INPUT_LENGTH)
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200)
}
